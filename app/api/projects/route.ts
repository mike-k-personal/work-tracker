// app/api/projects/route.ts
// Projects: the top-level grouping for work sessions.
//
//   GET  -> { projects: Project[] }
//   POST -> create a project { name } -> { project } (idempotent on name)

import { NextRequest, NextResponse } from "next/server";

import { getProjects, addProject } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const projects = await getProjects();
  return NextResponse.json({ projects });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const name =
    body && typeof body === "object" && typeof (body as { name?: unknown }).name === "string"
      ? (body as { name: string }).name.trim()
      : "";
  if (!name) {
    return NextResponse.json(
      { error: "A project name is required" },
      { status: 400 },
    );
  }
  const project = await addProject(name);
  return NextResponse.json({ project }, { status: 201 });
}
