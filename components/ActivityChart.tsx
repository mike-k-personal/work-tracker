"use client";

// components/ActivityChart.tsx
// PRESENTATIONAL per-day activity bar chart built with plain divs + CSS only
// (NO chart library). Each day is a vertical stacked bar: focus (accent) sits
// on top of break (muted/success) time, scaled to the busiest day. Hovering or
// tapping a bar reveals an exact-value tooltip. No data fetching or timers — the
// caller passes already-bucketed days (one entry per calendar day, oldest first).

import { useState } from "react";
import { msToHuman } from "@/lib/format";

export type ActivityDay = {
  /** Local "YYYY-MM-DD" key. */
  dayKey: string;
  /** Short label under the bar, e.g. "Mon" or "16". */
  label: string;
  /** Focus (work) ms for the day. */
  focusMs: number;
  /** Break ms for the day (explicit + inferred). */
  breakMs: number;
  /** True for the current day (gets an accent ring on its label). */
  isToday?: boolean;
};

export default function ActivityChart({
  days,
  className = "",
  showBreaks = true,
}: {
  days: ActivityDay[];
  className?: string;
  /** Stack break time beneath focus time when true. */
  showBreaks?: boolean;
}) {
  const [active, setActive] = useState<string | null>(null);

  if (days.length === 0) {
    return (
      <div
        className={`rounded-2xl border border-dashed border-border bg-surface px-4 py-10 text-center text-sm text-muted ${className}`}
      >
        No activity yet. Start a session to see your daily focus here.
      </div>
    );
  }

  // Scale every bar to the busiest day's total (focus + optional break).
  const maxMs = Math.max(
    1,
    ...days.map((d) => d.focusMs + (showBreaks ? d.breakMs : 0)),
  );

  return (
    <div className={className}>
      <div
        className="flex items-end gap-1.5 sm:gap-2"
        role="list"
        aria-label="Daily activity"
        style={{ height: "168px" }}
      >
        {days.map((d) => {
          const total = d.focusMs + (showBreaks ? d.breakMs : 0);
          const focusPct = (d.focusMs / maxMs) * 100;
          const breakPct = showBreaks ? (d.breakMs / maxMs) * 100 : 0;
          const isActive = active === d.dayKey;
          const hasActivity = total > 0;

          return (
            <button
              key={d.dayKey}
              type="button"
              role="listitem"
              className="group relative flex h-full flex-1 cursor-default flex-col items-stretch justify-end focus:outline-none"
              onMouseEnter={() => setActive(d.dayKey)}
              onMouseLeave={() => setActive((cur) => (cur === d.dayKey ? null : cur))}
              onFocus={() => setActive(d.dayKey)}
              onBlur={() => setActive((cur) => (cur === d.dayKey ? null : cur))}
              onClick={() =>
                setActive((cur) => (cur === d.dayKey ? null : d.dayKey))
              }
              aria-label={`${d.label}: ${msToHuman(d.focusMs)} focus${
                showBreaks ? `, ${msToHuman(d.breakMs)} break` : ""
              }`}
            >
              {/* Tooltip */}
              {isActive && hasActivity && (
                <div className="pointer-events-none absolute -top-1 left-1/2 z-20 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-left shadow-lg">
                  <div className="text-xs font-semibold tabular-nums text-text">
                    {msToHuman(d.focusMs)} focus
                  </div>
                  {showBreaks && (
                    <div className="text-[11px] tabular-nums text-muted">
                      {msToHuman(d.breakMs)} break
                    </div>
                  )}
                </div>
              )}

              {/* Bar track */}
              <div className="flex h-full flex-col justify-end overflow-hidden rounded-md">
                {/* Focus (top of stack) */}
                <div
                  className={`w-full rounded-t-md transition-colors ${
                    isActive ? "bg-accent-hover" : "bg-accent"
                  } ${focusPct > 0 ? "" : "min-h-0"}`}
                  style={{ height: `${focusPct}%` }}
                />
                {/* Break (bottom of stack) */}
                {showBreaks && breakPct > 0 && (
                  <div
                    className={`w-full transition-colors ${
                      isActive ? "bg-muted/60" : "bg-muted/35"
                    }`}
                    style={{ height: `${breakPct}%` }}
                  />
                )}
                {/* Empty-day baseline tick so the column reads as "a day". */}
                {!hasActivity && (
                  <div className="h-[3px] w-full rounded-full bg-border" />
                )}
              </div>

              {/* Day label */}
              <span
                className={`mt-1.5 truncate text-center text-[10px] tabular-nums ${
                  d.isToday
                    ? "font-semibold text-text"
                    : "text-muted"
                }`}
              >
                {d.label}
              </span>
            </button>
          );
        })}
      </div>

      {showBreaks && (
        <div className="mt-3 flex items-center justify-center gap-4 text-[11px] text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-accent" aria-hidden="true" />
            Focus
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-sm bg-muted/35"
              aria-hidden="true"
            />
            Break
          </span>
        </div>
      )}
    </div>
  );
}
