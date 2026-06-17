"use client";

// components/ActiveSession.tsx
// The live focus view — the app's hero instrument. It orchestrates a running
// work OR break session:
//   - a circular-ring Timer (remaining recomputed every tick from immutable
//     timestamps),
//   - a live status dot (animate-pulse-glow) + MILESTONE/PROJECT context badges,
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

import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
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
  const doneCount = session.objectives.filter((o) => o.done).length;
  const allDone = total > 0 && doneCount === total;
  const askedFinish = isWork && allDone && !finishDismissed;

  // --- actions -------------------------------------------------------------
  const onToggleObjectives = useCallback(
    (next: Objective[]) => {
      // Re-arm the finish nudge once the list is no longer all-done, so it can
      // reappear after the user re-completes everything. Done in the handler
      // (not an effect) to avoid a cascading render.
      const nextAllDone = next.length > 0 && next.every((o) => o.done);
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

  // Status-line tone: live → accent/success, paused → muted, over → danger.
  const statusTone = expired
    ? "text-danger"
    : paused
      ? "text-faint"
      : isWork
        ? "text-accent"
        : "text-success";
  const statusDot = expired
    ? "bg-danger"
    : isWork
      ? "bg-accent"
      : "bg-success";
  const statusLabel = expired
    ? isWork
      ? "Over time"
      : "Break over"
    : paused
      ? "Paused"
      : isWork
        ? "Focusing"
        : "On break";

  return (
    <Card
      className={`mx-auto w-full max-w-md overflow-hidden p-6 sm:p-7 ${
        expired ? "border-danger/40" : ""
      }`}
    >
      {/* Status line: live dot + state */}
      <div className="mb-5 flex items-center justify-center gap-2">
        <span className="relative flex h-2 w-2">
          {!paused && (
            <span
              className={`animate-pulse-glow absolute inline-flex h-full w-full rounded-full ${statusDot}`}
              aria-hidden="true"
            />
          )}
          <span
            className={`relative inline-flex h-2 w-2 rounded-full ${statusDot}`}
            aria-hidden="true"
          />
        </span>
        <span className={`eyebrow ${statusTone}`}>{statusLabel}</span>
      </div>

      {/* Project + milestone context as instrument badges */}
      {isWork && (session.projectName || session.milestoneName) && (
        <div className="mb-3 flex max-w-full flex-wrap items-center justify-center gap-1.5">
          {session.projectName && (
            <Badge tone="accent">{session.projectName}</Badge>
          )}
          {session.milestoneName && (
            <Badge tone="default">
              <svg
                viewBox="0 0 24 24"
                className="h-3 w-3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <path
                  d="M5 4v16M5 5h11l-2 3 2 3H5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {session.milestoneName}
            </Badge>
          )}
        </div>
      )}

      <h1 className="font-display mb-7 max-w-full truncate text-center text-2xl font-semibold tracking-tight text-text">
        {session.taskName}
      </h1>

      {/* The gauge */}
      <Timer
        remainingMs={remainingMs}
        activeMs={activeMs}
        budgetMs={budget}
        paused={paused}
        kind={session.kind}
      />

      {/* Expired banner + extend controls */}
      {expired && (
        <div className="mt-7 flex w-full flex-col gap-3">
          <ExpiredBanner kind={session.kind} overMs={-remainingMs} />
          <ExtendControls onExtend={(ms) => extend(ms)} disabled={busy} />
        </div>
      )}

      {/* Primary controls */}
      <div className="mt-8 flex w-full items-center justify-center gap-3">
        {paused ? (
          <button
            type="button"
            onClick={() => void resume()}
            className="btn-primary flex-1 px-4 py-3.5 text-base"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
            Resume
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void pause()}
            className="btn-secondary flex-1 px-4 py-3.5 text-base"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M7 5h3v14H7zM14 5h3v14h-3z" />
            </svg>
            Pause
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => void doEnd(expired ? "timer-expired" : "manual")}
          className="btn-secondary flex-1 px-4 py-3.5 text-base"
        >
          {isWork ? "End session" : "End break"}
        </button>
      </div>

      <div className="mt-3 flex justify-center">
        <button
          type="button"
          disabled={busy}
          onClick={doCancel}
          className="readout rounded-lg px-3 py-1.5 text-[0.6875rem] font-medium uppercase tracking-[0.12em] text-faint transition-colors hover:text-danger disabled:opacity-40"
        >
          Cancel · won&apos;t count
        </button>
      </div>

      {/* Tasks (work only) */}
      {isWork && (
        <div className="mt-7 w-full border-t border-border pt-6">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="eyebrow text-muted">Tasks</span>
            {total > 0 && (
              <span className="readout text-xs text-muted">
                {doneCount} / {total}
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
            <div className="animate-fade-up mt-3 flex items-center gap-3 rounded-2xl border border-success/40 bg-success/10 px-4 py-3 shadow-[0_0_18px_-6px_rgb(74_222_128_/_0.4)]">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-success/20 text-success">
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  aria-hidden="true"
                >
                  <path
                    d="M5 13l4 4L19 7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <p className="flex-1 text-sm font-medium text-success">
                All tasks done — finish up?
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
    </Card>
  );
}
