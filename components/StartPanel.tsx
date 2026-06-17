"use client";

// components/StartPanel.tsx
// The centered "start a session" panel shown on Home when nothing is active.
//
// Flow: pick the MILESTONE you're working toward (grouped by project — the
// project is implied by the milestone, so there's no separate project step and
// no free-text "main objective"), then list the TASKS for THIS work session, set
// a duration, and go. The session's objective IS the milestone. Planning
// (creating projects / milestones) happens on the Dashboard; this screen is just
// for executing a session against an existing milestone.
//
// The Start button unlocks audio + requests notification permission from the
// click gesture (fire-and-forget, never awaited), then starts a WORK session
// tagged with the milestone (and its project). A secondary "Start break" quick
// action starts an ad-hoc (milestone-less) break. Starting is delegated to the
// parent (Home) via onStartWork / onStartBreak so the active-session state lives
// in one place (useActiveSession).

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import type { Milestone, Objective, Project } from "@/lib/types";
import { unlock } from "@/lib/sound";
import { ensureNotificationPermission } from "@/lib/notify";
import { projectMilestones, dayKeyToEpoch } from "@/lib/projects";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import ObjectiveList from "@/components/ObjectiveList";

// Quick-pick durations (minutes) offered as instrument presets.
const PRESETS = [25, 50, 90];

function fmtTarget(targetDate: string | null): string | null {
  if (!targetDate) return null;
  const e = dayKeyToEpoch(targetDate);
  if (e === null) return null;
  return new Date(e).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="eyebrow mb-1.5 block text-muted">{children}</span>;
}

