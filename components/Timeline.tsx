"use client";

// components/Timeline.tsx
// PRESENTATIONAL vertical day timeline rendered as an instrument rail. Given a
// day's blocks + the current time, it lays blocks out proportionally by their
// start/end along a vertical spine and overlays a moving "now" line,
// highlighting the block that contains `now`. No data fetching — callers (Home,
// Schedule) pass `blocks` (already resolved via lib/schedule.effectiveBlocks)
// and `now`.

import type { Block } from "@/lib/types";
import { hhmmToMinutes, prettyHhmm, msToHuman } from "@/lib/format";
import NowLine from "@/components/NowLine";

const DEFAULT_PX_PER_MIN = 1.6;
// Left gutter for the spine + block dots; blocks start after it.
const RAIL = 18;

/** Minutes-since-local-midnight for an epoch ms. */
function minutesOfDay(now: number): number {
  const d = new Date(now);
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

export default function Timeline({
  blocks,
  now,
  pxPerMin = DEFAULT_PX_PER_MIN,
  className = "",
}: {
  blocks: Block[];
  now: number;
  /** Vertical scale; larger = taller timeline. */
  pxPerMin?: number;
  className?: string;
}) {
  if (blocks.length === 0) {
    return (
      <div
        className={`rounded-2xl border border-dashed border-border bg-surface/40 px-4 py-10 text-center ${className}`}
      >
        <svg
          viewBox="0 0 24 24"
          className="mx-auto mb-2 h-6 w-6 text-faint"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className="text-sm text-muted">No blocks scheduled today.</p>
        <p className="readout mt-1 text-[0.6875rem] uppercase tracking-[0.12em] text-faint">
          Open rail
        </p>
      </div>
    );
  }

  // Window the timeline to the day's span, padded by 30 min on each side,
  // and clamped to include `now` if it falls outside the blocks.
  const sorted = [...blocks].sort(
    (a, b) => hhmmToMinutes(a.start) - hhmmToMinutes(b.start),
  );
  const nowMins = minutesOfDay(now);
  let minStart = Math.min(...sorted.map((b) => hhmmToMinutes(b.start)));
  let maxEnd = Math.max(...sorted.map((b) => hhmmToMinutes(b.end)));
  const nowInWindow = nowMins >= minStart && nowMins <= maxEnd;
  minStart = Math.max(0, Math.min(minStart, nowMins) - 30);
  maxEnd = Math.min(24 * 60, Math.max(maxEnd, nowMins) + 30);

  const span = Math.max(1, maxEnd - minStart);
  const bodyHeight = span * pxPerMin;
  const nowFraction = (nowMins - minStart) / span;

  return (
    <div className={className}>
      <div
        className="relative"
        style={{ height: `${bodyHeight}px`, paddingLeft: `${RAIL}px` }}
        role="list"
        aria-label="Day timeline"
      >
        {/* The vertical spine of the rail. */}
        <div
          className="pointer-events-none absolute bottom-0 top-0 w-px bg-gradient-to-b from-transparent via-border-strong to-transparent"
          style={{ left: `${RAIL / 2}px` }}
          aria-hidden="true"
        />

        {sorted.map((block) => {
          const start = hhmmToMinutes(block.start);
          const end = hhmmToMinutes(block.end);
          const top = ((start - minStart) / span) * 100;
          const height = (Math.max(1, end - start) / span) * 100;
          const isCurrent = nowMins >= start && nowMins < end;
          const isWork = block.type === "work";
          const durationMs = Math.max(0, end - start) * 60_000;

          return (
            <div
              key={block.id}
              role="listitem"
              className="absolute"
              style={{
                top: `${top}%`,
                height: `${height}%`,
                left: 0,
                right: 0,
              }}
            >
              {/* Spine node aligned to the block's start. */}
              <span
                className={`absolute top-1 z-10 h-2.5 w-2.5 -translate-x-1/2 rounded-full border ${
                  isCurrent
                    ? isWork
                      ? "border-accent bg-accent shadow-[0_0_8px_var(--glow)]"
                      : "border-success bg-success shadow-[0_0_8px_rgb(74_222_128_/_0.5)]"
                    : isWork
                      ? "border-accent/50 bg-surface"
                      : "border-success/50 bg-surface"
                }`}
                style={{ left: `${-(RAIL / 2)}px` }}
                aria-hidden="true"
              />
              <div
                className={`h-full overflow-hidden rounded-xl border px-3 py-2 text-left transition-colors ${
                  isWork ? "bg-surface-2/80" : "bg-surface/70"
                } ${
                  isCurrent
                    ? "border-accent/70 shadow-[0_0_18px_-6px_var(--glow)]"
                    : "border-border"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-text">
                    {block.label}
                  </span>
                  {isCurrent && (
                    <span className="readout ml-auto shrink-0 rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">
                      Now
                    </span>
                  )}
                </div>
                <div className="readout mt-0.5 truncate text-[11px] text-muted">
                  {prettyHhmm(block.start)} – {prettyHhmm(block.end)}
                  <span className="mx-1 text-faint">·</span>
                  {msToHuman(durationMs)}
                </div>
              </div>
            </div>
          );
        })}

        {nowInWindow || (nowFraction >= 0 && nowFraction <= 1) ? (
          <NowLine fraction={nowFraction} now={now} />
        ) : null}
      </div>
    </div>
  );
}
