"use client";

// components/Timer.tsx
// PURE display of the remaining time, rendered as a precision-instrument gauge.
// The parent computes `remainingMs`, `activeMs`, and `budgetMs` from immutable
// timestamps (lib/timer) each tick and passes them in — this component never
// holds a timer or fetches.
//
// Layout: a circular progress RING (the elapsed fraction of the budget) wrapping
// a huge, centered, mono `.readout` clock, with a slim glowing ProgressBar and
// active-time / budget context beneath it. When remaining goes negative it flips
// to an "over by" state (the clock keeps counting up past zero — there is no
// auto-end) and the ring + bar turn danger-toned. The accent ring carries a soft
// glow that dims while paused.

import { msToClock, msToHuman } from "@/lib/format";
import { ProgressBar } from "@/components/ui/ProgressBar";

// Ring geometry. Drawn on a 220-unit viewBox; the visual size is set in CSS so
// it scales crisply with the breakpoints.
const SIZE = 220;
const STROKE = 6;
const R = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

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

  // Elapsed fraction of the budget, for both the ring and the bar below.
  const rawPct = budgetMs > 0 ? (activeMs / budgetMs) * 100 : over ? 100 : 0;
  const pct = Math.max(0, Math.min(100, rawPct));
  const tone = over ? "danger" : kind === "break" ? "success" : "accent";

  // Ring stroke + glow per state.
  const ringStroke = over
    ? "var(--danger)"
    : kind === "break"
      ? "var(--success)"
      : "var(--accent)";
  const ringGlow = over
    ? "rgb(251 113 133 / 0.5)"
    : kind === "break"
      ? "rgb(74 222 128 / 0.45)"
      : "var(--glow)";

  // Arc length: full ring once "over" (a complete sweep reads as "spent").
  const fillFraction = over ? 1 : pct / 100;
  const dashOffset = CIRC * (1 - fillFraction);

  const clockColor = over
    ? "text-danger"
    : paused
      ? "text-muted"
      : kind === "break"
        ? "text-success"
        : "text-text";

  return (
    <div className={`flex w-full flex-col items-center ${className}`}>
      {/* The gauge: ring + centered readout */}
      <div className="relative mx-auto aspect-square w-[16rem] max-w-full sm:w-[19rem]">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="absolute inset-0 h-full w-full -rotate-90"
          aria-hidden="true"
        >
          {/* Track */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke="var(--border)"
            strokeWidth={STROKE}
          />
          {/* Faint tick at the top (12 o'clock origin) */}
          <line
            x1={SIZE / 2}
            y1={STROKE / 2 + 1}
            x2={SIZE / 2}
            y2={STROKE / 2 + 9}
            stroke="var(--border-strong)"
            strokeWidth="2"
            strokeLinecap="round"
            transform={`rotate(90 ${SIZE / 2} ${SIZE / 2})`}
          />
          {/* Progress arc with a soft glow */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke={ringStroke}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={dashOffset}
            className="transition-[stroke-dashoffset] duration-700 ease-out"
            style={{
              filter: paused
                ? "none"
                : `drop-shadow(0 0 6px ${ringGlow})`,
              opacity: paused ? 0.5 : 1,
            }}
          />
        </svg>

        {/* Centered readout */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={`eyebrow ${
              over ? "text-danger" : paused ? "text-faint" : ""
            }`}
          >
            {over ? "Over by" : paused ? "Paused" : "Remaining"}
          </span>
          <div
            className={`readout mt-1.5 text-[3.25rem] font-bold leading-none sm:text-[4rem] ${clockColor}`}
            aria-live="polite"
            aria-label={`${over ? "Over by" : "Remaining"} ${clock}`}
          >
            {over ? "+" : ""}
            {clock}
          </div>
          <div className="readout mt-2.5 text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-faint">
            {Math.round(pct)}% spent
          </div>
        </div>
      </div>

      {/* Slim elapsed bar + numeric context */}
      <ProgressBar
        value={pct}
        tone={tone}
        size="sm"
        label="Elapsed"
        className={`mt-7 max-w-[19rem] ${paused ? "opacity-50" : ""}`}
      />

      <div className="readout mt-3 flex items-center gap-2.5 text-[0.75rem] text-muted">
        <span>{msToHuman(activeMs)} active</span>
        <span className="text-faint" aria-hidden="true">
          /
        </span>
        <span>{msToHuman(budgetMs)} budget</span>
      </div>
    </div>
  );
}
