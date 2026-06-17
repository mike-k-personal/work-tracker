"use client";

// components/EntryEditor.tsx
// Edit form for a single LogEntry. Lets the user edit the task name, reassign
// the project AND its milestone, edit the tasks (objectives) list, the start &
// end times, and the status (completed / cancelled). Calls back with a
// Partial<LogEntry> patch on save; the parent persists it via updateLog (which
// re-snapshots project/milestone names). Milestones for the selected project are
// loaded on demand. Styled to the blue-dark design system.

import { useEffect, useMemo, useState } from "react";

import type { LogEntry, Milestone, Objective, Project } from "@/lib/types";
import { getMilestones } from "@/lib/api";
import { dayKeyToEpoch } from "@/lib/projects";
import { Card } from "@/components/ui/Card";

/** epoch ms -> value for an <input type="datetime-local"> in LOCAL time. */
function epochToLocalInput(epoch: number): string {
  const d = new Date(epoch);
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/** datetime-local string (LOCAL time) -> epoch ms, or null if unparseable. */
function localInputToEpoch(value: string): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Pretty short label for a milestone's target date, e.g. "Jun 24". */
function targetLabel(targetDate: string | null): string {
  const e = dayKeyToEpoch(targetDate ?? "");
  if (e === null) return "";
  return new Date(e).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export type EntryEditorProps = {
  entry: LogEntry;
  saving?: boolean;
  /** Available projects for reassigning a work entry (work entries only). */
  projects?: Project[];
  onSave: (patch: Partial<LogEntry>) => void | Promise<void>;
  onCancel: () => void;
};

export default function EntryEditor({
  entry,
  saving = false,
  projects = [],
  onSave,
  onCancel,
}: EntryEditorProps) {
  const isWork = entry.kind === "work";

  const [taskName, setTaskName] = useState(entry.taskName);
  const [projectId, setProjectId] = useState<string | null>(entry.projectId);
  const [milestoneId, setMilestoneId] = useState<string | null>(
    entry.milestoneId,
  );
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [objectives, setObjectives] = useState<Objective[]>(() =>
    entry.objectives.map((o) => ({ ...o })),
  );
  const [startInput, setStartInput] = useState(() =>
    epochToLocalInput(entry.startedAt),
  );
  const [endInput, setEndInput] = useState(() =>
    epochToLocalInput(entry.endedAt),
  );
  const [status, setStatus] = useState<LogEntry["status"]>(entry.status);
  const [newObjective, setNewObjective] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const startedAt = useMemo(() => localInputToEpoch(startInput), [startInput]);
  const endedAt = useMemo(() => localInputToEpoch(endInput), [endInput]);

  // Project options: the available projects, plus the entry's current project if
  // it's missing from the list (e.g. archived) so it still shows as selected.
  const projectOptions = useMemo(() => {
    const opts = projects.map((p) => ({ id: p.id, name: p.name }));
    if (entry.projectId && !projects.some((p) => p.id === entry.projectId)) {
      opts.push({
        id: entry.projectId,
        name: entry.projectName || "(unknown project)",
      });
    }
    return opts;
  }, [projects, entry.projectId, entry.projectName]);

  // Load milestones whenever the selected project changes. If the project is
  // cleared, no milestones apply (and we clear the selection).
  useEffect(() => {
    if (!isWork || !projectId) {
      setMilestones([]);
      return;
    }
    let cancelled = false;
    void getMilestones(projectId)
      .then((m) => {
        if (!cancelled) setMilestones(m);
      })
      .catch(() => {
        if (!cancelled) setMilestones([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isWork, projectId]);

  // Milestone options: loaded milestones for the project, plus the entry's
  // current milestone if it isn't in the list (e.g. deleted) so it stays shown.
  const milestoneOptions = useMemo(() => {
    const opts = milestones.map((m) => ({
      id: m.id,
      label: m.title + (m.targetDate ? ` · ${targetLabel(m.targetDate)}` : ""),
    }));
    if (
      milestoneId &&
      entry.milestoneId === milestoneId &&
      !milestones.some((m) => m.id === milestoneId)
    ) {
      opts.push({
        id: milestoneId,
        label: entry.milestoneName || "(unknown milestone)",
      });
    }
    return opts;
  }, [milestones, milestoneId, entry.milestoneId, entry.milestoneName]);

  function handleProjectChange(value: string) {
    const next = value || null;
    setProjectId(next);
    // A milestone belongs to a project — clear it when the project changes.
    setMilestoneId(null);
  }

  function updateObjective(id: string, patch: Partial<Objective>) {
    setObjectives((prev) =>
      prev.map((o) => (o.id === id ? { ...o, ...patch } : o)),
    );
  }

  function removeObjective(id: string) {
    setObjectives((prev) => prev.filter((o) => o.id !== id));
  }

  function addObjective() {
    const text = newObjective.trim();
    if (!text) return;
    setObjectives((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        text,
        done: false,
        createdAt: Date.now(),
      },
    ]);
    setNewObjective("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (startedAt === null) {
      setFormError("Start time is invalid.");
      return;
    }
    if (endedAt === null) {
      setFormError("End time is invalid.");
      return;
    }
    if (endedAt < startedAt) {
      setFormError("End time cannot be before the start time.");
      return;
    }

    const cleanObjectives = objectives
      .map((o) => ({ ...o, text: o.text.trim() }))
      .filter((o) => o.text.length > 0);

    void onSave({
      taskName: taskName.trim() || (isWork ? "Untitled session" : "Break"),
      objectives: cleanObjectives,
      startedAt,
      endedAt,
      status,
      ...(isWork ? { projectId, milestoneId } : {}),
    });
  }

  const fieldClass =
    "w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm text-text outline-none transition-colors focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]";

  const labelClass =
    "mb-1.5 block font-mono text-[0.625rem] font-medium uppercase tracking-[0.16em] text-faint";

  return (
    <Card className="p-5 sm:p-6">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* Task name */}
      <div>
        <label htmlFor="entry-task" className={labelClass}>
          {isWork ? "Task name" : "Break label"}
        </label>
        <input
          id="entry-task"
          type="text"
          value={taskName}
          onChange={(e) => setTaskName(e.target.value)}
          placeholder={isWork ? "What were you working on?" : "Break"}
          className={fieldClass}
        />
      </div>

      {/* Project + milestone (work only) */}
      {isWork && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="entry-project" className={labelClass}>
              Project
            </label>
            <select
              id="entry-project"
              value={projectId ?? ""}
              onChange={(e) => handleProjectChange(e.target.value)}
              className={fieldClass}
            >
              <option value="">No project</option>
              {projectOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="entry-milestone" className={labelClass}>
              Milestone
            </label>
            <select
              id="entry-milestone"
              value={milestoneId ?? ""}
              onChange={(e) => setMilestoneId(e.target.value || null)}
              disabled={!projectId || milestoneOptions.length === 0}
              className={`${fieldClass} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <option value="">No milestone</option>
              {milestoneOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Times */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="entry-start" className={labelClass}>
            Start
          </label>
          <input
            id="entry-start"
            type="datetime-local"
            value={startInput}
            onChange={(e) => setStartInput(e.target.value)}
            className={`${fieldClass} tabular-nums`}
          />
        </div>
        <div>
          <label htmlFor="entry-end" className={labelClass}>
            End
          </label>
          <input
            id="entry-end"
            type="datetime-local"
            value={endInput}
            onChange={(e) => setEndInput(e.target.value)}
            className={`${fieldClass} tabular-nums`}
          />
        </div>
      </div>

      {/* Status */}
      <div>
        <span className={labelClass}>Status</span>
        <div className="flex gap-2">
          {(["completed", "cancelled"] as const).map((s) => {
            const active = status === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                aria-pressed={active}
                className={`flex-1 rounded-xl border px-3 py-2.5 font-mono text-xs font-medium uppercase tracking-wider transition-colors ${
                  active
                    ? s === "completed"
                      ? "border-success/50 bg-success/15 text-success"
                      : "border-danger/50 bg-danger/15 text-danger"
                    : "border-border bg-surface-2 text-muted hover:border-border-strong hover:text-text"
                }`}
              >
                {s}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tasks (objectives, work only) */}
      {isWork && (
        <div>
          <span className={labelClass}>Tasks</span>
          <div className="flex flex-col gap-2">
            {objectives.length === 0 && (
              <p className="rounded-xl border border-dashed border-border bg-surface/60 px-3 py-3 text-xs text-muted">
                No tasks. Add one below.
              </p>
            )}
            {objectives.map((o) => (
              <div
                key={o.id}
                className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-2.5 py-2"
              >
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={o.done}
                  aria-label={o.done ? "Mark not done" : "Mark done"}
                  onClick={() => updateObjective(o.id, { done: !o.done })}
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors ${
                    o.done
                      ? "border-accent bg-accent text-accent-contrast shadow-[0_0_8px_var(--glow)]"
                      : "border-border-strong bg-surface hover:border-accent/50"
                  }`}
                >
                  {o.done && (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </button>
                <input
                  type="text"
                  value={o.text}
                  onChange={(e) =>
                    updateObjective(o.id, { text: e.target.value })
                  }
                  aria-label="Task text"
                  className={`min-w-0 flex-1 border-0 bg-transparent px-1 py-1 text-sm outline-none ${
                    o.done ? "text-muted line-through" : "text-text"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => removeObjective(o.id)}
                  aria-label="Remove task"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-danger/15 hover:text-danger"
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
                    aria-hidden="true"
                  >
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}

            {/* Add task */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newObjective}
                onChange={(e) => setNewObjective(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addObjective();
                  }
                }}
                placeholder="Add a task…"
                aria-label="New task"
                className={fieldClass}
              />
              <button
                type="button"
                onClick={addObjective}
                disabled={!newObjective.trim()}
                className="shrink-0 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm font-medium text-text transition-colors hover:border-accent/50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {formError && (
        <p
          role="alert"
          className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {formError}
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-2 border-t border-border/70 pt-5">
        <button
          type="submit"
          disabled={saving}
          className="btn-primary h-12 flex-1 px-5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="btn-secondary h-12 px-5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
      </form>
    </Card>
  );
}
