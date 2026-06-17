"use client";

// components/NowLine.tsx
// PRESENTATIONAL "now" indicator for the Timeline. Renders a glowing horizontal
// line + a mono time label at a given vertical fraction (0..1) of the timeline
// body. No fetching, no timers of its own — the parent passes a fraction derived
// from `now`. A softly pulsing node anchors it to the rail's spine.

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
      className="pointer-events-none absolute inset-x-0 z-30 flex items-center"
      style={{ top: `${clamped * 100}%`, left: 0 }}
      aria-hidden="true"
    >
      {/* Pulsing node sitting on the spine. */}
      <span className="relative -ml-[1px] flex h-2.5 w-2.5 -translate-x-1/2">
        <span className="animate-pulse-glow absolute inline-flex h-full w-full rounded-full bg-accent" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent shadow-[0_0_0_3px_rgb(56_189_248_/_0.18),0_0_10px_var(--glow)]" />
      </span>
      <span className="h-px flex-1 bg-gradient-to-r from-accent/80 to-accent/10" />
      <span className="readout ml-2 rounded-md border border-accent/30 bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-accent-hover shadow-[0_0_12px_-4px_var(--glow)]">
        {prettyTime(now)}
      </span>
    </div>
  );
}
