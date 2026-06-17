"use client";

// components/Timer.tsx
// PURE display of the remaining time. The parent computes `remainingMs`,
// `activeMs`, and `budgetMs` from immutable timestamps (lib/timer) each tick and
// passes them in — this component never holds a timer or fetches.
//
// Layout: a big, centered, tabular-nums clock. When remaining goes negative it
// flips to an "over by" state (the timer keeps counting up past zero — there is
// no auto-end). Below the clock: small active-time / budget context.

import { msToClock, msToHuman } from "@/lib/format";

export default function Timer({
  remainingMs,
  activeMs,
  budgetMs,
  paused = false,
  kind = "work",
  className = "",
}: {
  remainingMs: number;
  activeMs: number;
  budgetMs: number;
  paused?: boolean;
  kind?: "work" | "break";
  className?: string;
}) {
  const over = remainingMs < 0;
  const clock = msToClock(Math.abs(remainingMs));

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <span
        className={`text-xs font-semibold uppercase tracking-[0.18em] ${
          over ? "text-danger" : "text-muted"
        }`}
      >
        {over ? "Over by" : paused ? "Paused" : "Remaining"}
      </span>

      <div
        className={`mt-1 font-mono text-7xl font-bold leading-none tabular-nums sm:text-8xl ${
          over
            ? "text-danger"
            : paused
              ? "text-muted"
              : kind === "break"
                ? "text-success"
                : "text-text"
        }`}
        aria-live="polite"
        aria-label={`${over ? "Over by" : "Remaining"} ${clock}`}
      >
        {over ? "+" : ""}
        {clock}
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs text-muted tabular-nums">
        <span>{msToHuman(activeMs)} active</span>
        <span aria-hidden="true">·</span>
        <span>{msToHuman(budgetMs)} budget</span>
      </div>
    </div>
  );
}
