"use client";

// components/StartPanel.tsx
// The centered "start a session" panel shown on Home when nothing is active.
// Flow: pick a PROJECT (or add a new one), name the MAIN OBJECTIVE, jot a few
// SUB-OBJECTIVES, set a duration, and go. The primary Start button unlocks audio
// + requests notification permission (both from this user gesture, per the plan)
// and then starts a WORK session tagged with the project. A secondary
// "Start break" quick action starts an ad-hoc (project-less) break.
//
// Starting is delegated to the parent (Home) via onStartWork / onStartBreak so
// the active-session state lives in one place (useActiveSession). Projects are
// owned by the parent too; creating one goes through onCreateProject.

import { useState } from "react";
import type { Objective, Project } from "@/lib/types";
import { unlock } from "@/lib/sound";
import { ensureNotificationPermission } from "@/lib/notify";
import ObjectiveList from "@/components/ObjectiveList";

const NEW_PROJECT = "__new__";

export default function StartPanel({
  projects,
  defaultWorkMin,
  defaultBreakMin,
  onStartWork,
  onStartBreak,
  onCreateProject,
}: {
  projects: Project[];
  defaultWorkMin: number;
  defaultBreakMin: number;
  /** Start a work session; returns once the server responds. */
  onStartWork: (input: {
    projectId: string | null;
    taskName: string;
    objectives: Objective[];
    estimateMs: number;
  }) => Promise<unknown>;
  /** Start an ad-hoc break of `estimateMs` ms. */
  onStartBreak: (estimateMs: number) => Promise<unknown>;
  /** Create (or fetch the existing) project by name; null on failure. */
  onCreateProject: (name: string) => Promise<Project | null>;
}) {
  const activeProjects = projects.filter((p) => !p.archived);

  const [projectId, setProjectId] = useState<string | null>(null);
  // True when the "+ New project…" row is open.
  const [creating, setCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [addingProject, setAddingProject] = useState(false);

  const [taskName, setTaskName] = useState("");
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [minutes, setMinutes] = useState<string>(
    String(Math.max(1, Math.round(defaultWorkMin))),
  );
  const [busy, setBusy] = useState(false);

  const parsedMin = parseInt(minutes, 10);
  const validMin = Number.isFinite(parsedMin) && parsedMin > 0;
  const canStartWork = !busy && validMin && !!projectId;

  // Unlock audio + request notifications from the gesture, never blocking start.
  // Fire-and-forget: initiated synchronously within the click (preserving the
  // user-gesture context required for AudioContext + the Notification prompt),
  // but never awaited — a pending permission prompt must not block starting.
  const primeGesture = () => {
    try {
      void Promise.allSettled([unlock(), ensureNotificationPermission()]);
    } catch {
      // ignore — start regardless
    }
  };

  const handleProjectChange = (value: string) => {
    if (value === NEW_PROJECT) {
      setCreating(true);
      setProjectId(null);
      return;
    }
    setCreating(false);
    setProjectId(value || null);
  };

  const addNewProject = async () => {
    const name = newProjectName.trim();
    if (!name || addingProject) return;
    setAddingProject(true);
    try {
      const p = await onCreateProject(name);
      if (p) {
        setProjectId(p.id);
        setCreating(false);
        setNewProjectName("");
      }
    } finally {
      setAddingProject(false);
    }
  };

  const startWork = async () => {
    if (!canStartWork) return;
    setBusy(true);
    primeGesture();
    try {
      await onStartWork({
        projectId,
        taskName: taskName.trim() || "Focus",
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
    <div className="mx-auto w-full max-w-md rounded-3xl border border-border bg-surface p-5 sm:p-6">
      <h1 className="mb-1 text-xl font-semibold tracking-tight">Start focusing</h1>
      <p className="mb-5 text-sm text-muted">
        Pick a project, set your main objective, and go.
      </p>

      {/* Project */}
      <div className="mb-4">
        <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">
          Project
        </span>
        <select
          value={creating ? NEW_PROJECT : (projectId ?? "")}
          disabled={busy}
          onChange={(e) => handleProjectChange(e.target.value)}
          className="w-full rounded-xl bg-surface-2 px-3 py-2.5 text-base outline-none focus:border-accent disabled:opacity-50"
          aria-label="Project"
        >
          <option value="" disabled>
            Select a project…
          </option>
          {activeProjects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value={NEW_PROJECT}>+ New project…</option>
        </select>

        {creating && (
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={newProjectName}
              placeholder="New project name"
              disabled={busy || addingProject}
              autoFocus
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void addNewProject();
                }
              }}
              className="w-full rounded-xl px-3 py-2.5 text-base outline-none focus:border-accent disabled:opacity-50"
            />
            <button
              type="button"
              disabled={busy || addingProject || !newProjectName.trim()}
              onClick={addNewProject}
              className="shrink-0 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-hover disabled:opacity-40"
            >
              {addingProject ? "Adding…" : "Add"}
            </button>
          </div>
        )}
      </div>

      {/* Main objective */}
      <label className="mb-4 block">
        <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">
          Main objective
        </span>
        <input
          type="text"
          value={taskName}
          placeholder="What's the main thing you're working on?"
          disabled={busy}
          onChange={(e) => setTaskName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void startWork();
            }
          }}
          className="w-full rounded-xl px-3 py-2.5 text-base outline-none focus:border-accent disabled:opacity-50"
        />
      </label>

      {/* Sub-objectives */}
      <div className="mb-4">
        <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted">
          Sub-objectives
        </span>
        <ObjectiveList
          objectives={objectives}
          onChange={setObjectives}
          disabled={busy}
        />
      </div>

      <label className="mb-5 flex items-center justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">
          Duration
        </span>
        <span className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={minutes}
            disabled={busy}
            onChange={(e) => setMinutes(e.target.value)}
            className="w-24 rounded-xl px-3 py-2.5 text-right text-base tabular-nums outline-none focus:border-accent disabled:opacity-50"
            aria-label="Duration in minutes"
          />
          <span className="text-sm text-muted">min</span>
        </span>
      </label>

      <button
        type="button"
        disabled={!canStartWork}
        onClick={startWork}
        className="w-full rounded-2xl bg-accent px-4 py-3.5 text-base font-semibold text-accent-contrast transition-colors hover:bg-accent-hover disabled:opacity-40"
      >
        {busy ? "Starting…" : "Start session"}
      </button>
      {!projectId && !busy && (
        <p className="mt-2 text-center text-xs text-muted">
          Pick a project to start a work session.
        </p>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={startBreak}
        className="mt-2 w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm font-medium text-muted transition-colors hover:text-text disabled:opacity-40"
      >
        Start a break instead
      </button>
    </div>
  );
}
