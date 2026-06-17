// lib/metrics.ts
// Pure aggregations over LogEntry[]. No I/O.
//
// Productivity metrics EXCLUDE cancelled sessions (status === 'cancelled').
// Time ranges are computed in the LOCAL timezone (consistent with format.dayKey).

import type { LogEntry, Schedule } from "@/lib/types";
import { dayKey } from "@/lib/format";
import { effectiveBlocks } from "@/lib/schedule";
import { hhmmToMinutes } from "@/lib/format";

export type Range = "today" | "week" | "all";

/** Logs that count toward productivity metrics (cancelled excluded). */
export function countedLogs(logs: LogEntry[]): LogEntry[] {
  return logs.filter((l) => l.status !== "cancelled");
}

function isWork(l: LogEntry): boolean {
  return l.kind === "work";
}

function isBreak(l: LogEntry): boolean {
  return l.kind === "break";
}

// ----------------------------------------------------------------------------
// Range helpers (local time)
// ----------------------------------------------------------------------------

function startOfLocalDay(epoch: number): number {
  const d = new Date(epoch);
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    0,
    0,
    0,
    0,
  ).getTime();
}

/** Inclusive lower-bound epoch for a range, anchored at `now`. */
export function rangeStart(range: Range, now: number): number {
  if (range === "all") return -Infinity;
  const todayStart = startOfLocalDay(now);
  if (range === "today") return todayStart;
  // 'week' => last 7 local days (today + previous 6).
  return todayStart - 6 * 24 * 60 * 60 * 1000;
}

/** Filter logs to a range by their startedAt. */
export function logsInRange(
  logs: LogEntry[],
  range: Range,
  now: number = Date.now(),
): LogEntry[] {
  const from = rangeStart(range, now);
  if (from === -Infinity) return logs;
  return logs.filter((l) => l.startedAt >= from);
}

// ----------------------------------------------------------------------------
// Core metrics
// ----------------------------------------------------------------------------

/** Total focus (work, active) ms in a range. Cancelled excluded. */
export function totalFocusMs(
  logs: LogEntry[],
  range: Range = "all",
  now: number = Date.now(),
): number {
  return logsInRange(countedLogs(logs), range, now)
    .filter(isWork)
    .reduce((sum, l) => sum + Math.max(0, l.activeMs), 0);
}

/** Total explicitly-logged break ms in a range. Cancelled excluded. */
export function totalBreakMs(
  logs: LogEntry[],
  range: Range = "all",
  now: number = Date.now(),
): number {
  return logsInRange(countedLogs(logs), range, now)
    .filter(isBreak)
    .reduce((sum, l) => sum + Math.max(0, l.activeMs), 0);
}

/** Count of completed work sessions in a range. */
export function sessionsCompleted(
  logs: LogEntry[],
  range: Range = "all",
  now: number = Date.now(),
): number {
  return logsInRange(countedLogs(logs), range, now).filter(
    (l) => isWork(l) && l.status === "completed",
  ).length;
}

/** Count of completed objectives across counted work sessions in a range. */
export function objectivesCompleted(
  logs: LogEntry[],
  range: Range = "all",
  now: number = Date.now(),
): number {
  return logsInRange(countedLogs(logs), range, now)
    .filter(isWork)
    .reduce((sum, l) => sum + l.objectivesCompleted, 0);
}

/** Total objectives across counted work sessions in a range. */
export function objectivesTotal(
  logs: LogEntry[],
  range: Range = "all",
  now: number = Date.now(),
): number {
  return logsInRange(countedLogs(logs), range, now)
    .filter(isWork)
    .reduce((sum, l) => sum + l.objectivesTotal, 0);
}

/** Ratio of completed objectives to total objectives (0..1). 0 when none. */
export function objectiveCompletionRate(
  logs: LogEntry[],
  range: Range = "all",
  now: number = Date.now(),
): number {
  const total = objectivesTotal(logs, range, now);
  if (total === 0) return 0;
  return objectivesCompleted(logs, range, now) / total;
}

