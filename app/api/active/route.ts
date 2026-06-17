// app/api/active/route.ts
// The in-progress work OR break session.
//
//   GET    -> current ActiveSession | null
//   POST   -> start a new session (rejects if one is already active)
//   PATCH  -> action-based mutation:
//               pause | resume | extend(addMs) | heartbeat |
//               setObjectives(objectives) | startBreak(...) |
//               applyAway(choice) | end(endReason) -> returns the created log
//   DELETE -> cancel: finalize to a 'cancelled' log, clear active
//
// All timer transforms go through the pure helpers in lib/timer.

import { NextRequest, NextResponse } from "next/server";

import type {
  ActiveSession,
  EndReason,
  Objective,
  SessionKind,
} from "@/lib/types";
import {
  getActive,
  setActive,
  appendLog,
  getSettings,
  getProjects,
  getMilestones,
} from "@/lib/store";
import {
  pauseSession,
  resumeSession,
  extendSession,
  touchSession,
  applyAway,
  finalizeToLog,
  type AwayChoice,
} from "@/lib/timer";

export const dynamic = "force-dynamic";

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

function conflict(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 409 });
}

/** Coerce arbitrary input into a clean Objective[] (used for start/setObjectives). */
function normalizeObjectives(input: unknown, now: number): Objective[] {
  if (!Array.isArray(input)) return [];
  const out: Objective[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Partial<Objective> & { text?: unknown };
    const text =
      typeof o.text === "string" ? o.text : String(o.text ?? "").trim();
    if (typeof o.text !== "string" && !text) continue;
    out.push({
      id: typeof o.id === "string" && o.id ? o.id : crypto.randomUUID(),
      text: typeof o.text === "string" ? o.text : text,
      done: typeof o.done === "boolean" ? o.done : false,
      createdAt:
        typeof o.createdAt === "number" && Number.isFinite(o.createdAt)
          ? o.createdAt
          : now,
    });
  }
  return out;
}

function isEndReason(v: unknown): v is EndReason {
  return (
    v === "all-done" ||
    v === "manual" ||
    v === "cancelled" ||
    v === "timer-expired"
  );
}

// ----------------------------------------------------------------------------
// GET — current active session (or null)
// ----------------------------------------------------------------------------

export async function GET(): Promise<NextResponse> {
  const active = await getActive();
  return NextResponse.json({ active });
}

// ----------------------------------------------------------------------------
// POST — start a new session
//   body: { kind: 'work'|'break', taskName, objectives?, estimateMs }
// ----------------------------------------------------------------------------

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  const b = (body ?? {}) as {
    kind?: unknown;
    projectId?: unknown;
    milestoneId?: unknown;
    taskName?: unknown;
    objectives?: unknown;
    estimateMs?: unknown;
  };

  const kind: SessionKind = b.kind === "break" ? "break" : "work";
  const estimateMs =
    typeof b.estimateMs === "number" && Number.isFinite(b.estimateMs) && b.estimateMs > 0
      ? Math.floor(b.estimateMs)
      : 0;
  if (estimateMs <= 0) {
    return badRequest("estimateMs must be a positive number of milliseconds");
  }

  const existing = await getActive();
  if (existing) {
    return conflict("A session is already active");
  }

  // Resolve the project (work sessions only): look up the name so the session —
  // and later the log — carries a denormalized snapshot.
  let projectId: string | null = null;
  let projectName = "";
  if (kind === "work" && typeof b.projectId === "string" && b.projectId) {
    const project = (await getProjects()).find((p) => p.id === b.projectId);
    if (project) {
      projectId = project.id;
      projectName = project.name;
    }
  }

  // Resolve the milestone (work sessions only): must belong to the resolved
  // project; snapshot its title so logs survive a rename/removal.
  let milestoneId: string | null = null;
  let milestoneName = "";
  if (kind === "work" && projectId && typeof b.milestoneId === "string" && b.milestoneId) {
    const milestone = (await getMilestones()).find(
      (m) => m.id === b.milestoneId && m.projectId === projectId,
    );
    if (milestone) {
      milestoneId = milestone.id;
      milestoneName = milestone.title;
    }
  }

  const now = Date.now();
  const taskName =
    typeof b.taskName === "string" && b.taskName.trim()
      ? b.taskName.trim()
      : kind === "break"
        ? "Break"
        : "Focus";

  const session: ActiveSession = {
    id: crypto.randomUUID(),
    kind,
    projectId,
    projectName,
    milestoneId,
    milestoneName,
    taskName,
    objectives: kind === "work" ? normalizeObjectives(b.objectives, now) : [],
    status: "running",
    startedAt: now,
    accumulatedActiveMs: 0,
    runningSince: now,
    estimateMs,
    extensionsMs: 0,
    lastSeenAt: now,
  };

  await setActive(session);
  return NextResponse.json({ active: session }, { status: 201 });
}

