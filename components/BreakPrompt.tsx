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
      className="animate-fade-in fixed inset-0 z-50 flex items-end justify-center bg-bg/70 p-4 backdrop-blur-md sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Take a break"
    >
      <div className="card animate-fade-up w-full max-w-sm p-6 shadow-card-lg">
        <div className="mb-3 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-success/15 text-success shadow-[0_0_16px_-4px_rgb(74_222_128_/_0.5)]">
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path
                d="M5 8h11a3 3 0 0 1 0 6h-1M5 8v7a3 3 0 0 0 3 3h5a3 3 0 0 0 3-3M8 3v2M11 3v2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <div>
            <p className="eyebrow text-success">Pomodoro</p>
            <h2 className="font-display text-lg font-semibold tracking-tight">
              Nice work — take a break?
            </h2>
          </div>
        </div>
        <p className="mb-5 text-sm text-muted">
          A short break keeps you sharp. Adjust the length or skip it.
        </p>

        <label className="mb-5 flex items-center justify-between gap-3">
          <span className="eyebrow text-muted">Break length</span>
          <span className="flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={minutes}
              disabled={busy}
              onChange={(e) => setMinutes(e.target.value)}
              className="readout w-20 rounded-xl border border-border bg-surface-2 px-3 py-2 text-right text-base outline-none transition-colors focus:border-accent"
              aria-label="Break length in minutes"
            />
            <span className="readout text-xs uppercase tracking-wider text-faint">
              min
            </span>
          </span>
        </label>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={busy || !valid}
            onClick={() => valid && onStartBreak(parsed * 60_000)}
            className="w-full rounded-xl bg-success px-4 py-3 text-base font-semibold text-bg shadow-[0_6px_20px_-8px_rgb(74_222_128_/_0.6)] transition-opacity hover:opacity-90 disabled:opacity-40 disabled:shadow-none"
          >
            Start break
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onSkip}
            className="btn-secondary w-full px-4 py-3 text-base"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
