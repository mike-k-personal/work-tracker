"use client";

// app/metrics/page.tsx
// Productivity metrics surface. Client-fetches logs, projects, milestones, and
// the schedule, then derives all stats locally via lib/metrics (NO server
// compute). Sections: range toggle, headline metric cards, "Time by milestone"
// (the key new metric), "Time by project", and a 14-day activity chart with
// inferred break time. Dark-only, blue-dark design system.

import { useEffect, useMemo, useState } from "react";

import type { LogEntry, Milestone, Project, Schedule } from "@/lib/types";
import { ApiError, getLogs, getMilestones, getProjects, getSchedule } from "@/lib/api";
import {
  avgSessionMs,
  currentStreak,
  estimateAccuracy,
  inferredBreakMsForDay,
  medianSessionMs,
  mostProductiveHour,
  objectivesCompleted,
  objectivesTotal,
  perDayActivity,
  sessionsCompleted,
  timeByMilestone,
  timeByProject,
  totalFocusMs,
  workBreakRatio,
  type Range,
} from "@/lib/metrics";
import { dayKey, msToHuman } from "@/lib/format";

import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/components/ui/cn";
import MetricsCards, { type MetricCard } from "@/components/MetricsCards";
import MilestoneBreakdown, {
  type BreakdownRow,
} from "@/components/MilestoneBreakdown";
import ActivityChart, { type ActivityDay } from "@/components/ActivityChart";

const RANGES: { value: Range; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "all", label: "All time" },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Format a 0..23 hour as a friendly clock label, e.g. "3 PM". */
function formatHour(hour: number): string {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric" });
}

