// app/api/milestones/route.ts
// Milestones (objectives): the dated checkpoints inside a project.
//
//   GET  -> { milestones: Milestone[] }   (optional ?projectId= filter)
//   POST -> create { projectId, title, targetDate? } -> { milestone }

import { NextRequest, NextResponse } from "next/server";

import { getMilestones, addMilestone, getProjects } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const projectId = req.nextUrl.searchParams.get("projectId");
  const milestones = await getMilestones();
  return NextResponse.json({
    milestones: projectId
      ? milestones.filter((m) => m.projectId === projectId)
      : milestones,
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const b = (body ?? {}) as {
    projectId?: unknown;
    title?: unknown;
    targetDate?: unknown;
  };

  const projectId = typeof b.projectId === "string" ? b.projectId : "";
  const title = typeof b.title === "string" ? b.title.trim() : "";
  if (!projectId) {
    return NextResponse.json({ error: "A projectId is required" }, { status: 400 });
  }
  if (!title) {
    return NextResponse.json({ error: "A milestone title is required" }, { status: 400 });
  }

  const project = (await getProjects()).find((p) => p.id === projectId);
  if (!project) {
    return NextResponse.json({ error: "Unknown project" }, { status: 404 });
  }

  const targetDate =
    typeof b.targetDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.targetDate)
      ? b.targetDate
      : null;

  const milestone = await addMilestone({ projectId, title, targetDate });
  return NextResponse.json({ milestone }, { status: 201 });
}
