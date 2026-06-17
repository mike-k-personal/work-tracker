// app/api/projects/[id]/route.ts
// Edit / delete a single project.
//
//   PATCH  -> edit name, archived, description, startDate, completedAt
//   DELETE -> remove the project AND cascade-delete its milestones
//
// Next 16: route `params` is async and must be awaited.

import { NextRequest, NextResponse } from "next/server";

import type { Project } from "@/lib/types";
import { updateProject, deleteProject } from "@/lib/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

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

  const patch: Partial<
    Pick<
      Project,
      "name" | "archived" | "description" | "startDate" | "completedAt"
    >
  > = {};
  if (typeof b.name === "string") patch.name = b.name;
  if (typeof b.archived === "boolean") patch.archived = b.archived;
  if (typeof b.description === "string") patch.description = b.description;
  if (b.startDate === null) patch.startDate = null;
  else if (
    typeof b.startDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(b.startDate)
  )
    patch.startDate = b.startDate;
  if (b.completedAt === null) patch.completedAt = null;
  else if (typeof b.completedAt === "number" && Number.isFinite(b.completedAt))
    patch.completedAt = b.completedAt;

  const updated = await updateProject(id, patch);
  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ project: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: Params,
): Promise<NextResponse> {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const removed = await deleteProject(id);
  if (!removed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
