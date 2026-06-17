"use client";

// components/NowLine.tsx
// PRESENTATIONAL "now" indicator for the Timeline. Renders a horizontal line +
// a label at a given vertical fraction (0..1) of the timeline body. No fetching,
// no timers of its own — the parent passes a fraction derived from `now`.

import { prettyTime } from "@/lib/format";

export default function NowLine({
  fraction,
  now,
}: {
  /** Vertical position as a fraction (0 = top, 1 = bottom) of the timeline. */
  fraction: number;
  /** Current time (epoch ms) for the label. */
  now: number;
}) {
  const clamped = Math.min(1, Math.max(0, fraction));
  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
      style={{ top: `${clamped * 100}%` }}
      aria-hidden="true"
    >
      <span className="-ml-1 h-2.5 w-2.5 shrink-0 rounded-full bg-danger shadow-[0_0_0_3px_rgba(248,113,113,0.25)]" />
      <span className="h-px flex-1 bg-danger/70" />
      <span className="ml-2 rounded-md bg-danger/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-danger tabular-nums">
        {prettyTime(now)}
      </span>
    </div>
  );
}
