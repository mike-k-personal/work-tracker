// app/api/logs/[id]/route.ts
// Edit / delete a single history entry.
//
//   PATCH  -> edit allowed fields (taskName, objectives, times, status, ...)
//   DELETE -> remove one entry
//
// Next 16: route `params` is async and must be awaited.

import { NextRequest, NextResponse } from "next/server";

import type { LogEntry, LogStatus, Objective } from "@/lib/types";
import { updateLog, deleteLog, getProjects } from "@/lib/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function isStatus(v: unknown): v is LogStatus {
  return v === "completed" || v === "cancelled";
}

/** Coerce arbitrary input into a clean Objective[]. */
function normalizeObjectives(input: unknown): Objective[] {
  if (!Array.isArray(input)) return [];
  const now = Date.now();
  const out: Objective[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Partial<Objective>;
    out.push({
      id: typeof o.id === "string" && o.id ? o.id : crypto.randomUUID(),
      text: typeof o.text === "string" ? o.text : String(o.text ?? ""),
      done: typeof o.done === "boolean" ? o.done : false,
      createdAt:
        typeof o.createdAt === "number" && Number.isFinite(o.createdAt)
          ? o.createdAt
          : now,
    });
  }
  return out;
}

// ----------------------------------------------------------------------------
// PATCH — edit an entry
// ----------------------------------------------------------------------------

export async function PATCH(
  req: NextRequest,
  { params }: Params,
): Promise<NextResponse> {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;

  // Whitelist editable fields only. `id` and denormalized counts are derived.
  const patch: Partial<LogEntry> = {};

  if (typeof b.taskName === "string") patch.taskName = b.taskName;
  if (b.kind === "work" || b.kind === "break") patch.kind = b.kind;
  if (isStatus(b.status)) patch.status = b.status;

  // Reassign the project (null clears it). Keep the denormalized name in sync
  // with the current projects list.
  if (b.projectId === null || typeof b.projectId === "string") {
    const pid =
      typeof b.projectId === "string" && b.projectId ? b.projectId : null;
    patch.projectId = pid;
    if (pid) {
      const project = (await getProjects()).find((p) => p.id === pid);
      patch.projectName = project
        ? project.name
        : typeof b.projectName === "string"
          ? b.projectName
          : "";
    } else {
      patch.projectName = "";
    }
  }

  if (typeof b.startedAt === "number" && Number.isFinite(b.startedAt))
    patch.startedAt = b.startedAt;
  if (typeof b.endedAt === "number" && Number.isFinite(b.endedAt))
    patch.endedAt = b.endedAt;
  if (typeof b.activeMs === "number" && Number.isFinite(b.activeMs))
    patch.activeMs = Math.max(0, b.activeMs);
  if (typeof b.estimateMs === "number" && Number.isFinite(b.estimateMs))
    patch.estimateMs = Math.max(0, b.estimateMs);
  if (typeof b.extensionsMs === "number" && Number.isFinite(b.extensionsMs))
    patch.extensionsMs = Math.max(0, b.extensionsMs);

  if (Array.isArray(b.objectives)) {
    const objectives = normalizeObjectives(b.objectives);
    patch.objectives = objectives;
    // Keep denormalized counts in sync with the edited objectives.
    patch.objectivesTotal = objectives.length;
    patch.objectivesCompleted = objectives.filter((o) => o.done).length;
  }

  const updated = await updateLog(id, patch);
  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ log: updated });
}

// ----------------------------------------------------------------------------
// DELETE — remove an entry
// ----------------------------------------------------------------------------

export async function DELETE(
  _req: NextRequest,
  { params }: Params,
): Promise<NextResponse> {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const removed = await deleteLog(id);
  if (!removed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