export type DayActivity = {
  dayKey: string;
  focusMs: number;
  breakMs: number;
};

/**
 * Per-day focus & explicit-break ms, sorted ascending by day key.
 * Only days that have at least one counted log appear.
 */
export function perDayActivity(logs: LogEntry[]): DayActivity[] {
  const map = new Map<string, DayActivity>();
  for (const l of countedLogs(logs)) {
    const key = dayKey(l.startedAt);
    let entry = map.get(key);
    if (!entry) {
      entry = { dayKey: key, focusMs: 0, breakMs: 0 };
      map.set(key, entry);
    }
    if (isWork(l)) entry.focusMs += Math.max(0, l.activeMs);
    else if (isBreak(l)) entry.breakMs += Math.max(0, l.activeMs);
  }
  return [...map.values()].sort((a, b) =>
    a.dayKey < b.dayKey ? -1 : a.dayKey > b.dayKey ? 1 : 0,
  );
}

/**
 * Consecutive-day streak (counting back from today) of days with any completed
 * work session. Returns 0 if today and yesterday both have none.
 */
export function currentStreak(
  logs: LogEntry[],
  now: number = Date.now(),
): number {
  const workDays = new Set<string>();
  for (const l of countedLogs(logs)) {
    if (isWork(l) && l.status === "completed") workDays.add(dayKey(l.startedAt));
  }
  if (workDays.size === 0) return 0;

  let streak = 0;
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);

  // Allow the streak to be "alive" if today has no work yet but yesterday does.
  const todayKey = dayKey(cursor.getTime());
  if (!workDays.has(todayKey)) {
    cursor.setDate(cursor.getDate() - 1);
    if (!workDays.has(dayKey(cursor.getTime()))) return 0;
  }

  // Count back while consecutive days have work.
  for (;;) {
    const key = dayKey(cursor.getTime());
    if (workDays.has(key)) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

export type EstimateAccuracy = {
  /** Mean of (activeMs / originalEstimateMs) across counted work sessions. */
  ratio: number;
  /** Average signed percentage over/under estimate (positive = over). */
  avgOverUnderPct: number;
  /** How many sessions contributed (estimate > 0). */
  sampleSize: number;
};

/**
 * Estimate accuracy vs the ORIGINAL estimate (not estimate + extensions).
 * Only counted work sessions with a positive estimate contribute.
 */
export function estimateAccuracy(
  logs: LogEntry[],
  range: Range = "all",
  now: number = Date.now(),
): EstimateAccuracy {
  const sample = logsInRange(countedLogs(logs), range, now).filter(
    (l) => isWork(l) && l.estimateMs > 0,
  );
  if (sample.length === 0) {
    return { ratio: 0, avgOverUnderPct: 0, sampleSize: 0 };
  }
  let ratioSum = 0;
  let pctSum = 0;
  for (const l of sample) {
    const r = l.activeMs / l.estimateMs;
    ratioSum += r;
    pctSum += (r - 1) * 100;
  }
  return {
    ratio: ratioSum / sample.length,
    avgOverUnderPct: pctSum / sample.length,
    sampleSize: sample.length,
  };
}

/** Average active ms of counted work sessions in a range (0 if none). */
export function avgSessionMs(
  logs: LogEntry[],
  range: Range = "all",
  now: number = Date.now(),
): number {
  const sample = logsInRange(countedLogs(logs), range, now).filter(isWork);
  if (sample.length === 0) return 0;
  const total = sample.reduce((s, l) => s + Math.max(0, l.activeMs), 0);
  return total / sample.length;
}

/** Median active ms of counted work sessions in a range (0 if none). */
export function medianSessionMs(
  logs: LogEntry[],
  range: Range = "all",
  now: number = Date.now(),
): number {
  const vals = logsInRange(countedLogs(logs), range, now)
    .filter(isWork)
    .map((l) => Math.max(0, l.activeMs))
    .sort((a, b) => a - b);
  if (vals.length === 0) return 0;
  const mid = Math.floor(vals.length / 2);
  return vals.length % 2 === 0 ? (vals[mid - 1] + vals[mid]) / 2 : vals[mid];
}

export type MostProductiveHour = {
  /** Local hour 0..23, or null if no data. */
  hour: number | null;
  /** Focus ms attributed to that hour. */
  focusMs: number;
};

/**
 * The local hour-of-day (0..23) with the most focus time. Each session is
 * attributed to the local hour of its startedAt (simple, cheap heuristic).
 */
export function mostProductiveHour(
  logs: LogEntry[],
  range: Range = "all",
  now: number = Date.now(),
): MostProductiveHour {
  const byHour = new Array<number>(24).fill(0);
  for (const l of logsInRange(countedLogs(logs), range, now)) {
    if (!isWork(l)) continue;
    const hour = new Date(l.startedAt).getHours();
    byHour[hour] += Math.max(0, l.activeMs);
  }
  let best: number | null = null;
  let bestMs = 0;
  for (let h = 0; h < 24; h++) {
    if (byHour[h] > bestMs) {
      bestMs = byHour[h];
      best = h;
    }
  }
  return { hour: best, focusMs: bestMs };
}

export type WorkBreakRatio = {
  workMs: number;
  breakMs: number;
  /** workMs / breakMs; Infinity when breakMs is 0 but workMs > 0; 0 otherwise. */
  ratio: number;
};

/** Work-to-break ratio over explicitly logged time in a range. */
export function workBreakRatio(
  logs: LogEntry[],
  range: Range = "all",
  now: number = Date.now(),
): WorkBreakRatio {
  const workMs = totalFocusMs(logs, range, now);
  const breakMs = totalBreakMs(logs, range, now);
  let ratio: number;
  if (breakMs === 0) ratio = workMs > 0 ? Infinity : 0;
  else ratio = workMs / breakMs;
  return { workMs, breakMs, ratio };
}

export type ProjectTime = {
  projectId: string | null; // null bucket = sessions with no project
  name: string;
  focusMs: number;
  sessionCount: number;
};

/**
 * Focus time grouped by project over counted work sessions in a range. Sessions
 * with no project fall into the `projectId: null` bucket ("No project").
 *
 * `nameById` resolves the CURRENT display name for a project id (so renames are
 * reflected); it falls back to the log's denormalized `projectName` snapshot,
 * then a generic label. Sorted by focus time descending.
 */
export function timeByProject(
  logs: LogEntry[],
  nameById: Map<string, string>,
  range: Range = "all",
  now: number = Date.now(),
): ProjectTime[] {
  const map = new Map<string, ProjectTime>();
  for (const l of logsInRange(countedLogs(logs), range, now)) {
    if (!isWork(l)) continue;
    const key = l.projectId ?? "__none__";
    let entry = map.get(key);
    if (!entry) {
      const name = l.projectId
        ? (nameById.get(l.projectId) ?? l.projectName ?? "Unknown project")
        : "No project";
      entry = { projectId: l.projectId, name, focusMs: 0, sessionCount: 0 };
      map.set(key, entry);
    }
    entry.focusMs += Math.max(0, l.activeMs);
    entry.sessionCount += 1;
  }
  return [...map.values()].sort((a, b) => b.focusMs - a.focusMs);
}

export type MilestoneTime = {
  milestoneId: string | null; // null bucket = work with no milestone
  projectId: string | null;
  name: string;
  projectName: string;
  focusMs: number;
  sessionCount: number;
};

/**
 * Focus time grouped by milestone over counted work sessions in a range. Work
 * with no milestone falls into the `milestoneId: null` bucket ("No milestone").
 *
 * `nameById` resolves the CURRENT milestone title for an id (so renames show);
 * it falls back to the log's denormalized `milestoneName` snapshot. The project
 * label resolves the same way via `projectNameById`. Sorted by focus desc.
 */
export function timeByMilestone(
  logs: LogEntry[],
  nameById: Map<string, string>,
  projectNameById: Map<string, string>,
  range: Range = "all",
  now: number = Date.now(),
): MilestoneTime[] {
  const map = new Map<string, MilestoneTime>();
  for (const l of logsInRange(countedLogs(logs), range, now)) {
    if (!isWork(l)) continue;
    const key = l.milestoneId ?? "__none__";
    let entry = map.get(key);
    if (!entry) {
      const name = l.milestoneId
        ? (nameById.get(l.milestoneId) ?? l.milestoneName ?? "Unknown milestone")
        : "No milestone";
      const projectName = l.projectId
        ? (projectNameById.get(l.projectId) ?? l.projectName ?? "")
        : "";
      entry = {
        milestoneId: l.milestoneId,
        projectId: l.projectId,
        name,
        projectName,
        focusMs: 0,
        sessionCount: 0,
      };
      map.set(key, entry);
    }
    entry.focusMs += Math.max(0, l.activeMs);
    entry.sessionCount += 1;
  }
  return [...map.values()].sort((a, b) => b.focusMs - a.focusMs);
}

// ----------------------------------------------------------------------------
// Inferred break time (explicit logged breaks + unlogged gaps in work windows)
// ----------------------------------------------------------------------------

/**
 * Break time for a single local day = explicitly logged break activeMs PLUS any
 * unlogged time inside that day's *scheduled work windows* not covered by a
 * logged work session.
 *
 * The scheduled work windows come from the schedule's effective 'work' blocks
 * for that date. Within each work window we subtract the union of work-session
 * coverage; the leftover (idle within planned work time) is inferred break.
 */
export function inferredBreakMsForDay(
  logs: LogEntry[],
  schedule: Schedule,
  date: Date,
): number {
  const counted = countedLogs(logs);
  const key = dayKey(date.getTime());

  // 1) Explicit logged breaks that started on this local day.
  const explicitBreakMs = counted
    .filter((l) => isBreak(l) && dayKey(l.startedAt) === key)
    .reduce((s, l) => s + Math.max(0, l.activeMs), 0);

  // 2) Scheduled work windows (epoch ms intervals) for this date.
  const midnight = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0,
    0,
    0,
    0,
  ).getTime();
  const workWindows: Array<[number, number]> = effectiveBlocks(schedule, date)
    .filter((b) => b.type === "work")
    .map((b) => {
      const start = midnight + hhmmToMinutes(b.start) * 60_000;
      const end = midnight + hhmmToMinutes(b.end) * 60_000;
      return [start, end] as [number, number];
    })
    .filter(([s, e]) => e > s);

  if (workWindows.length === 0) return explicitBreakMs;

  // 3) Work-session coverage intervals on this day (wall-clock span).
  const coverage: Array<[number, number]> = counted
    .filter((l) => isWork(l) && l.endedAt > l.startedAt)
    .map((l) => [l.startedAt, l.endedAt] as [number, number])
    .filter(([s, e]) => e > s);

  const mergedCoverage = mergeIntervals(coverage);

  // 4) For each work window, leftover = window minus covered portions.
  let inferredGapMs = 0;
  for (const [ws, we] of workWindows) {
    const windowLen = we - ws;
    let coveredInWindow = 0;
    for (const [cs, ce] of mergedCoverage) {
      const lo = Math.max(ws, cs);
      const hi = Math.min(we, ce);
      if (hi > lo) coveredInWindow += hi - lo;
    }
    inferredGapMs += Math.max(0, windowLen - coveredInWindow);
  }

  return explicitBreakMs + inferredGapMs;
}

/** Merge overlapping [start,end] intervals into a sorted disjoint set. */
function mergeIntervals(
  intervals: Array<[number, number]>,
): Array<[number, number]> {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const out: Array<[number, number]> = [sorted[0].slice() as [number, number]];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1];
    const [s, e] = sorted[i];
    if (s <= last[1]) {
      last[1] = Math.max(last[1], e);
    } else {
      out.push([s, e]);
    }
  }
  return out;
}
