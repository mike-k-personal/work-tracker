"use client";

// app/dashboard/page.tsx
// Productivity metrics dashboard. Fetches logs (+ schedule for inferred-gap
// breaks), computes everything via the pure helpers in lib/metrics, and renders
// stat cards + a ~14-day activity bar chart. Cancelled sessions are excluded by
// the metrics layer. All live-time rendering happens after mount (client
// component) to avoid hydration drift.

import { useEffect, useMemo, useState } from "react";
import type { LogEntry, Project, Schedule } from "@/lib/types";
import { ApiError, getLogs, getProjects, getSchedule } from "@/lib/api";
import {
  type Range,
  type ProjectTime,
  avgSessionMs,
  currentStreak,
  estimateAccuracy,
  inferredBreakMsForDay,
  medianSessionMs,
  mostProductiveHour,
  objectiveCompletionRate,
  objectivesCompleted,
  objectivesTotal,
  perDayActivity,
  sessionsCompleted,
  timeByProject,
  totalFocusMs,
  workBreakRatio,
} from "@/lib/metrics";
import { dayKey, msToHuman } from "@/lib/format";
import MetricsCards, { type MetricCard } from "@/components/MetricsCards";
import ActivityChart, { type ActivityDay } from "@/components/ActivityChart";

const RANGE_OPTIONS: { value: Range; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "all", label: "All time" },
];

const CHART_DAYS = 14;

/** Format a 0..23 local hour as "3 PM". */
function prettyHour(hour: number): string {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric" });
}

/** Short weekday label for a local-midnight Date, e.g. "Mon". */
function weekdayLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: "short" });
}

