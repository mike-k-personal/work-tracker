"use client";

// components/ActivityChart.tsx
// PRESENTATIONAL per-day activity bar chart built with plain divs + CSS only
// (NO chart library). Each day is a vertical stacked bar: focus (accent gradient)
// sits on top of break (muted) time, scaled to the busiest day. Hovering or
// tapping a bar reveals an exact-value tooltip. No data fetching or timers — the
// caller passes already-bucketed days (one entry per calendar day, oldest first).
// Styled to the "precision instrument" system: a gridded plot field with mono
// axis labels, crisp accent-gradient bars, and the current day highlighted.

import { useState } from "react";
import { msToHuman } from "@/lib/format";
import { cn } from "@/components/ui/cn";

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

const HOUR_MS = 60 * 60 * 1000;

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
        className={cn(
          "rounded-xl border border-dashed border-border bg-surface/60 px-4 py-10 text-center text-sm text-muted",
          className,
        )}
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

  // Build hour-spaced gridlines so the plot field reads as a calibrated axis.
  const peakHours = maxMs / HOUR_MS;
  const tickStepHours = peakHours > 8 ? 4 : peakHours > 4 ? 2 : 1;
  const tickCount = Math.max(1, Math.floor(peakHours / tickStepHours));
  const gridTicks = Array.from({ length: tickCount }, (_, i) => {
    const hours = (i + 1) * tickStepHours;
    return { hours, pct: ((hours * HOUR_MS) / maxMs) * 100 };
  });

  return (
    <div className={className}>
      <div className="flex gap-2">
        {/* Mono y-axis scale (hours). */}
        <div
          className="relative w-7 shrink-0 select-none"
          style={{ height: "176px" }}
          aria-hidden="true"
        >
          {gridTicks.map((t) => (
            <span
              key={t.hours}
              className="absolute right-0 -translate-y-1/2 font-mono text-[0.625rem] tabular-nums text-faint"
              style={{ bottom: `${t.pct}%` }}
            >
              {t.hours}h
            </span>
          ))}
          <span className="absolute bottom-0 right-0 translate-y-1/2 font-mono text-[0.625rem] tabular-nums text-faint">
            0
          </span>
        </div>

        {/* Plot field. */}
        <div className="relative min-w-0 flex-1">
          {/* Horizontal gridlines aligned to the y-axis ticks. */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{ height: "176px" }}
            aria-hidden="true"
          >
            {gridTicks.map((t) => (
              <div
                key={t.hours}
                className="absolute inset-x-0 border-t border-dashed border-border/50"
                style={{ bottom: `${t.pct}%` }}
              />
            ))}
            <div className="absolute inset-x-0 bottom-0 border-t border-border" />
          </div>

          <div
            className="relative flex items-end gap-1.5 sm:gap-2"
            role="list"
            aria-label="Daily activity"
            style={{ height: "176px" }}
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
                  onMouseLeave={() =>
                    setActive((cur) => (cur === d.dayKey ? null : cur))
                  }
                  onFocus={() => setActive(d.dayKey)}
                  onBlur={() =>
                    setActive((cur) => (cur === d.dayKey ? null : cur))
                  }
                  onClick={() =>
                    setActive((cur) => (cur === d.dayKey ? null : d.dayKey))
                  }
                  aria-label={`${d.label}: ${msToHuman(d.focusMs)} focus${
                    showBreaks ? `, ${msToHuman(d.breakMs)} break` : ""
                  }`}
                >
                  {/* Tooltip */}
                  {isActive && hasActivity && (
                    <div className="pointer-events-none absolute -top-1 left-1/2 z-20 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-border-strong bg-surface-2 px-2.5 py-1.5 text-left shadow-[0_8px_28px_-10px_rgb(0_0_0/0.65)]">
                      <div className="readout text-xs font-semibold text-accent-hover">
                        {msToHuman(d.focusMs)}
                      </div>
                      <div className="eyebrow mt-0.5 !text-[0.5625rem] !text-faint">
                        focus
                      </div>
                      {showBreaks && (
                        <div className="mt-1 font-mono text-[0.6875rem] tabular-nums text-muted">
                          {msToHuman(d.breakMs)} break
                        </div>
                      )}
                    </div>
                  )}

                  {/* Today's column highlight rail. */}
                  {d.isToday && (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 bottom-0 top-0 rounded-md bg-accent/5"
                    />
                  )}

                  {/* Bar track */}
                  <div className="relative flex h-full flex-col justify-end overflow-hidden rounded-md">
                    {/* Focus (top of stack) */}
                    <div
                      className={cn(
                        "w-full rounded-t-[3px] bg-gradient-to-t from-accent-2 via-accent-strong to-accent transition-all duration-300",
                        d.isToday && "shadow-[0_0_12px_var(--glow)]",
                        (isActive || d.isToday) && "from-accent-strong to-accent-hover",
                        focusPct > 0 ? "" : "min-h-0",
                      )}
                      style={{ height: `${focusPct}%` }}
                    />
                    {/* Break (bottom of stack) */}
                    {showBreaks && breakPct > 0 && (
                      <div
                        className={cn(
                          "w-full transition-colors",
                          isActive ? "bg-muted/55" : "bg-muted/30",
                        )}
                        style={{ height: `${breakPct}%` }}
                      />
                    )}
                    {/* Empty-day baseline tick so the column reads as "a day". */}
                    {!hasActivity && (
                      <div className="h-[3px] w-full rounded-full bg-border" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* X-axis: mono day labels, today ringed. */}
          <div className="mt-2 flex gap-1.5 sm:gap-2">
            {days.map((d) => (
              <span
                key={d.dayKey}
                className={cn(
                  "min-w-0 flex-1 truncate text-center font-mono text-[0.625rem] tabular-nums tracking-wide",
                  d.isToday
                    ? "font-semibold text-accent"
                    : active === d.dayKey
                      ? "text-text"
                      : "text-faint",
                )}
              >
                {d.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {showBreaks && (
        <div className="mt-4 flex items-center justify-center gap-5 border-t border-border/60 pt-3 font-mono text-[0.625rem] uppercase tracking-wider text-faint">
          <span className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-sm bg-gradient-to-t from-accent-2 to-accent"
              aria-hidden="true"
            />
            Focus
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-sm bg-muted/30"
              aria-hidden="true"
            />
            Break
          </span>
        </div>
      )}
    </div>
  );
}
