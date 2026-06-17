"use client";

// app/dashboard/page.tsx
// Projects overview — the main landing for planning work, rendered like a
// mission-control panel. Fetches projects, milestones, and logs, then for each
// active project computes progress (progressOf), ahead/behind status
// (scheduleStatus), the next milestone, and total focus time (summed from work
// logs by projectId). Renders an instrument strip of mono stat readouts, a
// responsive, staggered grid of <ProjectCard/>, and compact secondary lists for
// completed + archived projects. Productivity metrics have MOVED to /metrics.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { LogEntry, Milestone, Project } from "@/lib/types";
import {
  ApiError,
  createProject,
  getLogs,
  getMilestones,
  getProjects,
} from "@/lib/api";
import {
  dayKeyToEpoch,
  isProjectComplete,
  progressOf,
  projectMilestones,
  scheduleStatus,
  type ScheduleStatus,
} from "@/lib/projects";
import { dayKey, msToHuman } from "@/lib/format";
import { cn } from "@/components/ui/cn";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProjectCard } from "@/components/ProjectCard";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Format a milestone targetDate ("YYYY-MM-DD") to e.g. "Jun 24". */
function formatTargetDate(targetDate: string | null): string | null {
  if (!targetDate) return null;
  const e = dayKeyToEpoch(targetDate);
  if (e === null) return null;
  return new Date(e).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

type ActiveView = {
  project: Project;
  milestones: Milestone[];
  done: number;
  total: number;
  pct: number;
  status: ScheduleStatus;
  focusMs: number;
};

export default function DashboardPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  // New-project inline form.
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [p, m, l] = await Promise.all([
          getProjects(),
          getMilestones(),
          getLogs(),
        ]);
        if (cancelled) return;
        setProjects(p);
        setMilestones(m);
        setLogs(l);
      } catch (e) {
        if (cancelled) return;
        setError(
          e instanceof ApiError ? e.message : "Could not load projects.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Focus ms per project id, summed from completed/active work logs.
  const focusByProject = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of logs) {
      if (l.kind !== "work" || l.status === "cancelled" || !l.projectId) {
        continue;
      }
      map.set(l.projectId, (map.get(l.projectId) ?? 0) + Math.max(0, l.activeMs));
    }
    return map;
  }, [logs]);

  // Partition projects into active / completed / archived with computed views.
  const { active, completed, archived } = useMemo(() => {
    const active: ActiveView[] = [];
    const completed: { project: Project; focusMs: number }[] = [];
    const archived: Project[] = [];
    for (const project of projects ?? []) {
      if (project.archived) {
        archived.push(project);
        continue;
      }
      const pms = projectMilestones(milestones, project.id);
      if (isProjectComplete(project, pms)) {
        completed.push({
          project,
          focusMs: focusByProject.get(project.id) ?? 0,
        });
        continue;
      }
      const { total, done, pct } = progressOf(pms);
      active.push({
        project,
        milestones: pms,
        total,
        done,
        pct,
        status: scheduleStatus(project, pms, now),
        focusMs: focusByProject.get(project.id) ?? 0,
      });
    }
    // Surface behind/overdue projects first, then by progress descending.
    const stateRank: Record<string, number> = {
      behind: 0,
      "no-plan": 1,
      "on-track": 2,
      ahead: 3,
      done: 4,
    };
    active.sort((a, b) => {
      const ra = stateRank[a.status.state] ?? 9;
      const rb = stateRank[b.status.state] ?? 9;
      if (ra !== rb) return ra - rb;
      return b.pct - a.pct;
    });
    return { active, completed, archived };
  }, [projects, milestones, focusByProject, now]);

  // Summary strip: active count, milestones due in next 7 days, overdue count.
  const summary = useMemo(() => {
    const todayKey = dayKey(now);
    const horizonKey = dayKey(now + 7 * DAY_MS);
    let dueSoon = 0;
    let overdue = 0;
    for (const view of active) {
      for (const m of view.milestones) {
        if (m.done || !m.targetDate) continue;
        if (m.targetDate < todayKey) overdue += 1;
        else if (m.targetDate <= horizonKey) dueSoon += 1;
      }
    }
    return { activeCount: active.length, dueSoon, overdue };
  }, [active, now]);

  async function handleCreate(e?: React.FormEvent) {
    e?.preventDefault();
    const name = newName.trim();
    if (!name || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const project = await createProject(name);
      router.push(`/projects/${project.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not create project.",
      );
      setSubmitting(false);
    }
  }

  const newProjectButton = (
    <button
      type="button"
      className="btn-primary h-9 px-4 text-sm"
      onClick={() => {
        setCreating(true);
        setError(null);
      }}
    >
      <PlusIcon />
      New project
    </button>
  );

  const loading = projects === null;
  const hasProjects =
    !loading &&
    (active.length > 0 || completed.length > 0 || archived.length > 0);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        eyebrow="Mission control"
        title="Dashboard"
        subtitle="Your active projects and where they stand."
        action={!loading && !creating ? newProjectButton : undefined}
      />

      {/* New-project inline form */}
      {creating ? (
        <Card className="animate-fade-up mb-6 p-4">
          <form
            onSubmit={handleCreate}
            className="flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <input
              autoFocus
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Project name"
              maxLength={120}
              className="h-10 flex-1 rounded-xl border border-border bg-surface-2 px-3 text-sm text-text placeholder:text-faint"
              aria-label="New project name"
            />
            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="btn-primary h-10 px-4 text-sm"
                disabled={!newName.trim() || submitting}
              >
                {submitting ? "Creating…" : "Create"}
              </button>
              <button
                type="button"
                className="btn-secondary h-10 px-4 text-sm"
                onClick={() => {
                  setCreating(false);
                  setNewName("");
                }}
                disabled={submitting}
              >
                Cancel
              </button>
            </div>
          </form>
        </Card>
      ) : null}

      {error ? (
        <div className="mb-6 rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-center text-sm text-danger">
          {error}
        </div>
      ) : null}

      {loading ? (
        <LoadingSkeleton />
      ) : !hasProjects ? (
        <EmptyState
          className="animate-fade-up"
          icon={<FolderIcon />}
          title="No projects on the board"
          description="Create your first project to start planning milestones and tracking progress."
          action={
            !creating ? (
              <button
                type="button"
                className="btn-primary h-9 px-4 text-sm"
                onClick={() => setCreating(true)}
              >
                <PlusIcon />
                New project
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-9">
          {/* Instrument strip — mono stat readouts */}
          <Card
            className="animate-fade-up grid grid-cols-3 divide-x divide-border overflow-hidden p-0"
            style={{ animationDelay: "0ms" }}
          >
            <Readout
              label="Active projects"
              value={summary.activeCount}
              tone="accent"
            />
            <Readout
              label="Due in 7 days"
              value={summary.dueSoon}
              tone={summary.dueSoon > 0 ? "warning" : "muted"}
            />
            <Readout
              label="Overdue"
              value={summary.overdue}
              tone={summary.overdue > 0 ? "danger" : "muted"}
              alert={summary.overdue > 0}
            />
          </Card>

          {/* Active projects grid */}
          <section
            className="animate-fade-up"
            style={{ animationDelay: "80ms" }}
          >
            <div className="mb-3 flex items-center gap-3">
              <h2 className="eyebrow">Active projects</h2>
              <span className="h-px flex-1 bg-border" aria-hidden="true" />
              <span className="readout text-xs text-faint tabular-nums">
                {active.length.toString().padStart(2, "0")}
              </span>
            </div>
            {active.length === 0 ? (
              <Card className="px-4 py-8 text-center text-sm text-muted">
                No active projects. Everything is complete or archived.
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {active.map((v, i) => {
                  const next = v.status.nextMilestone;
                  const todayKey = dayKey(now);
                  const overdue =
                    !!next?.targetDate && next.targetDate < todayKey;
                  return (
                    <ProjectCard
                      key={v.project.id}
                      id={v.project.id}
                      name={v.project.name}
                      description={v.project.description}
                      done={v.done}
                      total={v.total}
                      pct={v.pct}
                      statusState={v.status.state}
                      statusLabel={v.status.label}
                      nextTitle={next?.title ?? null}
                      nextDateLabel={formatTargetDate(next?.targetDate ?? null)}
                      nextOverdue={overdue}
                      focusLabel={msToHuman(v.focusMs)}
                      index={i + 2}
                    />
                  );
                })}
              </div>
            )}
          </section>

          {/* Completed projects */}
          {completed.length > 0 ? (
            <SecondarySection
              title="Completed"
              count={completed.length}
              delayMs={140}
            >
              {completed.map(({ project, focusMs }) => (
                <ProjectLink
                  key={project.id}
                  id={project.id}
                  name={project.name}
                  meta={msToHuman(focusMs)}
                  tone="success"
                />
              ))}
            </SecondarySection>
          ) : null}

          {/* Archived projects */}
          {archived.length > 0 ? (
            <SecondarySection
              title="Archived"
              count={archived.length}
              delayMs={180}
            >
              {archived.map((project) => (
                <ProjectLink
                  key={project.id}
                  id={project.id}
                  name={project.name}
                  meta="Archived"
                  tone="muted"
                />
              ))}
            </SecondarySection>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Sub-components
// ----------------------------------------------------------------------------

/** A single instrument readout in the top stat strip — big mono value + label. */
function Readout({
  label,
  value,
  tone,
  alert,
}: {
  label: string;
  value: number;
  tone: "accent" | "muted" | "warning" | "danger";
  alert?: boolean;
}) {
  const valueColor =
    tone === "warning"
      ? "text-warning"
      : tone === "danger"
        ? "text-danger"
        : tone === "muted"
          ? "text-faint"
          : "text-accent";
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 px-3 py-5 text-center">
      <span className="eyebrow text-faint">{label}</span>
      <span
        className={cn(
          "readout text-3xl font-semibold leading-none tabular-nums",
          valueColor,
          alert && "animate-pulse-glow",
        )}
      >
        {value.toString().padStart(2, "0")}
      </span>
    </div>
  );
}

function SecondarySection({
  title,
  count,
  delayMs,
  children,
}: {
  title: string;
  count: number;
  delayMs: number;
  children: React.ReactNode;
}) {
  return (
    <section
      className="animate-fade-up"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <div className="mb-3 flex items-center gap-3">
        <h2 className="eyebrow text-faint">{title}</h2>
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
        <span className="readout text-xs text-faint tabular-nums">
          {count.toString().padStart(2, "0")}
        </span>
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function ProjectLink({
  id,
  name,
  meta,
  tone,
}: {
  id: string;
  name: string;
  meta: string;
  tone: "success" | "muted";
}) {
  return (
    <Link href={`/projects/${id}`} className="block rounded-xl">
      <Card
        interactive
        className="flex items-center justify-between gap-3 bg-surface/60 px-4 py-3"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              "h-1.5 w-1.5 shrink-0 rounded-full",
              tone === "success" ? "bg-success" : "bg-faint",
            )}
            aria-hidden="true"
          />
          <span className="truncate text-sm font-medium text-muted">
            {name}
          </span>
        </div>
        <span className="readout shrink-0 text-xs text-faint tabular-nums">
          {meta}
        </span>
      </Card>
    </Link>
  );
}

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function FolderIcon() {
  return (
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
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-9" aria-hidden="true">
      <div className="h-[104px] animate-pulse rounded-2xl border border-border bg-surface" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-[196px] animate-pulse rounded-2xl border border-border bg-surface"
          />
        ))}
      </div>
    </div>
  );
}