export default function DashboardPage() {
  const [logs, setLogs] = useState<LogEntry[] | null>(null);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<Range>("week");
  // Captured once on mount so all range math + the chart agree on "now".
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [l, s, p] = await Promise.all([
          getLogs(),
          getSchedule(),
          getProjects(),
        ]);
        if (cancelled) return;
        setLogs(l);
        setSchedule(s);
        setProjects(p);
      } catch (e) {
        if (cancelled) return;
        setError(
          e instanceof ApiError ? e.message : "Could not load dashboard data.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Card metrics (recompute when logs / range change) -------------------
  const cards: MetricCard[] = useMemo(() => {
    if (!logs) return [];

    const focus = totalFocusMs(logs, range, now);
    const sessions = sessionsCompleted(logs, range, now);
    const objDone = objectivesCompleted(logs, range, now);
    const objAll = objectivesTotal(logs, range, now);
    const objRate = objectiveCompletionRate(logs, range, now);
    const acc = estimateAccuracy(logs, range, now);
    const avg = avgSessionMs(logs, range, now);
    const median = medianSessionMs(logs, range, now);
    const mph = mostProductiveHour(logs, range, now);
    const wbr = workBreakRatio(logs, range, now);
    const streak = currentStreak(logs, now);

    // Estimate accuracy: positive % = ran over the original estimate.
    const accSign = acc.avgOverUnderPct > 0 ? "+" : "";
    const accValue =
      acc.sampleSize === 0
        ? "—"
        : `${accSign}${Math.round(acc.avgOverUnderPct)}%`;
    const accSub =
      acc.sampleSize === 0
        ? "no estimates yet"
        : acc.avgOverUnderPct > 0
          ? `over estimate · n=${acc.sampleSize}`
          : acc.avgOverUnderPct < 0
            ? `under estimate · n=${acc.sampleSize}`
            : `on target · n=${acc.sampleSize}`;

    const wbrValue =
      wbr.ratio === Infinity
        ? "∞"
        : wbr.ratio === 0
          ? "—"
          : `${wbr.ratio.toFixed(2)}×`;

    return [
      {
        id: "focus",
        label: "Focus time",
        value: msToHuman(focus),
        sub: rangeSubLabel(range),
        tone: "accent",
        wide: true,
      },
      {
        id: "streak",
        label: "Day streak",
        value: streak,
        sub: streak === 1 ? "day" : "days",
        tone: streak > 0 ? "success" : "default",
      },
      {
        id: "sessions",
        label: "Sessions",
        value: sessions,
        sub: "completed",
      },
      {
        id: "objectives",
        label: "Objectives",
        value: `${objDone}/${objAll}`,
        sub:
          objAll === 0
            ? "none yet"
            : `${Math.round(objRate * 100)}% done`,
      },
      {
        id: "avg",
        label: "Avg session",
        value: avg > 0 ? msToHuman(avg) : "—",
        sub: "per work session",
      },
      {
        id: "median",
        label: "Median session",
        value: median > 0 ? msToHuman(median) : "—",
        sub: "typical length",
      },
      {
        id: "accuracy",
        label: "Estimate accuracy",
        value: accValue,
        sub: accSub,
        tone:
          acc.sampleSize === 0
            ? "default"
            : Math.abs(acc.avgOverUnderPct) <= 15
              ? "success"
              : "warning",
      },
      {
        id: "mph",
        label: "Most productive",
        value: mph.hour === null ? "—" : prettyHour(mph.hour),
        sub: mph.hour === null ? "no data" : msToHuman(mph.focusMs),
      },
      {
        id: "wbr",
        label: "Work / break",
        value: wbrValue,
        sub: "logged ratio",
      },
    ];
  }, [logs, range, now]);

  // ---- Activity chart: last ~14 calendar days ------------------------------
  const activityDays: ActivityDay[] = useMemo(() => {
    if (!logs || !schedule) return [];

    // Per-day focus (and explicit break) from the metrics helper.
    const byDay = new Map(perDayActivity(logs).map((d) => [d.dayKey, d]));
    const todayKey = dayKey(now);

    const out: ActivityDay[] = [];
    // Walk from (CHART_DAYS - 1) days ago up to today, one local day per step.
    const cursor = new Date(now);
    cursor.setHours(0, 0, 0, 0);
    cursor.setDate(cursor.getDate() - (CHART_DAYS - 1));

    for (let i = 0; i < CHART_DAYS; i++) {
      const date = new Date(cursor);
      const key = dayKey(date.getTime());
      const focusMs = byDay.get(key)?.focusMs ?? 0;
      // Break time per the plan = explicit logged breaks + inferred gaps in
      // scheduled work windows for that day.
      const breakMs = inferredBreakMsForDay(logs, schedule, date);
      out.push({
        dayKey: key,
        label: weekdayLabel(date),
        focusMs,
        breakMs,
        isToday: key === todayKey,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return out;
  }, [logs, schedule, now]);

  // ---- Time by project (current range) -------------------------------------
  const projectTimes: ProjectTime[] = useMemo(() => {
    if (!logs) return [];
    const nameById = new Map(projects.map((p) => [p.id, p.name]));
    return timeByProject(logs, nameById, range, now);
  }, [logs, projects, range, now]);

  // ---- Render --------------------------------------------------------------
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted">
          Your focus, sessions, and consistency over time.
        </p>
      </header>

      {/* Range toggle */}
      <div
        role="tablist"
        aria-label="Metrics range"
        className="mb-5 inline-flex rounded-xl border border-border bg-surface p-1"
      >
        {RANGE_OPTIONS.map((opt) => {
          const selected = range === opt.value;
          return (
            <button
              key={opt.value}
              role="tab"
              type="button"
              aria-selected={selected}
              onClick={() => setRange(opt.value)}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
                selected
                  ? "bg-accent text-accent-contrast"
                  : "text-muted hover:text-text"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {error ? (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-6 text-center text-sm text-danger">
          {error}
        </div>
      ) : !logs || !schedule ? (
        <LoadingSkeleton />
      ) : logs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface px-4 py-12 text-center">
          <p className="text-sm font-medium text-text">No sessions yet</p>
          <p className="mt-1 text-sm text-muted">
            Start a work session from Home and your metrics will appear here.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <MetricsCards cards={cards} />

          <section>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                Time by project
              </h2>
              <span className="text-xs text-muted">{rangeSubLabel(range)}</span>
            </div>
            <ProjectBreakdown projects={projectTimes} />
          </section>

          <section>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                Last {CHART_DAYS} days
              </h2>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-4">
              <ActivityChart days={activityDays} />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

/** Sub-label describing the active range for the headline focus card. */
function rangeSubLabel(range: Range): string {
  switch (range) {
    case "today":
      return "today";
    case "week":
      return "last 7 days";
    case "all":
      return "all time";
  }
}

/** Horizontal bar list of focus time per project for the active range. */
function ProjectBreakdown({ projects }: { projects: ProjectTime[] }) {
  if (projects.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-muted">
        No work sessions in this range yet.
      </div>
    );
  }
  const max = Math.max(...projects.map((p) => p.focusMs), 1);
  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-border bg-surface p-4">
      {projects.map((p) => {
        const pct = Math.max(2, Math.round((p.focusMs / max) * 100));
        const unassigned = p.projectId === null;
        return (
          <div key={p.projectId ?? "__none__"}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span
                className={`truncate text-sm font-medium ${
                  unassigned ? "text-muted" : "text-text"
                }`}
              >
                {p.name}
              </span>
              <span className="shrink-0 text-xs text-muted tabular-nums">
                {msToHuman(p.focusMs)} · {p.sessionCount}
                {p.sessionCount === 1 ? " session" : " sessions"}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className={`h-full rounded-full ${
                  unassigned ? "bg-border" : "bg-accent"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden="true">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className={`h-[88px] animate-pulse rounded-2xl border border-border bg-surface ${
              i === 0 ? "col-span-2" : ""
            }`}
          />
        ))}
      </div>
      <div className="h-[240px] animate-pulse rounded-2xl border border-border bg-surface" />
    </div>
  );
}
