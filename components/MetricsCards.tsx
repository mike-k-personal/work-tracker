"use client";

// components/MetricsCards.tsx
// PRESENTATIONAL responsive grid of stat cards. Each card shows a label, a big
// value, and an optional sub-line. No data fetching — the dashboard page
// computes values (via lib/metrics) and passes them in as a flat list.

import type { ReactNode } from "react";

export type MetricCard = {
  /** Stable key (used as React key). */
  id: string;
  /** Small uppercase label above the value. */
  label: string;
  /** The primary value (already formatted). */
  value: ReactNode;
  /** Optional secondary line under the value. */
  sub?: ReactNode;
  /** Tints the value text for emphasis. */
  tone?: "default" | "accent" | "success" | "warning" | "danger";
  /** Lets a card span two columns on wider grids (e.g. a highlight stat). */
  wide?: boolean;
};

const TONE_CLASS: Record<NonNullable<MetricCard["tone"]>, string> = {
  default: "text-text",
  accent: "text-accent",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

export default function MetricsCards({
  cards,
  className = "",
}: {
  cards: MetricCard[];
  className?: string;
}) {
  if (cards.length === 0) return null;

  return (
    <div
      className={`grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 ${className}`}
    >
      {cards.map((c) => (
        <div
          key={c.id}
          className={`flex flex-col rounded-2xl border border-border bg-surface px-4 py-3.5 ${
            c.wide ? "col-span-2" : ""
          }`}
        >
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
            {c.label}
          </span>
          <span
            className={`mt-1 text-2xl font-semibold leading-tight tabular-nums ${
              TONE_CLASS[c.tone ?? "default"]
            }`}
          >
            {c.value}
          </span>
          {c.sub !== undefined && c.sub !== null && (
            <span className="mt-0.5 text-xs text-muted tabular-nums">
              {c.sub}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
