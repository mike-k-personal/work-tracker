"use client";

// components/ActiveSession.tsx
// The live focus view. It orchestrates a running work OR break session:
//   - big Timer (remaining recomputed every tick from immutable timestamps),
//   - editable ObjectiveList (work only; persisted via the hook's setObjectives;
//     auto-prompts to finish when every objective is checked),
//   - Pause / Resume,
//   - ExtendControls (shown once remaining <= 0),
//   - End and Cancel,
//   - one-shot chime + notification + ExpiredBanner on expiry (guarded so it
//     fires exactly once per expiry; re-arms if the user extends).
//
// The session state, tick (`now`), and heartbeat all come from useActiveSession
// (passed in by Home) so there's a single source of truth. Breaks reuse this
// same view with success styling and no objectives.
//
// Ending a WORK session is reported up via onWorkEnded so Home can show the
// Pomodoro BreakPrompt — that modal lives at the page level because THIS
// component unmounts the moment the session is cleared.

import { useCallback, useEffect, useRef, useState } from "react";

import type { Objective } from "@/lib/types";
import {
  budgetMs as budgetOf,
  computeActiveMs,
  computeRemainingMs,
} from "@/lib/timer";
import { playChime } from "@/lib/sound";
import { notify } from "@/lib/notify";
import type { UseActiveSession } from "@/lib/useActiveSession";

import Timer from "@/components/Timer";
import ObjectiveList from "@/components/ObjectiveList";
import ExtendControls from "@/components/ExtendControls";
import ExpiredBanner from "@/components/ExpiredBanner";

