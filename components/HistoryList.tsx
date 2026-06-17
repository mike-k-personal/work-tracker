"use client";

// components/HistoryList.tsx
// PRESENTATIONAL day-grouped history list. Given a flat list of LogEntry, it
// groups by LOCAL day (newest first), renders a per-day section header with a
// daily focus total, and one tappable row per entry (work or break). Each row
// shows task/label, time range, active duration, objectives done/total, and a
// status badge. No data fetching — the page passes `logs` and handles loading.

import Link from "next/link";

import type { LogEntry } from "@/lib/types";
import {
  dayKey,
  msToHuman,
  prettyDay,
  prettyTime,
} from "@/lib/format";

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

function StatusBadge({ status }: { status: LogEntry["status"] }) {
  const completed = status === "completed";
  return (
    <span
      className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        completed
          ? "bg-success/15 text-success"
          : "bg-danger/15 text-danger"
      }`}
    >
      {completed ? "Completed" : "Cancelled"}
    </span>
  );
}

function EntryRow({ entry }: { entry: LogEntry }) {
  const isWork = entry.kind === "work";
  const cancelled = entry.status === "cancelled";

  return (
    <Link
      href={`/history/${encodeURIComponent(entry.id)}`}
      className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-3 transition-colors hover:border-accent/50 hover:bg-surface-2 active:bg-surface-2"
    >
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${
          isWork ? "bg-accent" : "bg-success"
        }`}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={`truncate text-sm font-medium ${
              cancelled ? "text-muted line-through" : "text-text"
            }`}
          >
            {entry.taskName || (isWork ? "Untitled session" : "Break")}
          </span>
          {isWork && entry.projectName && (
            <span className="shrink-0 rounded-md bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
              {entry.projectName}
            </span>
          )}
          {!isWork && (
            <span className="shrink-0 rounded-md bg-success/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success">
              Break
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted tabular-nums">
          <span>
            {prettyTime(entry.startedAt)} – {prettyTime(entry.endedAt)}
          </span>
          <span aria-hidden="true">·</span>
          <span>{msToHuman(entry.activeMs)}</span>
          {isWork && entry.objectivesTotal > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span>
                {entry.objectivesCompleted}/{entry.objectivesTotal} done
              </span>
            </>
          )}
        </div>
      </div>
      <StatusBadge status={entry.status} />
    </Link>
  );
}

export default function HistoryList({ logs }: { logs: LogEntry[] }) {
  const groups = groupByDay(logs);

  if (groups.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface px-4 py-12 text-center">
        <p className="text-sm font-medium text-text">No sessions yet</p>
        <p className="mt-1 text-xs text-muted">
          Completed work sessions and breaks will show up here, grouped by day.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <section key={group.key} aria-label={prettyDay(group.epoch)}>
          <div className="mb-2 flex items-baseline justify-between gap-2 px-1">
            <h2 className="text-sm font-semibold tracking-tight text-text">
              {prettyDay(group.epoch)}
            </h2>
            {group.focusMs > 0 && (
              <span className="text-[11px] text-muted tabular-nums">
                {msToHuman(group.focusMs)} focus
              </span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {group.entries.map((entry) => (
              <EntryRow key={entry.id} entry={entry} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
