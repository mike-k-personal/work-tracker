// app/api/reset/route.ts
// Purge ALL data and start fresh: overwrites every key with typed defaults
// (no active session, no logs, no projects/milestones, default schedule +
// settings). Single-user app, so this is a hard, irreversible wipe.
//
//   POST -> { ok: true }

import { NextResponse } from "next/server";

import { setAll, defaultDoc } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  await setAll(defaultDoc());
  return NextResponse.json({ ok: true });
}
