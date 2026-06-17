// app/api/backup/route.ts
// Full-data export / import (safety net + manual device transfer).
//
//   GET  -> the full Doc as a JSON file download
//   POST -> validate shape, then setAll (overwrites everything)

import { NextRequest, NextResponse } from "next/server";

import type {
  Doc,
  LogEntry,
  Milestone,
  Objective,
  Project,
  Settings,
} from "@/lib/types";
import {
  getAll,
  setAll,
  defaultSettings,
  normalizeSchedule,
} from "@/lib/store";

export const dynamic = "force-dynamic";

// ----------------------------------------------------------------------------
// GET — export
// ----------------------------------------------------------------------------

export async function GET(): Promise<NextResponse> {
  const doc = await getAll();
  const body = JSON.stringify(doc, null, 2);
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="work-tracker-backup-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}

// ----------------------------------------------------------------------------
// POST — import (validate then overwrite)
// ----------------------------------------------------------------------------

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function normalizeObjectives(input: unknown): Objective[] {
  if (!Array.isArray(input)) return [];
  const now = Date.now();
  const out: Objective[] = [];
  for (const raw of input) {
    if (!isObject(raw)) continue;
    out.push({
      id: typeof raw.id === "string" && raw.id ? raw.id : crypto.randomUUID(),
      text: typeof raw.text === "string" ? raw.text : String(raw.text ?? ""),
      done: typeof raw.done === "boolean" ? raw.done : false,
      createdAt:
        typeof raw.createdAt === "number" && Number.isFinite(raw.createdAt)
          ? raw.createdAt
          : now,
    });
  }
  return out;
}

function normalizeLogs(input: unknown): LogEntry[] {
  if (!Array.isArray(input)) return [];
  const out: LogEntry[] = [];
  for (const raw of input) {
    if (!isObject(raw)) continue;
    const kind = raw.kind === "break" ? "break" : "work";
    const status = raw.status === "cancelled" ? "cancelled" : "completed";
    const objectives = normalizeObjectives(raw.objectives);
    const endReason =
      raw.endReason === "all-done" ||
      raw.endReason === "manual" ||
      raw.endReason === "cancelled" ||
      raw.endReason === "timer-expired"
        ? raw.endReason
        : "manual";
    const num = (v: unknown): number =>
      typeof v === "number" && Number.isFinite(v) ? v : 0;
    out.push({
      id: typeof raw.id === "string" && raw.id ? raw.id : crypto.randomUUID(),
      kind,
      projectId:
        typeof raw.projectId === "string" && raw.projectId
          ? raw.projectId
          : null,
      projectName:
        typeof raw.projectName === "string" ? raw.projectName : "",
      milestoneId:
        typeof raw.milestoneId === "string" && raw.milestoneId
          ? raw.milestoneId
          : null,
      milestoneName:
        typeof raw.milestoneName === "string" ? raw.milestoneName : "",
      taskName:
        typeof raw.taskName === "string" ? raw.taskName : String(raw.taskName ?? ""),
      objectives,
      status,
      startedAt: num(raw.startedAt),
      endedAt: num(raw.endedAt),
      activeMs: num(raw.activeMs),
      estimateMs: num(raw.estimateMs),
      extensionsMs: num(raw.extensionsMs),
      objectivesTotal:
        typeof raw.objectivesTotal === "number"
          ? raw.objectivesTotal
          : objectives.length,
      objectivesCompleted:
        typeof raw.objectivesCompleted === "number"
          ? raw.objectivesCompleted
          : objectives.filter((o) => o.done).length,
      endReason,
    });
  }
  return out;
}

function normalizeProjects(input: unknown): Project[] {
  if (!Array.isArray(input)) return [];
  const now = Date.now();
  const out: Project[] = [];
  for (const raw of input) {
    if (!isObject(raw)) continue;
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (!name) continue;
    out.push({
      id: typeof raw.id === "string" && raw.id ? raw.id : crypto.randomUUID(),
      name,
      createdAt:
        typeof raw.createdAt === "number" && Number.isFinite(raw.createdAt)
          ? raw.createdAt
          : now,
      ...(raw.archived === true ? { archived: true } : {}),
      ...(typeof raw.description === "string"
        ? { description: raw.description }
        : {}),
      ...(typeof raw.startDate === "string"
        ? { startDate: raw.startDate }
        : {}),
      ...(typeof raw.completedAt === "number" && Number.isFinite(raw.completedAt)
        ? { completedAt: raw.completedAt }
        : {}),
    });
  }
  return out;
}

function normalizeMilestones(input: unknown): Milestone[] {
  if (!Array.isArray(input)) return [];
  const now = Date.now();
  const out: Milestone[] = [];
  for (const raw of input) {
    if (!isObject(raw)) continue;
    const title = typeof raw.title === "string" ? raw.title.trim() : "";
    const projectId =
      typeof raw.projectId === "string" ? raw.projectId : "";
    if (!title || !projectId) continue;
    const done = raw.done === true;
    out.push({
      id: typeof raw.id === "string" && raw.id ? raw.id : crypto.randomUUID(),
      projectId,
      title,
      done,
      doneAt:
        typeof raw.doneAt === "number" && Number.isFinite(raw.doneAt)
          ? raw.doneAt
          : done && typeof raw.createdAt === "number"
            ? raw.createdAt
            : null,
      targetDate:
        typeof raw.targetDate === "string" && raw.targetDate
          ? raw.targetDate
          : null,
      order:
        typeof raw.order === "number" && Number.isFinite(raw.order)
          ? raw.order
          : out.length,
      createdAt:
        typeof raw.createdAt === "number" && Number.isFinite(raw.createdAt)
          ? raw.createdAt
          : now,
    });
  }
  return out;
}

function normalizeSettings(input: unknown): Settings {
  const base = defaultSettings();
  if (!isObject(input)) return base;
  return {
    defaultWorkMin:
      typeof input.defaultWorkMin === "number" &&
      Number.isFinite(input.defaultWorkMin)
        ? Math.max(1, Math.floor(input.defaultWorkMin))
        : base.defaultWorkMin,
    defaultBreakMin:
      typeof input.defaultBreakMin === "number" &&
      Number.isFinite(input.defaultBreakMin)
        ? Math.max(1, Math.floor(input.defaultBreakMin))
        : base.defaultBreakMin,
    notificationsEnabled:
      typeof input.notificationsEnabled === "boolean"
        ? input.notificationsEnabled
        : base.notificationsEnabled,
    soundEnabled:
      typeof input.soundEnabled === "boolean"
        ? input.soundEnabled
        : base.soundEnabled,
  };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isObject(body)) {
    return NextResponse.json(
      { error: "Backup must be a JSON object" },
      { status: 400 },
    );
  }

  // Require at least one of the recognized top-level keys to avoid wiping data
  // from an obviously-wrong file.
  const hasShape =
    "logs" in body ||
    "projects" in body ||
    "schedule" in body ||
    "settings" in body ||
    "active" in body;
  if (!hasShape) {
    return NextResponse.json(
      {
        error:
          "Unrecognized backup shape (no logs/projects/schedule/settings/active)",
      },
      { status: 400 },
    );
  }

  const doc: Doc = {
    active: null, // never restore an in-progress session from a backup
    logs: normalizeLogs(body.logs),
    projects: normalizeProjects(body.projects),
    milestones: normalizeMilestones(body.milestones),
    schedule: normalizeSchedule(body.schedule),
    settings: normalizeSettings(body.settings),
  };

  await setAll(doc);
  return NextResponse.json({ ok: true, doc });
}