export default function ActiveSession({
  session,
  now,
  soundEnabled,
  notificationsEnabled,
  pause,
  resume,
  extend,
  setObjectives,
  end,
  cancel,
  onWorkEnded,
}: {
  session: NonNullable<UseActiveSession["active"]>;
  now: number;
  soundEnabled: boolean;
  notificationsEnabled: boolean;
  pause: UseActiveSession["pause"];
  resume: UseActiveSession["resume"];
  extend: UseActiveSession["extend"];
  setObjectives: UseActiveSession["setObjectives"];
  end: UseActiveSession["end"];
  cancel: UseActiveSession["cancel"];
  /** Called after a WORK session finalizes so Home can offer a break. */
  onWorkEnded: () => void;
}) {
  const isWork = session.kind === "work";
  const paused = session.status === "paused";

  const remainingMs = computeRemainingMs(session, now);
  const activeMs = computeActiveMs(session, now);
  const budget = budgetOf(session);
  const expired = remainingMs <= 0;

  const [busy, setBusy] = useState(false);
  // The user can dismiss the "all objectives done" nudge ("keep going"); we
  // re-arm it only after they uncheck and re-complete everything.
  const [finishDismissed, setFinishDismissed] = useState(false);

  // --- one-shot expiry chime + notification --------------------------------
  // The gate is keyed by `${session.id}:${budget}` so each fresh expiry fires
  // exactly once. Extending grows the budget => new key => re-arms. Reading and
  // writing the ref happens only inside the effect (never during render) so it
  // survives StrictMode double-invoke without lint complaints.
  const firedKeyRef = useRef<string | null>(null);
  const expiryKey = `${session.id}:${budget}`;

  useEffect(() => {
    if (!expired) return;
    if (firedKeyRef.current === expiryKey) return;
    firedKeyRef.current = expiryKey;

    if (soundEnabled) playChime();
    if (notificationsEnabled) {
      void notify(
        isWork ? "Time's up" : "Break's over",
        isWork
          ? `“${session.taskName}” reached its time.`
          : "Time to get back to it.",
        { tag: "wt-expiry", renotify: true },
      );
    }
  }, [
    expired,
    expiryKey,
    soundEnabled,
    notificationsEnabled,
    isWork,
    session.taskName,
  ]);

  // --- auto-prompt to finish when all objectives are checked ----------------
  // Derived during render (no mirroring effect): show the nudge when every
  // objective is done and the user hasn't dismissed it.
  const total = session.objectives.length;
  const allDone = total > 0 && session.objectives.every((o) => o.done);
  const askedFinish = isWork && allDone && !finishDismissed;

  // --- actions -------------------------------------------------------------
  const onToggleObjectives = useCallback(
    (next: Objective[]) => {
      // Re-arm the finish nudge once the list is no longer all-done, so it can
      // reappear after the user re-completes everything. Done in the handler
      // (not an effect) to avoid a cascading render.
      const nextAllDone =
        next.length > 0 && next.every((o) => o.done);
      if (!nextAllDone) setFinishDismissed(false);
      void setObjectives(next);
    },
    [setObjectives],
  );

  const doEnd = useCallback(
    async (reason: Parameters<typeof end>[0]) => {
      if (busy) return;
      setBusy(true);
      try {
        const log = await end(reason);
        // After a WORK session ends, hand off to Home for the break prompt.
        if (log && log.kind === "work") onWorkEnded();
      } finally {
        setBusy(false);
      }
    },
    [busy, end, onWorkEnded],
  );

  const doCancel = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await cancel();
    } finally {
      setBusy(false);
    }
  }, [busy, cancel]);

  const accentText = isWork ? "text-accent" : "text-success";
  const accentDot = isWork ? "bg-accent" : "bg-success";

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center">
      {/* Header: kind + task name */}
      <div className="mb-1 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${accentDot}`} aria-hidden="true" />
        <span
          className={`text-xs font-semibold uppercase tracking-[0.18em] ${accentText}`}
        >
          {isWork ? "Focus" : "Break"}
        </span>
      </div>
      {isWork && session.projectName && (
        <p className="mb-1 max-w-full truncate text-center text-sm font-medium text-muted">
          {session.projectName}
        </p>
      )}
      <h1 className="mb-6 max-w-full truncate text-center text-2xl font-semibold tracking-tight">
        {session.taskName}
      </h1>

      {/* Big timer */}
      <Timer
        remainingMs={remainingMs}
        activeMs={activeMs}
        budgetMs={budget}
        paused={paused}
        kind={session.kind}
      />

      {/* Expired banner + extend controls */}
      {expired && (
        <div className="mt-6 flex w-full flex-col gap-3">
          <ExpiredBanner kind={session.kind} overMs={-remainingMs} />
          <ExtendControls onExtend={(ms) => extend(ms)} disabled={busy} />
        </div>
      )}

      {/* Primary controls */}
      <div className="mt-7 flex w-full items-center justify-center gap-3">
        {paused ? (
          <button
            type="button"
            onClick={() => void resume()}
            className="flex-1 rounded-2xl bg-accent px-4 py-3.5 text-base font-semibold text-accent-contrast transition-colors hover:bg-accent-hover"
          >
            Resume
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void pause()}
            className="flex-1 rounded-2xl border border-border bg-surface-2 px-4 py-3.5 text-base font-semibold transition-colors hover:border-accent"
          >
            Pause
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => void doEnd(expired ? "timer-expired" : "manual")}
          className="flex-1 rounded-2xl bg-surface-2 px-4 py-3.5 text-base font-semibold text-text transition-colors hover:bg-border disabled:opacity-40"
        >
          {isWork ? "End session" : "End break"}
        </button>
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={doCancel}
        className="mt-2 rounded-xl px-4 py-2 text-sm font-medium text-muted transition-colors hover:text-danger disabled:opacity-40"
      >
        Cancel (won&apos;t count toward stats)
      </button>

      {/* Objectives (work only) */}
      {isWork && (
        <div className="mt-8 w-full">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">
              Objectives
            </span>
            {total > 0 && (
              <span className="text-xs text-muted tabular-nums">
                {session.objectives.filter((o) => o.done).length} / {total}
              </span>
            )}
          </div>
          <ObjectiveList
            objectives={session.objectives}
            onChange={onToggleObjectives}
            disabled={busy}
          />

          {/* Auto-prompt to finish when everything is checked */}
          {askedFinish && (
            <div className="mt-3 flex items-center gap-3 rounded-2xl border border-success/40 bg-success/10 px-4 py-3">
              <p className="flex-1 text-sm font-medium text-success">
                All objectives done — finish up?
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void doEnd("all-done")}
                className="shrink-0 rounded-xl bg-success px-3 py-2 text-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                Finish
              </button>
              <button
                type="button"
                onClick={() => setFinishDismissed(true)}
                className="shrink-0 rounded-xl px-2 py-2 text-sm font-medium text-muted transition-colors hover:text-text"
                aria-label="Keep working"
              >
                Keep going
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
