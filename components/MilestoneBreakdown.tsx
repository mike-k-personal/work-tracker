"use client";

// components/MilestoneBreakdown.tsx
// PRESENTATIONAL ranked list of focus-time rows with horizontal accent-gradient
// bars (one bar per row, scaled to the busiest row). Drives the "Time by
// milestone" AND "Time by project" sections on /metrics — both share this row
// style. No data fetching: the caller passes already-aggregated rows from
// lib/metrics (timeByMilestone / timeByProject). Styled to the "precision
// instrument" system: mono rank numerals + readout values, a hairline tick
// scale, and accent-gradient meter fills that glow on the leader. Rows stagger
// in with animate-fade-up.

import { msToHuman } from "@/lib/format";
import { cn } from "@/components/ui/cn";

export type BreakdownRow = {
  /** Stable key for React. */
  id: string;
  /** Primary label, e.g. a milestone title or project name. */
  name: string;
  /** Optional muted context line, e.g. the parent project for a milestone. */
  context?: string;
  /** Focus ms for this row (drives the bar + value). */
  focusMs: number;
  /** Number of work sessions that contributed. */
  sessionCount: number;
  /** True for the synthetic "No milestone"/"No project" bucket (dimmed). */
  muted?: boolean;
};

export default function MilestoneBreakdown({
  rows,
  className = "",
}: {
  rows: BreakdownRow[];
  className?: string;
}) {
  if (rows.length === 0) return null;

  const maxMs = Math.max(1, ...rows.map((r) => r.focusMs));

  return (
    <ul className={cn("flex flex-col", className)}>
      {rows.map((r, i) => {
        const pct = (r.focusMs / maxMs) * 100;
        const width = pct === 0 ? 0 : Math.max(pct, 3);
        const isLeader = i === 0 && !r.muted && r.focusMs > 0;
        return (
          <li
            key={r.id}
            className={cn(
              "animate-fade-up group flex flex-col gap-2 py-3",
              i > 0 && "border-t border-border/60",
            )}
            style={{ animationDelay: `${i * 45}ms` }}
          >
            <div className="flex items-baseline justify-between gap-3">
              <div className="flex min-w-0 items-baseline gap-2.5">
                {/* Mono rank numeral — instrument index. */}
                <span
                  className={cn(
                    "font-mono text-[0.6875rem] tabular-nums tracking-wider",
                    isLeader ? "text-accent" : "text-faint",
                  )}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0">
                  <span
                    className={cn(
                      "block truncate text-sm font-medium",
                      r.muted ? "text-muted" : "text-text",
                    )}
                  >
                    {r.name}
                  </span>
                  {r.context ? (
                    <span className="block truncate text-xs text-faint">
                      {r.context}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <span
                  className={cn(
                    "readout block text-sm font-semibold",
                    r.muted ? "text-muted" : "text-text",
                  )}
                >
                  {msToHuman(r.focusMs)}
                </span>
                <span className="block font-mono text-[0.6875rem] tabular-nums text-faint">
                  {r.sessionCount} {r.sessionCount === 1 ? "session" : "sessions"}
                </span>
              </div>
            </div>
            {/* Meter: hairline scale ticks behind an accent-gradient fill. */}
            <div className="relative h-2 w-full overflow-hidden rounded-full border border-border/70 bg-surface-2/70">
              {/* Quarter-scale tick marks for an instrument-gauge read. */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-1/4 w-px bg-border/80"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-border/80"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-3/4 w-px bg-border/80"
              />
              <div
                className={cn(
                  "relative h-full rounded-full transition-[width] duration-700 ease-out",
                  r.muted
                    ? "bg-muted/40"
                    : "bg-gradient-to-r from-accent-2 via-accent-strong to-accent",
                  isLeader && "shadow-[0_0_10px_var(--glow)]",
                )}
                style={{ width: `${width}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
