// lib/schedule.ts
// Pure schedule resolution. The schedule is a *guide only* — it never starts or
// stops anything; these helpers just tell the UI "what should be happening now"
// and "when the next boundary is".

import type { Block, DayType, Schedule } from "@/lib/types";
import { dayKey, hhmmToMinutes } from "@/lib/format";

/** Local "YYYY-MM-DD" key for a Date (or now). */
export function dayKeyForDate(date: Date = new Date()): string {
  return dayKey(date.getTime());
}

/**
 * Default day-type classification: Mon–Fri are work days, Sat/Sun are off days.
 * Used as the fallback whenever a schedule omits a day.
 */
export function defaultDayTypes(): Record<number, DayType> {
  return { 0: "off", 1: "work", 2: "work", 3: "work", 4: "work", 5: "work", 6: "off" };
}

/** The day-type (work/off) that applies to `date`, falling back to the default. */
export function dayTypeForDate(schedule: Schedule, date: Date): DayType {
  const dow = date.getDay(); // 0=Sun..6=Sat
  const t = schedule.dayTypes?.[dow];
  return t === "off" || t === "work" ? t : defaultDayTypes()[dow];
}

/** Sort blocks by start time (ascending), then end time. Returns a new array. */
function sortBlocks(blocks: Block[]): Block[] {
  return [...blocks].sort((a, b) => {
    const sa = hhmmToMinutes(a.start);
    const sb = hhmmToMinutes(b.start);
    if (sa !== sb) return sa - sb;
    return hhmmToMinutes(a.end) - hhmmToMinutes(b.end);
  });
}

/**
 * The effective blocks for a date: a per-date override if present, else the
 * template (work or off) matching the date's day-type. Always sorted by start.
 */
export function effectiveBlocks(schedule: Schedule, date: Date): Block[] {
  const key = dayKeyForDate(date);
  if (schedule.overrides && key in schedule.overrides) {
    return sortBlocks(schedule.overrides[key] ?? []);
  }
  const type = dayTypeForDate(schedule, date);
  const template =
    type === "off" ? schedule.templates?.off : schedule.templates?.work;
  return sortBlocks(template ?? []);
}

/** Minutes since local midnight for an epoch timestamp. */
function minutesOfDay(now: number): number {
  const d = new Date(now);
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

/**
 * The block containing `now` (by local time-of-day), or null if none.
 * Blocks are treated as [start, end). If blocks overlap, the first match wins
 * (blocks should be sorted by start).
 */
export function currentBlock(blocks: Block[], now: number): Block | null {
  const mins = minutesOfDay(now);
  for (const b of sortBlocks(blocks)) {
    const start = hhmmToMinutes(b.start);
    const end = hhmmToMinutes(b.end);
    if (mins >= start && mins < end) return b;
  }
  return null;
}

export type Transition = {
  /** Local epoch-ms when the transition occurs (today). */
  at: number;
  /** The block that begins at this transition, if any (gap => null). */
  block: Block | null;
  /** Whether this boundary is a block start or a block end (gap begins). */
  kind: "start" | "end";
};

/**
 * The next block boundary strictly after `now` (today only).
 *
 * Considers every block start and end; returns the earliest one in the future
 * with the block that begins there (for a start) or null (when a block ends into
 * a gap). Returns null if there are no more boundaries today.
 */
export function nextTransition(blocks: Block[], now: number): Transition | null {
  const sorted = sortBlocks(blocks);
  const base = new Date(now);
  const midnight = new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate(),
    0,
    0,
    0,
    0,
  ).getTime();
  const nowMins = minutesOfDay(now);

  type Boundary = { mins: number; block: Block | null; kind: "start" | "end" };
  const boundaries: Boundary[] = [];
  for (const b of sorted) {
    boundaries.push({ mins: hhmmToMinutes(b.start), block: b, kind: "start" });
    boundaries.push({ mins: hhmmToMinutes(b.end), block: null, kind: "end" });
  }
  boundaries.sort((a, b) => a.mins - b.mins);

  for (const bnd of boundaries) {
    if (bnd.mins > nowMins) {
      // If a start and an end coincide, prefer the start (a new block begins).
      const start = boundaries.find(
        (x) => x.mins === bnd.mins && x.kind === "start",
      );
      const chosen = start ?? bnd;
      return {
        at: midnight + Math.round(chosen.mins * 60_000),
        block: chosen.block,
        kind: chosen.kind,
      };
    }
  }
  return null;
}