// ----------------------------------------------------------------------------
// PATCH — action-based mutation
//   body: { action, ...args }
// ----------------------------------------------------------------------------

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  const b = (body ?? {}) as {
    action?: unknown;
    addMs?: unknown;
    objectives?: unknown;
    choice?: unknown;
    endReason?: unknown;
    taskName?: unknown;
    estimateMs?: unknown;
  };

  const action = typeof b.action === "string" ? b.action : "";
  if (!action) return badRequest("Missing action");

  const now = Date.now();
  const current = await getActive();

  // 'startBreak' transitions from an (ended) work session to a fresh break.
  // It does not require an existing active session — it replaces whatever is
  // there with a new break. Every other action requires an active session.
  if (action === "startBreak") {
    const estimateMs =
      typeof b.estimateMs === "number" &&
      Number.isFinite(b.estimateMs) &&
      b.estimateMs > 0
        ? Math.floor(b.estimateMs)
        : (await getSettings()).defaultBreakMin * 60_000;
    const taskName =
      typeof b.taskName === "string" && b.taskName.trim()
        ? b.taskName.trim()
        : "Break";
    const breakSession: ActiveSession = {
      id: crypto.randomUUID(),
      kind: "break",
      projectId: null,
      projectName: "",
      milestoneId: null,
      milestoneName: "",
      taskName,
      objectives: [],
      status: "running",
      startedAt: now,
      accumulatedActiveMs: 0,
      runningSince: now,
      estimateMs,
      extensionsMs: 0,
      lastSeenAt: now,
    };
    await setActive(breakSession);
    return NextResponse.json({ active: breakSession });
  }

  if (!current) {
    return conflict("No active session");
  }

  switch (action) {
    case "pause": {
      const next = pauseSession(current, now);
      await setActive(next);
      return NextResponse.json({ active: next });
    }
    case "resume": {
      const next = resumeSession(current, now);
      await setActive(next);
      return NextResponse.json({ active: next });
    }
    case "extend": {
      const addMs =
        typeof b.addMs === "number" && Number.isFinite(b.addMs) && b.addMs > 0
          ? Math.floor(b.addMs)
          : 0;
      if (addMs <= 0) return badRequest("extend requires a positive addMs");
      const next = extendSession(current, addMs);
      await setActive(next);
      return NextResponse.json({ active: next });
    }
    case "heartbeat": {
      const next = touchSession(current, now);
      await setActive(next);
      return NextResponse.json({ active: next });
    }
    case "setObjectives": {
      const objectives = normalizeObjectives(b.objectives, now);
      const next: ActiveSession = { ...current, objectives, lastSeenAt: now };
      await setActive(next);
      return NextResponse.json({ active: next });
    }
    case "applyAway": {
      const choice: AwayChoice = b.choice === "discard" ? "discard" : "work";
      const next = applyAway(current, choice, now);
      await setActive(next);
      return NextResponse.json({ active: next });
    }
    case "end": {
      const endReason: EndReason = isEndReason(b.endReason)
        ? b.endReason
        : "manual";
      const finalReason: EndReason =
        endReason === "cancelled" ? "manual" : endReason;
      const log = finalizeToLog(current, now, finalReason);
      await appendLog(log);
      await setActive(null);
      return NextResponse.json({ active: null, log });
    }
    default:
      return badRequest(`Unknown action: ${action}`);
  }
}

// ----------------------------------------------------------------------------
// DELETE — cancel: finalize to a 'cancelled' log, clear active
// ----------------------------------------------------------------------------

export async function DELETE(): Promise<NextResponse> {
  const current = await getActive();
  if (!current) {
    return NextResponse.json({ active: null, log: null });
  }
  const now = Date.now();
  const log = finalizeToLog(current, now, "cancelled");
  await appendLog(log);
  await setActive(null);
  return NextResponse.json({ active: null, log });
}
