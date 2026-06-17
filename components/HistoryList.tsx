"use client";

// components/HistoryList.tsx
// PRESENTATIONAL day-grouped history list, rendered as a precision INSTRUMENT
// LOG / ledger. Given a flat list of LogEntry, it groups by LOCAL day (newest
// first), renders a per-day header as a mono date readout with a hairline rule +
// a daily focus total, and one tappable ledger row per entry (work or break).
// Each row shows task/label, project + milestone Badges, a mono time range,
// mono active duration, tasks done/total, and a cancelled state. No data
// fetching — the page passes `logs` and handles loading.

import Link from "next/link";

import type { LogEntry } from "@/lib/types";
import { dayKey, msToHuman, prettyTime } from "@/lib/format";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

type DayGroup = {
  key: string;
  /** Representative epoch for the day (used for the header label + sort). */
  epoch: number;
  entries: LogEntry[];
  /** Total counted focus (completed work) ms for the day. */
  focusMs: number;
};

/** Group logs by local day, newest day first; entries newest-first within a day. */
function groupByDay(logs: LogEntry[]): DayGroup[] {
  const map = new Map<string, DayGroup>();

  for (const log of logs) {
    const key = dayKey(log.startedAt);
    let group = map.get(key);
    if (!group) {
      group = { key, epoch: log.startedAt, entries: [], focusMs: 0 };
      map.set(key, group);
    }
    group.entries.push(log);
    // Track the latest start in the day for a stable header epoch.
    if (log.startedAt > group.epoch) group.epoch = log.startedAt;
    if (log.kind === "work" && log.status === "completed") {
      group.focusMs += log.activeMs;
    }
  }

  const groups = [...map.values()];
  groups.sort((a, b) => b.epoch - a.epoch);
  for (const g of groups) {
    g.entries.sort((a, b) => b.startedAt - a.startedAt);
  }
  return groups;
}

/** Mono instrument date label, e.g. "MON · JUN 16". Uppercased for the readout. */
function monoDateLabel(epoch: number): string {
  const d = new Date(epoch);
  const wd = d.toLocaleDateString(undefined, { weekday: "short" });
  const md = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${wd} · ${md}`.toUpperCase();
}

/** "MON JUN 16" spoken-friendly aria label for the day section. */
function dayAria(epoch: number): string {
  return new Date(epoch).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function EntryRow({ entry }: { entry: LogEntry }) {
  const isWork = entry.kind === "work";
  const cancelled = entry.status === "cancelled";

  // Status indicator: accent = work, success = break, danger = cancelled.
  const dotTone = cancelled
    ? "bg-danger shadow-[0_0_8px_var(--glow)]"
    : isWork
      ? "bg-accent shadow-[0_0_8px_var(--glow)]"
      : "bg-success";

  return (
    <Link
      href={`/history/${encodeURIComponent(entry.id)}`}
      className="group block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
    >
      <Card
        interactive
        className="flex items-stretch gap-0 overflow-hidden p-0"
      >
        {/* Left rail: status dot + a hairline accent spine on the work tone. */}
        <span
          className="flex w-9 shrink-0 items-center justify-center self-stretch border-r border-border/70 bg-bg-2/40"
          aria-hidden="true"
        >
          <span
            className={`h-2 w-2 rounded-full ${dotTone} ${
              cancelled ? "opacity-80" : ""
            }`}
          />
        </span>

        <div className="min-w-0 flex-1 px-4 py-3.5">
          <div className="flex items-start gap-2">
            <span
              className={`min-w-0 flex-1 truncate text-sm font-medium leading-snug ${
                cancelled ? "text-faint line-through" : "text-text"
              }`}
            >
              {entry.taskName || (isWork ? "Untitled session" : "Break")}
            </span>
            {/* Mono active duration — the headline readout for each row. */}
            <span
              className={`readout shrink-0 text-sm tabular-nums ${
                cancelled ? "text-faint line-through" : "text-text"
              }`}
            >
              {msToHuman(entry.activeMs)}
            </span>
          </div>

          {/* Project + milestone tags (work) or a Break chip. */}
          {isWork && (entry.projectName || entry.milestoneName) ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {entry.projectName && (
                <Badge tone="accent" className="max-w-full truncate">
                  {entry.projectName}
                </Badge>
              )}
              {entry.milestoneName && (
                <Badge tone="muted" className="max-w-full truncate">
                  {entry.milestoneName}
                </Badge>
              )}
              {cancelled && <Badge tone="danger">Cancelled</Badge>}
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {isWork ? (
                <Badge tone="muted">Unassigned</Badge>
              ) : (
                <Badge tone="success">Break</Badge>
              )}
              {cancelled && <Badge tone="danger">Cancelled</Badge>}
            </div>
          )}

          {/* Mono instrument readout strip: time range · tasks. */}
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[0.6875rem] tracking-tight text-faint tabular-nums">
            <span className="text-muted">
              {prettyTime(entry.startedAt)} – {prettyTime(entry.endedAt)}
            </span>
            {isWork && entry.objectivesTotal > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  {entry.objectivesCompleted}/{entry.objectivesTotal} tasks
                </span>
              </>
            )}
          </div>
        </div>

        {/* Chevron affordance. */}
        <span
          className="flex w-8 shrink-0 items-center justify-center self-center pr-1 text-faint transition-colors group-hover:text-accent"
          aria-hidden="true"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
        </span>
      </Card>
    </Link>
  );
}

export default function HistoryList({ logs }: { logs: LogEntry[] }) {
  const groups = groupByDay(logs);

  if (groups.length === 0) {
    return (
      <EmptyState
        icon={
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 3v18h18" />
            <path d="m7 14 4-4 3 3 5-6" />
          </svg>
        }
        title="No sessions logged"
        description="Completed work sessions and breaks will appear here as an instrument log, grouped by day."
      />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {groups.map((group, gi) => (
        <section
          key={group.key}
          aria-label={dayAria(group.epoch)}
          className="animate-fade-up"
          style={{ animationDelay: `${gi * 70}ms` }}
        >
          {/* Day header: mono date readout, hairline rule, mono focus total. */}
          <div className="mb-3 flex items-center gap-3">
            <span className="font-mono text-[0.6875rem] font-medium uppercase tracking-[0.18em] text-muted tabular-nums">
              {monoDateLabel(group.epoch)}
            </span>
            <span
              aria-hidden="true"
              className="h-px flex-1 bg-gradient-to-r from-border-strong/80 to-transparent"
            />
            {group.focusMs > 0 && (
              <span className="readout shrink-0 text-[0.6875rem] font-medium uppercase tracking-wider text-accent/80 tabular-nums">
                {msToHuman(group.focusMs)} focus
              </span>
            )}
          </div>

          <div className="flex flex-col gap-2.5">
            {group.entries.map((entry) => (
              <EntryRow key={entry.id} entry={entry} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
