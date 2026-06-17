"use client";

// components/EntryEditor.tsx
// Edit form for a single LogEntry. Lets the user edit the task/label name, the
// objectives list (add / rename / toggle done / remove), the start & end times,
// and the status (completed / cancelled). Calls back with a Partial<LogEntry>
// patch on save; the parent persists it via updateLog. No data fetching here.

import { useMemo, useState } from "react";

import type { LogEntry, Objective, Project } from "@/lib/types";

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
  const [objectives, setObjectives] = useState<Objective[]>(
    () => entry.objectives.map((o) => ({ ...o })),
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
      ...(isWork ? { projectId } : {}),
    });
  }

  const fieldClass =
    "w-full rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-sm text-text outline-none transition-colors focus:border-accent";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* Task / label name */}
      <div>
        <label
          htmlFor="entry-task"
          className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted"
        >
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

      {/* Project (work only) */}
      {isWork && (
        <div>
          <label
            htmlFor="entry-project"
            className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted"
          >
            Project
          </label>
          <select
            id="entry-project"
            value={projectId ?? ""}
            onChange={(e) => setProjectId(e.target.value || null)}
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
      )}

      {/* Times */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="entry-start"
            className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted"
          >
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
          <label
            htmlFor="entry-end"
            className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted"
          >
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
        <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">
          Status
        </span>
        <div className="flex gap-2">
          {(["completed", "cancelled"] as const).map((s) => {
            const active = status === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                aria-pressed={active}
                className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium capitalize transition-colors ${
                  active
                    ? s === "completed"
                      ? "border-success bg-success/15 text-success"
                      : "border-danger bg-danger/15 text-danger"
                    : "border-border bg-surface-2 text-muted hover:text-text"
                }`}
              >
                {s}
              </button>
            );
          })}
        </div>
      </div>

      {/* Objectives (work only) */}
      {isWork && (
        <div>
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">
            Objectives
          </span>
          <div className="flex flex-col gap-2">
            {objectives.length === 0 && (
              <p className="rounded-xl border border-dashed border-border bg-surface px-3 py-3 text-xs text-muted">
                No objectives. Add one below.
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
                      ? "border-accent bg-accent text-accent-contrast"
                      : "border-border bg-surface"
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
                  aria-label="Objective text"
                  className={`min-w-0 flex-1 border-0 bg-transparent px-1 py-1 text-sm outline-none ${
                    o.done ? "text-muted line-through" : "text-text"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => removeObjective(o.id)}
                  aria-label="Remove objective"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-danger/15 hover:text-danger"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}

            {/* Add objective */}
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
                placeholder="Add an objective…"
                aria-label="New objective"
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
        <p className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {formError}
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm font-medium text-muted transition-colors hover:text-text disabled:cursor-not-allowed disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
