"use client";

// app/projects/[id]/page.tsx
// Project detail — the flagship planning surface. Shows a project's progress,
// schedule status (ahead / behind), focus time, start date and description,
// plus inline editing (ProjectEditor) and the full milestone plan
// (MilestoneList). Reads the id from the route, fetches projects + this
// project's milestones + logs once, then keeps everything in local React state
// with optimistic updates flowing up from the child components.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import type { LogEntry, Milestone, Project } from "@/lib/types";
import {
  ApiError,
  deleteProject,
  getLogs,
  getMilestones,
  getProjects,
} from "@/lib/api";
import {
  dayKeyToEpoch,
  progressOf,
  projectMilestones,
  scheduleStatus,
  type ScheduleState,
} from "@/lib/projects";
import { msToHuman } from "@/lib/format";
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { ProgressBar, type ProgressTone } from "@/components/ui/ProgressBar";
import { PageHeader } from "@/components/ui/PageHeader";
import { cn } from "@/components/ui/cn";
import MilestoneList from "@/components/MilestoneList";
import ProjectEditor from "@/components/ProjectEditor";

const STATE_TONE: Record<ScheduleState, BadgeTone> = {
  ahead: "success",
  "on-track": "accent",
  behind: "danger",
  "no-plan": "muted",
  done: "success",
};

function BackLink() {
  return (
    <Link
      href="/dashboard"
      className="group mb-4 inline-flex items-center gap-1.5 font-mono text-[0.6875rem] font-medium uppercase tracking-wider text-muted transition-colors hover:text-accent-hover"
    >
      <svg
        width={15}
        height={15}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="transition-transform group-hover:-translate-x-0.5"
      >
        <path d="M15 18l-6-6 6-6" />
      </svg>
      Dashboard
    </Link>
  );
}

