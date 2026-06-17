// components/ProjectCard.tsx
// Presentational card for one active project on the Dashboard — rendered like a
// mission-control readout panel. Receives only already-computed display props
// (the dashboard does the lib/projects + lib/metrics work) and renders a
// tappable Card linking to the project page: display-font name, a color-coded
// schedule-status badge, a prominent progress bar + mono "{done}/{total} ·
// {pct}%" readout, the next milestone + its mono target date, and a focus-time
// readout. Behind / overdue projects get an urgent danger border + glow.

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { ProgressBar, type ProgressTone } from "@/components/ui/ProgressBar";
import { cn } from "@/components/ui/cn";
import type { ScheduleState } from "@/lib/projects";

export type ProjectCardProps = {
  id: string;
  name: string;
  description?: string;
  /** Milestone progress. */
  done: number;
  total: number;
  pct: number;
  /** Schedule status (from scheduleStatus). */
  statusState: ScheduleState;
  statusLabel: string;
  /** Next open milestone, pre-formatted. */
  nextTitle: string | null;
  nextDateLabel: string | null;
  /** Whether the next milestone is overdue (past target, still open). */
  nextOverdue?: boolean;
  /** Total focus time on the project, pre-formatted (e.g. "3h 20m"). */
  focusLabel: string;
  /** Position in the grid — drives the staggered entrance reveal. */
  index?: number;
};

/** Schedule state -> Badge tone (per the design system mapping). */
const STATE_TONE: Record<ScheduleState, BadgeTone> = {
  ahead: "success",
  "on-track": "accent",
  behind: "danger",
  "no-plan": "muted",
  done: "success",
};

/** Schedule state -> ProgressBar tone. */
const STATE_PROGRESS_TONE: Record<ScheduleState, ProgressTone> = {
  ahead: "success",
  "on-track": "accent",
  behind: "danger",
  "no-plan": "accent",
  done: "success",
};

/** Short instrument glyph that prefixes the schedule label inside the badge. */
const STATE_GLYPH: Record<ScheduleState, string> = {
  ahead: "▲",
  "on-track": "●",
  behind: "▾",
  "no-plan": "○",
  done: "✓",
};

function FlagIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5 shrink-0"
      aria-hidden="true"
    >
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V4s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5 shrink-0"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function ProjectCard({
  id,
  name,
  description,
  done,
  total,
  pct,
  statusState,
  statusLabel,
  nextTitle,
  nextDateLabel,
  nextOverdue,
  focusLabel,
  index = 0,
}: ProjectCardProps) {
  // Behind / overdue projects read as urgent: a danger hairline + soft red glow.
  const urgent = statusState === "behind" || !!nextOverdue;

  return (
    <Link
      href={`/projects/${id}`}
      className="animate-fade-up block rounded-2xl focus:outline-none"
      style={{ animationDelay: `${index * 60}ms` }}
      aria-label={`Open project ${name}`}
    >
      <Card
        interactive
        className={cn(
          "group flex h-full flex-col gap-4 p-5",
          urgent &&
            "border-danger/40 shadow-[0_0_22px_-6px_rgb(251_113_133/0.5)] hover:border-danger/60",
        )}
      >
        {/* Header: project name + schedule-status badge */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-display text-lg font-semibold leading-tight tracking-tight text-text">
              {name}
            </h3>
            {description ? (
              <p className="mt-1 line-clamp-2 text-sm text-muted">
                {description}
              </p>
            ) : null}
          </div>
          <Badge tone={STATE_TONE[statusState]} className="shrink-0">
            <span aria-hidden="true" className="text-[0.6em] leading-none">
              {STATE_GLYPH[statusState]}
            </span>
            {statusLabel}
          </Badge>
        </div>

        {/* Progress — prominent bar + mono readout */}
        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <span className="eyebrow text-faint">Progress</span>
            <span
              className={cn(
                "readout text-sm tabular-nums",
                urgent ? "text-danger" : "text-text",
              )}
            >
              {done}/{total}
              <span className="text-faint"> · </span>
              {pct}%
            </span>
          </div>
          <ProgressBar
            value={pct}
            tone={STATE_PROGRESS_TONE[statusState]}
            size="md"
            label={`${name} progress`}
          />
          <p className="mt-1 font-mono text-[0.625rem] uppercase tracking-wider text-faint">
            {total === 1 ? "1 milestone" : `${total} milestones`}
          </p>
        </div>

        {/* Next milestone — title + mono target date */}
        <div className="flex items-center gap-2 text-sm">
          <span
            className={cn(
              "shrink-0",
              nextOverdue
                ? "text-danger"
                : nextTitle
                  ? "text-accent/70"
                  : "text-faint",
            )}
          >
            <FlagIcon />
          </span>
          {nextTitle ? (
            <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
              <span className="truncate text-text">{nextTitle}</span>
              {nextDateLabel ? (
                <span
                  className={cn(
                    "readout shrink-0 text-xs tabular-nums",
                    nextOverdue ? "text-danger" : "text-muted",
                  )}
                >
                  {nextDateLabel}
                </span>
              ) : null}
            </span>
          ) : (
            <span className="text-faint">No open milestones</span>
          )}
        </div>

        {/* Footer: total focus-time readout */}
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-3">
          <span className="flex items-center gap-1.5 text-faint">
            <ClockIcon />
            <span className="eyebrow text-faint">Focus</span>
          </span>
          <span className="readout text-sm tabular-nums text-muted">
            {focusLabel}
          </span>
        </div>
      </Card>
    </Link>
  );
}

export default ProjectCard;