/** Section wrapper: an eyebrow header above a card body, staggered in. */
function Section({
  eyebrow,
  title,
  delay = 0,
  children,
}: {
  eyebrow: string;
  title?: string;
  delay?: number;
  children: React.ReactNode;
}) {
  return (
    <section
      className="animate-fade-up mt-9"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="mb-3 flex items-center gap-2.5">
        <span aria-hidden="true" className="h-px w-5 bg-accent/50" />
        <p className="eyebrow">{eyebrow}</p>
        {title ? (
          <h2 className="font-display ml-1 text-base font-semibold tracking-tight text-text">
            {title}
          </h2>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export default function MetricsPage() {
  const [logs, setLogs] = useState<LogEntry[] | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<Range>("week");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getLogs(), getProjects(), getMilestones(), getSchedule()])
      .then(([l, p, m, s]) => {
        if (cancelled) return;
        setLogs(l);
        setProjects(p);
        setMilestones(m);
        setSchedule(s);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setLogs([]);
        setError(
          err instanceof ApiError ? err.message : "Could not load metrics.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // Stable "now" per render pass so range math + chart days agree.
  const now = Date.now();

  const projectNameById = useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects],
  );
  const milestoneNameById = useMemo(
    () => new Map(milestones.map((m) => [m.id, m.title])),
    [milestones],
  );

  const cards: MetricCard[] = useMemo(() => {
    if (!logs) return [];
    const focus = totalFocusMs(logs, range, now);
    const streak = currentStreak(logs, now);
    const sessions = sessionsCompleted(logs, range, now);
    const objDone = objectivesCompleted(logs, range, now);
    const objTotal = objectivesTotal(logs, range, now);
    const avg = avgSessionMs(logs, range, now);
    const median = medianSessionMs(logs, range, now);
    const est = estimateAccuracy(logs, range, now);
    const hour = mostProductiveHour(logs, range, now);
    const wbr = workBreakRatio(logs, range, now);

    const estTone: MetricCard["tone"] =
      est.sampleSize === 0
        ? "default"
        : Math.abs(est.avgOverUnderPct) <= 15
          ? "success"
          : "warning";

    return [
      {
        id: "focus",
        label: "Productive hours",
        value: focus > 0 ? msToHuman(focus) : "0m",
        sub:
          sessions > 0
            ? `${sessions} session${sessions === 1 ? "" : "s"}`
            : "No focus logged yet",
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
        label: "Tasks done",
        value: objTotal > 0 ? `${objDone}/${objTotal}` : "0",
        sub: objTotal > 0 ? "of planned" : "none yet",
        tone: objTotal > 0 && objDone >= objTotal ? "success" : "default",
      },
      {
        id: "avg",
        label: "Avg session",
        value: avg > 0 ? msToHuman(avg) : "0m",
      },
      {
        id: "median",
        label: "Median session",
        value: median > 0 ? msToHuman(median) : "0m",
      },
      {
        id: "estimate",
        label: "Estimate accuracy",
        value:
          est.sampleSize === 0
            ? "—"
            : `${est.avgOverUnderPct >= 0 ? "+" : ""}${Math.round(
                est.avgOverUnderPct,
              )}%`,
        sub:
          est.sampleSize === 0
            ? "no estimates"
            : est.avgOverUnderPct >= 0
              ? "over estimate"
              : "under estimate",
        tone: estTone,
      },
      {
        id: "hour",
        label: "Peak hour",
        value: hour.hour === null ? "—" : formatHour(hour.hour),
        sub: hour.hour === null ? "no data" : msToHuman(hour.focusMs),
      },
      {
        id: "ratio",
        label: "Work / break",
        value:
          wbr.ratio === Infinity
            ? "∞"
            : wbr.ratio === 0
              ? "—"
              : `${wbr.ratio.toFixed(1)}×`,
        sub: "focus vs break",
      },
    ];
  }, [logs, range, now]);

  const milestoneRows: BreakdownRow[] = useMemo(() => {
    if (!logs) return [];
    return timeByMilestone(
      logs,
      milestoneNameById,
      projectNameById,
      range,
      now,
    ).map((m) => ({
      id: m.milestoneId ?? "__none__",
      name: m.name,
      context: m.projectName || undefined,
      focusMs: m.focusMs,
      sessionCount: m.sessionCount,
      muted: m.milestoneId === null,
    }));
  }, [logs, milestoneNameById, projectNameById, range, now]);

  const projectRows: BreakdownRow[] = useMemo(() => {
    if (!logs) return [];
    return timeByProject(logs, projectNameById, range, now).map((p) => ({
      id: p.projectId ?? "__none__",
      name: p.name,
      focusMs: p.focusMs,
      sessionCount: p.sessionCount,
      muted: p.projectId === null,
    }));
  }, [logs, projectNameById, range, now]);

  // 14-day activity chart: build every day back from today (fill gaps with 0)
  // and add inferred break time from the schedule.
  const chartDays: ActivityDay[] = useMemo(() => {
    if (!logs || !schedule) return [];
    const byDay = new Map(perDayActivity(logs).map((d) => [d.dayKey, d]));
    const todayKey = dayKey(now);
    const out: ActivityDay[] = [];
    for (let i = 13; i >= 0; i--) {
      const date = new Date(now - i * DAY_MS);
      const key = dayKey(date.getTime());
      const entry = byDay.get(key);
      out.push({
        dayKey: key,
        label: WEEKDAY[date.getDay()],
        focusMs: entry?.focusMs ?? 0,
        breakMs: inferredBreakMsForDay(logs, schedule, date),
        isToday: key === todayKey,
      });
    }
    return out;
  }, [logs, schedule, now]);

  // ---- Render states ----

  if (logs === null) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <PageHeader
          eyebrow="Observatory"
          title="Metrics"
          subtitle="What you're doing to hit your goals."
        />
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "card animate-pulse",
                i === 0 ? "col-span-2 h-[7.5rem]" : "h-[5.5rem]",
              )}
              style={{ animationDelay: `${i * 55}ms` }}
            />
          ))}
        </div>
      </div>
    );
  }

  const hasLogs = logs.length > 0;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        eyebrow="Observatory"
        title="Metrics"
        subtitle="What you're doing to hit your goals."
        action={
          <div
            role="tablist"
            aria-label="Time range"
            className="inline-flex rounded-xl border border-border bg-surface p-1 shadow-sm"
          >
            {RANGES.map((r) => {
              const selected = r.value === range;
              return (
                <button
                  key={r.value}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setRange(r.value)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 font-mono text-[0.6875rem] font-medium uppercase tracking-wider transition-all duration-200",
                    selected
                      ? "bg-accent-soft text-accent-hover shadow-[inset_0_0_0_1px_var(--color-accent),0_0_12px_-2px_var(--glow)]"
                      : "text-muted hover:text-text",
                  )}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        }
      />

      {error && (
        <div className="animate-fade-in mb-4 flex items-center justify-between gap-3 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-danger">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="shrink-0 rounded-lg border border-danger/40 px-2.5 py-1 font-mono text-[0.6875rem] font-medium uppercase tracking-wider text-danger transition-colors hover:bg-danger/15"
          >
            Retry
          </button>
        </div>
      )}

      {!hasLogs ? (
        <EmptyState
          className="animate-fade-up"
          icon={
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6"
              aria-hidden="true"
            >
              <path d="M3 3v18h18" />
              <path d="M7 14l4-4 3 3 5-6" />
            </svg>
          }
          title="No readings yet"
          description="Start a work session and your focus, streak, and milestone telemetry will light up here."
        />
      ) : (
        <>
          <MetricsCards cards={cards} />

          <Section
            eyebrow="Time by milestone"
            title="What you worked on"
            delay={120}
          >
            <Card className="px-4 py-2 sm:px-5">
              {milestoneRows.length > 0 ? (
                <MilestoneBreakdown rows={milestoneRows} />
              ) : (
                <p className="py-3 font-mono text-xs uppercase tracking-wider text-faint">
                  No focus time in this range.
                </p>
              )}
            </Card>
          </Section>

          <Section eyebrow="Time by project" delay={180}>
            <Card className="px-4 py-2 sm:px-5">
              {projectRows.length > 0 ? (
                <MilestoneBreakdown rows={projectRows} />
              ) : (
                <p className="py-3 font-mono text-xs uppercase tracking-wider text-faint">
                  No focus time in this range.
                </p>
              )}
            </Card>
          </Section>

          <Section eyebrow="Last 14 days" title="Daily activity" delay={240}>
            <Card className="p-4 sm:p-5">
              <ActivityChart days={chartDays} />
            </Card>
          </Section>
        </>
      )}
    </div>
  );
}