function Readout({
  label,
  value,
  tone = "default",
  icon,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "accent" | "danger" | "success" | "muted";
  icon?: React.ReactNode;
}) {
  const valueTone =
    tone === "accent"
      ? "text-accent-hover"
      : tone === "danger"
        ? "text-danger"
        : tone === "success"
          ? "text-success"
          : tone === "muted"
            ? "text-muted"
            : "text-text";
  return (
    <div className="rounded-xl border border-border bg-surface-2/40 px-3 py-2.5">
      <p className="eyebrow flex items-center gap-1.5 text-muted">
        {icon}
        {label}
      </p>
      <p
        className={cn(
          "readout mt-1.5 text-base font-semibold tabular-nums",
          valueTone,
        )}
      >
        {value}
      </p>
    </div>
  );
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();

  const [project, setProject] = useState<Project | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([getProjects(), getMilestones(id), getLogs()])
      .then(([projects, ms, allLogs]) => {
        if (!alive) return;
        setProject(projects.find((p) => p.id === id) ?? null);
        setMilestones(ms);
        setLogs(allLogs);
        setLoadError(null);
      })
      .catch((e) => {
        if (!alive) return;
        setLoadError(
          e instanceof ApiError ? e.message : "Couldn't load this project.",
        );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id]);

  const ordered = useMemo(
    () => projectMilestones(milestones, id),
    [milestones, id],
  );
  const progress = useMemo(() => progressOf(ordered), [ordered]);
  const status = useMemo(
    () => (project ? scheduleStatus(project, ordered) : null),
    [project, ordered],
  );
  const focusMs = useMemo(
    () =>
      logs
        .filter(
          (l) =>
            l.kind === "work" &&
            l.status !== "cancelled" &&
            l.projectId === id,
        )
        .reduce((sum, l) => sum + l.activeMs, 0),
    [logs, id],
  );

  const progressTone: ProgressTone =
    status?.state === "behind"
      ? "danger"
      : status?.state === "ahead" || progress.pct === 100
        ? "success"
        : "accent";

  // --- Loading / not-found --------------------------------------------------

  if (loading) {
    return (
      <div
        className="mx-auto flex w-full max-w-3xl flex-col items-center justify-center gap-3 px-4 py-24 sm:px-6"
        aria-label="Loading project"
        role="status"
      >
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-accent" />
        <p className="eyebrow animate-pulse-glow">Loading project</p>
      </div>
    );
  }

  if (loadError || !project) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
        <BackLink />
        <Card className="animate-fade-up p-8 text-center sm:p-10">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-surface-2 text-muted">
            <svg
              width={22}
              height={22}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v5M12 16.5v.01" />
            </svg>
          </div>
          <p className="font-display text-lg font-semibold tracking-tight text-text">
            {loadError ? "Something went wrong" : "Project not found"}
          </p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted">
            {loadError
              ? loadError
              : "This project may have been deleted. It might still appear in your history."}
          </p>
          <Link
            href="/dashboard"
            className="btn-primary mt-6 inline-flex h-11 px-5 text-sm"
          >
            Back to Dashboard
          </Link>
        </Card>
      </div>
    );
  }

  // --- Derived display ------------------------------------------------------

  const startEpoch = project.startDate
    ? dayKeyToEpoch(project.startDate)
    : null;
  const startLabel =
    startEpoch !== null
      ? new Date(startEpoch).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "—";

  async function handleDelete() {
    if (
      !window.confirm(
        "Delete this project and all of its milestones? This can't be undone.",
      )
    ) {
      return;
    }
    try {
      await deleteProject(id);
      router.push("/dashboard");
    } catch (e) {
      window.alert(
        e instanceof ApiError ? e.message : "Couldn't delete the project.",
      );
    }
  }

  const statusTone =
    status?.state === "behind"
      ? "danger"
      : status?.state === "ahead" || status?.state === "done"
        ? "success"
        : status?.state === "no-plan"
          ? "muted"
          : "accent";

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <BackLink />

      <div className="animate-fade-up">
        <PageHeader
          eyebrow="Project"
          title={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className={cn(!!project.completedAt && "text-muted")}>
                {project.name}
              </span>
              {status ? (
                <Badge tone={STATE_TONE[status.state]}>{status.label}</Badge>
              ) : null}
              {project.archived ? <Badge tone="muted">Archived</Badge> : null}
            </span>
          }
          subtitle={
            project.description ? project.description : "No description yet."
          }
          action={
            <ProjectEditor
              project={project}
              onUpdated={setProject}
              onDelete={handleDelete}
            />
          }
        />
      </div>

      <Card
        className="animate-fade-up space-y-5 overflow-hidden p-4 sm:p-6"
        style={{ animationDelay: "60ms" }}
      >
        {/* Progress hero — large readout + instrument track. */}
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow">Progress</p>
            <p className="mt-1.5 text-sm text-muted">
              <span className="readout font-semibold text-text tabular-nums">
                {progress.done}
              </span>{" "}
              of{" "}
              <span className="readout tabular-nums">{progress.total}</span>{" "}
              milestones complete
            </p>
          </div>
          <p
            className={cn(
              "readout shrink-0 text-4xl font-semibold leading-none tabular-nums sm:text-5xl",
              progress.pct === 100 ? "text-success" : "text-text",
            )}
          >
            {progress.pct}
            <span className="text-xl text-muted sm:text-2xl">%</span>
          </p>
        </div>
        <ProgressBar
          value={progress.pct}
          tone={progressTone}
          size="lg"
          label="Project progress"
        />

        {/* Instrument readouts. */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Readout
            label="Focus time"
            tone="accent"
            value={focusMs > 0 ? msToHuman(focusMs) : "—"}
            icon={
              <svg
                width={12}
                height={12}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
            }
          />
          <Readout
            label="Start date"
            tone={startEpoch !== null ? "default" : "muted"}
            value={startLabel}
            icon={
              <svg
                width={12}
                height={12}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="4.5" width="18" height="16" rx="2" />
                <path d="M3 9h18M8 2.5v4M16 2.5v4" />
              </svg>
            }
          />
          <Readout
            label="Status"
            tone={statusTone}
            value={
              status?.state === "no-plan"
                ? "No dates set"
                : status?.label ?? "—"
            }
            icon={
              <svg
                width={12}
                height={12}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
              </svg>
            }
          />
        </div>

        {status && status.nextMilestone && status.state !== "done" ? (
          <div className="flex items-center gap-2.5 rounded-xl border border-border bg-surface-2/30 px-3.5 py-2.5">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent shadow-[0_0_8px_var(--glow)]"
            />
            <p className="min-w-0 truncate text-sm text-muted">
              <span className="eyebrow text-muted">Next up</span>{" "}
              <span className="ml-1 font-medium text-text">
                {status.nextMilestone.title}
              </span>
            </p>
          </div>
        ) : null}
      </Card>

      <div
        className="animate-fade-up mt-8"
        style={{ animationDelay: "120ms" }}
      >
        <MilestoneList
          projectId={id}
          milestones={milestones}
          onChange={setMilestones}
        />
      </div>
    </div>
  );
}
