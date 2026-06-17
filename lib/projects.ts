// lib/projects.ts
// Pure helpers for project/milestone progress and ahead/behind-schedule status.
// No I/O. Dates are local "YYYY-MM-DD" day keys, consistent with format.dayKey.

import type { Milestone, Project } from "@/lib/types";
import { dayKey } from "@/lib/format";

const DAY_MS = 24 * 60 * 60 * 1000;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Parse a local "YYYY-MM-DD" into the epoch ms of that day's local midnight. */
export function dayKeyToEpoch(key: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key.trim());
  if (!m) return null;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt.getTime();
}

/** Whole local days from day key `a` to day key `b` (b − a); positive ⇒ b later. */
export function daysBetween(aKey: string, bKey: string): number {
  const a = dayKeyToEpoch(aKey);
  const b = dayKeyToEpoch(bKey);
  if (a === null || b === null) return 0;
  return Math.round((b - a) / DAY_MS);
}

/** Stable ordering: manual order, then target date (undated last), then age. */
export function compareMilestones(a: Milestone, b: Milestone): number {
  if (a.order !== b.order) return a.order - b.order;
  const at = a.targetDate ?? "9999-99-99";
  const bt = b.targetDate ?? "9999-99-99";
  if (at !== bt) return at < bt ? -1 : 1;
  return a.createdAt - b.createdAt;
}

/** A project's milestones in display order. */
export function projectMilestones(
  milestones: Milestone[],
  projectId: string,
): Milestone[] {
  return milestones
    .filter((m) => m.projectId === projectId)
    .sort(compareMilestones);
}

export type Progress = { total: number; done: number; pct: number };

export function progressOf(milestones: Milestone[]): Progress {
  const total = milestones.length;
  const done = milestones.filter((m) => m.done).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return { total, done, pct };
}

/** A project is complete when manually completed, or every milestone is done. */
export function isProjectComplete(
  project: Project,
  milestones: Milestone[],
): boolean {
  if (project.completedAt) return true;
  return milestones.length > 0 && milestones.every((m) => m.done);
}

/** The next open (not-done) milestone: soonest target date, undated last. */
export function nextOpenMilestone(milestones: Milestone[]): Milestone | null {
  const open = milestones.filter((m) => !m.done);
  if (open.length === 0) return null;
  const dated = open
    .filter((m) => m.targetDate)
    .sort((a, b) => (a.targetDate! < b.targetDate! ? -1 : 1));
  if (dated.length > 0) return dated[0];
  return [...open].sort(compareMilestones)[0];
}

export type ScheduleState =
  | "ahead"
  | "on-track"
  | "behind"
  | "no-plan"
  | "done";

export type ScheduleStatus = {
  state: ScheduleState;
  /** Signed whole days: negative ⇒ behind by N, positive ⇒ ahead by N. */
  daysDelta: number;
  /** Count of overdue (past-target, still-open) milestones. */
  overdueCount: number;
  /** The next open milestone (soonest target, undated last), or null. */
  nextMilestone: Milestone | null;
  /** Short human label, e.g. "Ahead 2d" / "Behind 3d" / "On track". */
  label: string;
};

/**
 * Ahead/behind-schedule status for a project, blending two signals:
 *   1. Overdue milestones (open + past their target date) ⇒ concrete "behind".
 *   2. Pace: actual %-complete vs expected %-complete by elapsed time between the
 *      project start and its last milestone target ⇒ ahead / on-track / behind.
 * The headline `daysDelta` is the pace delta scaled to the plan's span in days.
 */
export function scheduleStatus(
  project: Project,
  milestones: Milestone[],
  now: number = Date.now(),
): ScheduleStatus {
  const todayKey = dayKey(now);
  const open = milestones.filter((m) => !m.done);
  const dated = milestones.filter((m) => m.targetDate);
  const nextMilestone = nextOpenMilestone(milestones);

  if (isProjectComplete(project, milestones)) {
    return {
      state: "done",
      daysDelta: 0,
      overdueCount: 0,
      nextMilestone: null,
      label: "Complete",
    };
  }

  if (dated.length === 0) {
    return {
      state: "no-plan",
      daysDelta: 0,
      overdueCount: 0,
      nextMilestone,
      label: "No dates set",
    };
  }

  const overdue = open.filter((m) => m.targetDate && m.targetDate < todayKey);

  // Pace delta in days.
  const total = milestones.length;
  const done = total - open.length;
  const startKey =
    project.startDate && dayKeyToEpoch(project.startDate) !== null
      ? project.startDate
      : dayKey(project.createdAt);
  const endKey = dated
    .map((m) => m.targetDate!)
    .reduce((a, b) => (a > b ? a : b));
  const spanDays = Math.max(0, daysBetween(startKey, endKey));
  const elapsedDays = clamp(daysBetween(startKey, todayKey), 0, spanDays);
  const expectedFraction = spanDays > 0 ? elapsedDays / spanDays : 1;
  const actualFraction = total > 0 ? done / total : 0;
  const paceDays = Math.round((actualFraction - expectedFraction) * spanDays);

  // Worst overdue age (days past the earliest overdue target).
  let overdueDays = 0;
  for (const m of overdue) {
    overdueDays = Math.max(overdueDays, daysBetween(m.targetDate!, todayKey));
  }

  if (overdue.length > 0 || paceDays <= -1) {
    const behindDays = Math.max(overdueDays, paceDays < 0 ? -paceDays : 0, 1);
    return {
      state: "behind",
      daysDelta: -behindDays,
      overdueCount: overdue.length,
      nextMilestone,
      label:
        overdue.length > 0
          ? overdue.length === 1
            ? `Behind ${behindDays}d`
            : `Behind · ${overdue.length} overdue`
          : `Behind ${behindDays}d`,
    };
  }

  if (paceDays >= 1) {
    return {
      state: "ahead",
      daysDelta: paceDays,
      overdueCount: 0,
      nextMilestone,
      label: `Ahead ${paceDays}d`,
    };
  }

  return {
    state: "on-track",
    daysDelta: 0,
    overdueCount: 0,
    nextMilestone,
    label: "On track",
  };
}
