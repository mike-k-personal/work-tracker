// app/api/logs/route.ts
// History list of completed/cancelled sessions.
//
//   GET -> { logs: LogEntry[] }
//
// Per-entry edit/delete live in app/api/logs/[id]/route.ts.

import { NextResponse } from "next/server";

import { getLogs } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const logs = await getLogs();
  return NextResponse.json({ logs });
}
