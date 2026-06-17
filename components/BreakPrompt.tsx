"use client";

// components/BreakPrompt.tsx
// Shown after a WORK session ends (the Pomodoro nudge). Pre-fills the break
// length from settings.defaultBreakMin (editable), then either starts a break
// (onStartBreak with the chosen estimateMs) or skips (onSkip). Presentational
// modal — the parent owns calling startBreak / dismissing.

import { useState } from "react";

export default function BreakPrompt({
  defaultBreakMin,
  onStartBreak,
  onSkip,
  busy = false,
}: {
  defaultBreakMin: number;
  /** Start a break of `estimateMs` milliseconds. */
  onStartBreak: (estimateMs: number) => void;
  onSkip: () => void;
  busy?: boolean;
}) {
  const [minutes, setMinutes] = useState<string>(
    String(Math.max(1, Math.round(defaultBreakMin))),
  );

  const parsed = parseInt(minutes, 10);
  const valid = Number.isFinite(parsed) && parsed > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Take a break"
    >
      <div className="w-full max-w-sm rounded-3xl border border-border bg-surface p-6 shadow-2xl">
        <div className="mb-1 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-success/15 text-success">
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path
                d="M5 8h11a3 3 0 0 1 0 6h-1M5 8v7a3 3 0 0 0 3 3h5a3 3 0 0 0 3-3M8 3v2M11 3v2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <h2 className="text-lg font-semibold">Nice work — take a break?</h2>
        </div>
        <p className="mb-5 text-sm text-muted">
          A short break keeps you sharp. Adjust the length or skip it.
        </p>

        <label className="mb-5 flex items-center justify-between gap-3">
          <span className="text-sm text-muted">Break length</span>
          <span className="flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={minutes}
              disabled={busy}
              onChange={(e) => setMinutes(e.target.value)}
              className="w-20 rounded-xl px-3 py-2 text-right text-base tabular-nums outline-none focus:border-accent"
              aria-label="Break length in minutes"
            />
            <span className="text-sm text-muted">min</span>
          </span>
        </label>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={busy || !valid}
            onClick={() => valid && onStartBreak(parsed * 60_000)}
            className="w-full rounded-2xl bg-success px-4 py-3 text-base font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Start break
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onSkip}
            className="w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 text-base font-medium text-muted transition-colors hover:text-text disabled:opacity-40"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
