// lib/timer.ts
// Pure timer math. No side effects, no I/O. All functions return new values;
// the *Session helpers return a NEW ActiveSession rather than mutating.
//
// Core identities:
//   budgetMs   = estimateMs + extensionsMs
//   activeMs   = accumulatedActiveMs + (runningSince ? now - runningSince : 0)
//   remaining  = budgetMs - activeMs   (may go negative => "over" state)

import type {
  ActiveSession,
  EndReason,
  LogEntry,
  LogStatus,
} from "@/lib/types";

/** Total active (non-paused) ms elapsed as of `now`. */
export function computeActiveMs(session: ActiveSession, now: number): number {
  const live =
    session.status === "running" && session.runningSince !== null
      ? Math.max(0, now - session.runningSince)
      : 0;
  return session.accumulatedActiveMs + live;
}

/** budgetMs = original estimate + all extensions. */
export function budgetMs(session: ActiveSession): number {
  return session.estimateMs + session.extensionsMs;
}

/**
 * Remaining ms against the budget. Negative when over (no auto-end; caller
 * decides what to do with the "over" state).
 */
export function computeRemainingMs(
  session: ActiveSession,
  now: number,
): number {
  return budgetMs(session) - computeActiveMs(session, now);
}

/** True once the budget has been reached or exceeded. */
export function isExpired(session: ActiveSession, now: number): boolean {
  return computeRemainingMs(session, now) <= 0;
}

/**
 * Pause: freeze the current running segment into accumulatedActiveMs and clear
 * runningSince. No-op (returns an equivalent paused session) if already paused.
 */
export function pauseSession(
  session: ActiveSession,
  now: number,
): ActiveSession {
  if (session.status === "paused" || session.runningSince === null) {
    return { ...session, status: "paused", runningSince: null };
  }
  const segment = Math.max(0, now - session.runningSince);
  return {
    ...session,
    status: "paused",
    accumulatedActiveMs: session.accumulatedActiveMs + segment,
    runningSince: null,
    lastSeenAt: now,
  };
}

/**
 * Resume: start a fresh running segment. No-op if already running.
 */
export function resumeSession(
  session: ActiveSession,
  now: number,
): ActiveSession {
  if (session.status === "running" && session.runningSince !== null) {
    return { ...session, lastSeenAt: now };
  }
  return {
    ...session,
    status: "running",
    runningSince: now,
    lastSeenAt: now,
  };
}

/** Add extension time (e.g. +5/+10/custom). addMs may be any positive number. */
export function extendSession(
  session: ActiveSession,
  addMs: number,
): ActiveSession {
  const safeAdd = Number.isFinite(addMs) && addMs > 0 ? addMs : 0;
  return { ...session, extensionsMs: session.extensionsMs + safeAdd };
}

/** Update the heartbeat anchor. */
export function touchSession(
  session: ActiveSession,
  now: number,
): ActiveSession {
  return { ...session, lastSeenAt: now };
}

export type AwayChoice = "work" | "discard";

/**
 * Reconcile a running session after the tab was away/reloaded.
 *
 * - 'work':    count the away time as active work.
 *              accumulatedActiveMs += now - runningSince; runningSince = now.
 * - 'discard': do NOT count away time (only up to the last heartbeat).
 *              accumulatedActiveMs += lastSeenAt - runningSince; runningSince = now.
 *
 * If the session is paused or has no running segment, only the heartbeat anchor
 * is refreshed.
 */
export function applyAway(
  session: ActiveSession,
  choice: AwayChoice,
  now: number,
): ActiveSession {
  if (session.status === "paused" || session.runningSince === null) {
    return { ...session, lastSeenAt: now };
  }
  const runningSince = session.runningSince;
  if (choice === "work") {
    const segment = Math.max(0, now - runningSince);
    return {
      ...session,
      accumulatedActiveMs: session.accumulatedActiveMs + segment,
      runningSince: now,
      lastSeenAt: now,
    };
  }
  // 'discard': only credit up to the last heartbeat.
  const credited = Math.max(0, session.lastSeenAt - runningSince);
  return {
    ...session,
    accumulatedActiveMs: session.accumulatedActiveMs + credited,
    runningSince: now,
    lastSeenAt: now,
  };
}

/**
 * Convert a session into a finalized LogEntry. Pure: callers persist the
 * result. activeMs is the final active (paused-excluded) time as of `now`.
 */
export function finalizeToLog(
  session: ActiveSession,
  now: number,
  endReason: EndReason,
): LogEntry {
  const activeMs = computeActiveMs(session, now);
  const status: LogStatus =
    endReason === "cancelled" ? "cancelled" : "completed";
  const objectivesTotal = session.objectives.length;
  const objectivesCompleted = session.objectives.filter((o) => o.done).length;
  return {
    id: session.id,
    kind: session.kind,
    projectId: session.projectId,
    projectName: session.projectName,
    milestoneId: session.milestoneId,
    milestoneName: session.milestoneName,
    taskName: session.taskName,
    objectives: session.objectives,
    status,
    startedAt: session.startedAt,
    endedAt: now,
    activeMs,
    estimateMs: session.estimateMs,
    extensionsMs: session.extensionsMs,
    objectivesTotal,
    objectivesCompleted,
    endReason,
  };
}
