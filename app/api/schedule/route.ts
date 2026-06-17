// app/api/schedule/route.ts
// The conceptual schedule (work/off day-types + two block templates + per-date
// overrides).
//
//   GET -> { schedule: Schedule }
//   PUT -> replace dayTypes, templates (work/off), and/or overrides (whichever
//          keys are provided; templates merge per-side so you can save just one)

import { NextRequest, NextResponse } from "next/server";

import type { Schedule } from "@/lib/types";
import {
  getSchedule,
  setSchedule,
  normalizeBlocks,
  normalizeBlockMap,
  normalizeDayTypes,
} from "@/lib/store";

export const dynamic = "force-dynamic";

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export async function GET(): Promise<NextResponse> {
  const schedule = await getSchedule();
  return NextResponse.json({ schedule });
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const b = (body ?? {}) as {
    dayTypes?: unknown;
    templates?: unknown;
    overrides?: unknown;
  };

  const current = await getSchedule();

  // Templates merge per-side, so a client can persist just `work` or just `off`
  // without clobbering the other.
  const templatesInput = isObject(b.templates) ? b.templates : null;
  const templates =
    b.templates !== undefined && templatesInput
      ? {
          work:
            "work" in templatesInput
              ? normalizeBlocks(templatesInput.work)
              : current.templates.work,
          off:
            "off" in templatesInput
              ? normalizeBlocks(templatesInput.off)
              : current.templates.off,
        }
      : current.templates;

  const next: Schedule = {
    dayTypes:
      b.dayTypes !== undefined
        ? normalizeDayTypes(b.dayTypes)
        : current.dayTypes,
    templates,
    overrides:
      b.overrides !== undefined
        ? normalizeBlockMap(b.overrides)
        : current.overrides,
  };

  await setSchedule(next);
  return NextResponse.json({ schedule: next });
}