export default function StartPanel({
  projects,
  milestones,
  defaultWorkMin,
  defaultBreakMin,
  onStartWork,
  onStartBreak,
}: {
  projects: Project[];
  /** All milestones (any project); grouped by project into the picker. */
  milestones: Milestone[];
  defaultWorkMin: number;
  defaultBreakMin: number;
  /** Start a work session; returns once the server responds. */
  onStartWork: (input: {
    projectId: string | null;
    milestoneId: string | null;
    taskName: string;
    objectives: Objective[];
    estimateMs: number;
  }) => Promise<unknown>;
  /** Start an ad-hoc break of `estimateMs` ms. */
  onStartBreak: (estimateMs: number) => Promise<unknown>;
}) {
  const [milestoneId, setMilestoneId] = useState<string | null>(null);
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [minutes, setMinutes] = useState<string>(
    String(Math.max(1, Math.round(defaultWorkMin))),
  );
  const [busy, setBusy] = useState(false);

  // Active projects with at least one OPEN milestone, each with its open
  // milestones in display order — these become the <optgroup> sections.
  const groups = useMemo(
    () =>
      projects
        .filter((p) => !p.archived)
        .map((p) => ({
          project: p,
          open: projectMilestones(milestones, p.id).filter((m) => !m.done),
        }))
        .filter((g) => g.open.length > 0),
    [projects, milestones],
  );
  const hasMilestones = groups.length > 0;

  const selected = useMemo(
    () => milestones.find((m) => m.id === milestoneId) ?? null,
    [milestones, milestoneId],
  );
  const selectedProject = selected
    ? (projects.find((p) => p.id === selected.projectId) ?? null)
    : null;

  const parsedMin = parseInt(minutes, 10);
  const validMin = Number.isFinite(parsedMin) && parsedMin > 0;
  const canStartWork = !busy && validMin && !!selected;

  // Unlock audio + request notifications from the gesture, never blocking start.
  const primeGesture = () => {
    try {
      void Promise.allSettled([unlock(), ensureNotificationPermission()]);
    } catch {
      // ignore — start regardless
    }
  };

  const startWork = async () => {
    if (!canStartWork || !selected) return;
    setBusy(true);
    primeGesture();
    try {
      // The milestone defines the session: project is derived from it and the
      // milestone title becomes the session's objective (taskName).
      await onStartWork({
        projectId: selected.projectId,
        milestoneId: selected.id,
        taskName: selected.title,
        objectives,
        estimateMs: parsedMin * 60_000,
      });
    } finally {
      setBusy(false);
    }
  };

  const startBreak = async () => {
    if (busy) return;
    setBusy(true);
    primeGesture();
    try {
      await onStartBreak(Math.max(1, Math.round(defaultBreakMin)) * 60_000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mx-auto w-full max-w-md p-6 sm:p-7">
      {/* Header */}
      <div className="mb-6">
        <p className="eyebrow mb-2">Focus</p>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-text">
          Start a work session
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          Choose the milestone you&rsquo;re working toward, then list the tasks
          for this session.
        </p>
      </div>

      {/* Milestone — the project is implied by your choice */}
      <div className="mb-5">
        <FieldLabel>Milestone</FieldLabel>
        {hasMilestones ? (
          <div className="relative">
            <select
              value={milestoneId ?? ""}
              disabled={busy}
              onChange={(e) => setMilestoneId(e.target.value || null)}
              className="w-full appearance-none rounded-xl border border-border bg-surface-2 px-3.5 py-3 pr-10 text-base text-text outline-none transition-colors hover:border-border-strong focus:border-accent disabled:opacity-50"
              aria-label="Milestone"
            >
              <option value="" disabled>
                Select a milestone…
              </option>
              {groups.map((g) => (
                <optgroup key={g.project.id} label={g.project.name}>
                  {g.open.map((m) => {
                    const t = fmtTarget(m.targetDate);
                    return (
                      <option key={m.id} value={m.id}>
                        {m.title}
                        {t ? ` · ${t}` : ""}
                      </option>
                    );
                  })}
                </optgroup>
              ))}
            </select>
            <svg
              viewBox="0 0 24 24"
              className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path
                d="M6 9l6 6 6-6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-surface-2/50 px-3.5 py-4 text-sm text-muted">
            No open milestones yet.{" "}
            <Link
              href="/dashboard"
              className="font-medium text-accent-hover hover:underline"
            >
              Plan a project →
            </Link>
          </div>
        )}

        {selected && selectedProject && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <Badge tone="accent">{selectedProject.name}</Badge>
            {fmtTarget(selected.targetDate) ? (
              <Badge tone="muted">Due {fmtTarget(selected.targetDate)}</Badge>
            ) : null}
          </div>
        )}
      </div>

      {/* Tasks for THIS session */}
      <div className="mb-5">
        <FieldLabel>Tasks this session</FieldLabel>
        <ObjectiveList
          objectives={objectives}
          onChange={setObjectives}
          disabled={busy}
        />
      </div>

      {/* Duration — presets + a precise mono stepper */}
      <div className="mb-6">
        <FieldLabel>Duration</FieldLabel>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            {PRESETS.map((m) => {
              const isActive = validMin && parsedMin === m;
              return (
                <button
                  key={m}
                  type="button"
                  disabled={busy}
                  onClick={() => setMinutes(String(m))}
                  aria-pressed={isActive}
                  className={`readout rounded-lg border px-2.5 py-1.5 text-xs font-medium tracking-wide transition-colors disabled:opacity-50 ${
                    isActive
                      ? "border-accent/40 bg-accent-soft text-accent-hover"
                      : "border-border bg-surface-2 text-muted hover:border-border-strong hover:text-text"
                  }`}
                >
                  {m}m
                </button>
              );
            })}
          </div>
          <span className="flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={minutes}
              disabled={busy}
              onChange={(e) => setMinutes(e.target.value)}
              className="readout w-20 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-right text-base outline-none transition-colors focus:border-accent disabled:opacity-50"
              aria-label="Duration in minutes"
            />
            <span className="readout text-xs uppercase tracking-wider text-faint">
              min
            </span>
          </span>
        </div>
      </div>

      <button
        type="button"
        disabled={!canStartWork}
        onClick={startWork}
        className="btn-primary w-full px-4 py-3.5 text-base"
      >
        {busy ? (
          "Starting…"
        ) : (
          <>
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M8 5v14l11-7z" />
            </svg>
            Start session
          </>
        )}
      </button>
      {hasMilestones && !milestoneId && !busy ? (
        <p className="mt-2 text-center text-xs text-faint">
          Pick a milestone to start a work session.
        </p>
      ) : null}

      <button
        type="button"
        disabled={busy}
        onClick={startBreak}
        className="btn-secondary mt-2.5 w-full px-4 py-3 text-sm"
      >
        Start a break instead
      </button>
    </Card>
  );
}
