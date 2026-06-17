// app/api/milestones/[id]/route.ts
// Edit / delete a single milestone.
//
//   PATCH  -> edit title, targetDate, done, order
//   DELETE -> remove one milestone
//
// Next 16: route `params` is async and must be awaited.

import { NextRequest, NextResponse } from "next/server";

import type { Milestone } from "@/lib/types";
import { updateMilestone, deleteMilestone } from "@/lib/store";

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
    Pick<Milestone, "title" | "targetDate" | "done" | "order">
  > = {};
  if (typeof b.title === "string") patch.title = b.title;
  if (typeof b.done === "boolean") patch.done = b.done;
  if (typeof b.order === "number" && Number.isFinite(b.order))
    patch.order = b.order;
  if (b.targetDate === null) patch.targetDate = null;
  else if (
    typeof b.targetDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(b.targetDate)
  )
    patch.targetDate = b.targetDate;

  const updated = await updateMilestone(id, patch);
  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ milestone: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: Params,
): Promise<NextResponse> {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const removed = await deleteMilestone(id);
  if (!removed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
