"use client";

// components/Timeline.tsx
// PRESENTATIONAL vertical day timeline. Given a day's blocks + the current time,
// it lays blocks out proportionally by their start/end and overlays a moving
// "now" line, highlighting the block that contains `now`. No data fetching —
// callers (Home, Schedule) pass `blocks` (already resolved via
// lib/schedule.effectiveBlocks) and `now`.

import type { Block } from "@/lib/types";
import { hhmmToMinutes, prettyHhmm, msToHuman } from "@/lib/format";
import NowLine from "@/components/NowLine";

const DEFAULT_PX_PER_MIN = 1.6;

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
        className={`rounded-2xl border border-dashed border-border bg-surface px-4 py-10 text-center text-sm text-muted ${className}`}
      >
        No blocks scheduled for this day.
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
        style={{ height: `${bodyHeight}px` }}
        role="list"
        aria-label="Day timeline"
      >
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
              className={`absolute inset-x-0 overflow-hidden rounded-xl border px-3 py-2 text-left transition-colors ${
                isWork
                  ? "bg-surface-2"
                  : "bg-surface"
              } ${
                isCurrent
                  ? "border-accent ring-1 ring-accent/50"
                  : "border-border"
              }`}
              style={{ top: `${top}%`, height: `${height}%` }}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    isWork ? "bg-accent" : "bg-success"
                  }`}
                  aria-hidden="true"
                />
                <span className="truncate text-sm font-medium">
                  {block.label}
                </span>
                {isCurrent && (
                  <span className="ml-auto shrink-0 rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                    Now
                  </span>
                )}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-muted tabular-nums">
                {prettyHhmm(block.start)} – {prettyHhmm(block.end)}
                <span className="mx-1">·</span>
                {msToHuman(durationMs)}
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
