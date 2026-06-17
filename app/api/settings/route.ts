// app/api/settings/route.ts
// App-wide settings.
//
//   GET -> { settings: Settings }
//   PUT -> merge the provided fields onto current settings

import { NextRequest, NextResponse } from "next/server";

import type { Settings } from "@/lib/types";
import { getSettings, setSettings } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const settings = await getSettings();
  return NextResponse.json({ settings });
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const b = (body ?? {}) as Partial<Settings>;

  const current = await getSettings();
  const next: Settings = { ...current };

  if (typeof b.defaultWorkMin === "number" && Number.isFinite(b.defaultWorkMin))
    next.defaultWorkMin = Math.max(1, Math.floor(b.defaultWorkMin));
  if (
    typeof b.defaultBreakMin === "number" &&
    Number.isFinite(b.defaultBreakMin)
  )
    next.defaultBreakMin = Math.max(1, Math.floor(b.defaultBreakMin));
  if (typeof b.notificationsEnabled === "boolean")
    next.notificationsEnabled = b.notificationsEnabled;
  if (typeof b.soundEnabled === "boolean") next.soundEnabled = b.soundEnabled;

  await setSettings(next);
  return NextResponse.json({ settings: next });
}
