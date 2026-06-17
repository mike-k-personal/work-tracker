"use client";

// components/ProjectEditor.tsx
// Expandable settings panel for a single project: edit name / description /
// start date, archive or unarchive, mark complete or reopen, and delete (with a
// confirm). Each mutation goes through the typed client wrappers and updates the
// parent optimistically via callbacks; the parent owns the authoritative
// project + reconciliation. Delete is delegated to the parent so it can route
// away after the cascade.

import { useEffect, useState } from "react";

import type { Project } from "@/lib/types";
import { ApiError, updateProject } from "@/lib/api";
import { cn } from "@/components/ui/cn";

export type ProjectEditorProps = {
  project: Project;
  /** Apply a server-confirmed project to the parent. */
  onUpdated: (next: Project) => void;
  /** Confirm + delete + route away. Owned by the parent. */
  onDelete: () => void | Promise<void>;
};

export default function ProjectEditor({
  project,
  onUpdated,
  onDelete,
}: ProjectEditorProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [startDate, setStartDate] = useState(project.startDate ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Resync editable fields when the project changes underneath us (and we're
  // not mid-edit on a closed panel).
  useEffect(() => {
    if (open) return;
    setName(project.name);
    setDescription(project.description ?? "");
    setStartDate(project.startDate ?? "");
  }, [project.name, project.description, project.startDate, open]);

  const completed = Boolean(project.completedAt);

  async function run(
    key: string,
    patch: Parameters<typeof updateProject>[1],
    fallback: string,
  ) {
    setError(null);
    setBusy(key);
    try {
      const saved = await updateProject(project.id, patch);
      onUpdated(saved);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : fallback);
    } finally {
      setBusy(null);
    }
  }

  function saveDetails() {
    const nextName = name.trim();
    const nextDesc = description.trim();
    const nextStart = startDate ? startDate : null;
    const patch: Parameters<typeof updateProject>[1] = {};
    if (nextName && nextName !== project.name) patch.name = nextName;
    if (nextDesc !== (project.description ?? "")) patch.description = nextDesc;
    if (nextStart !== (project.startDate ?? null)) patch.startDate = nextStart;
    if (Object.keys(patch).length === 0) {
      setName(project.name);
      return;
    }
    void run("details", patch, "Couldn't save changes.");
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "btn-secondary h-10 px-3.5 text-sm",
          open && "border-accent text-accent-hover",
        )}
      >
        <svg
          width={16}
          height={16}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
        </svg>
        Edit
      </button>

      {open ? (
        <div className="card animate-fade-up mt-3 space-y-5 p-4 sm:p-5">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_var(--glow)]" />
            <p className="eyebrow">Project settings</p>
          </div>

          <div className="space-y-1.5">
            <label className="eyebrow text-muted" htmlFor="proj-name">
              Name
            </label>
            <input
              id="proj-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 w-full rounded-lg px-3 text-sm focus:border-accent/50"
            />
          </div>

          <div className="space-y-1.5">
            <label className="eyebrow text-muted" htmlFor="proj-desc">
              Description
            </label>
            <textarea
              id="proj-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What is this project about?"
              className="w-full resize-none rounded-lg px-3 py-2.5 text-sm focus:border-accent/50"
            />
          </div>

          <div className="space-y-1.5">
            <label className="eyebrow text-muted" htmlFor="proj-start">
              Start date
            </label>
            <input
              id="proj-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-11 w-full rounded-lg px-3 font-mono text-sm tabular-nums focus:border-accent/50 sm:w-[12rem]"
            />
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={saveDetails}
              disabled={busy === "details"}
              className="btn-primary h-10 px-4 text-sm"
            >
              {busy === "details" ? "Saving…" : "Save changes"}
            </button>

            <button
              type="button"
              onClick={() =>
                run(
                  "complete",
                  { completedAt: completed ? null : Date.now() },
                  "Couldn't update status.",
                )
              }
              disabled={busy === "complete"}
              className="btn-secondary h-10 px-4 text-sm"
            >
              {busy === "complete"
                ? "Saving…"
                : completed
                  ? "Reopen project"
                  : "Mark complete"}
            </button>

            <button
              type="button"
              onClick={() =>
                run(
                  "archive",
                  { archived: !project.archived },
                  "Couldn't update archive state.",
                )
              }
              disabled={busy === "archive"}
              className="btn-secondary h-10 px-4 text-sm"
            >
              {busy === "archive"
                ? "Saving…"
                : project.archived
                  ? "Unarchive"
                  : "Archive"}
            </button>

            <button
              type="button"
              onClick={() => void onDelete()}
              className={cn(
                "inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-danger/30 bg-danger/10 px-4 text-sm font-medium text-danger transition-colors hover:bg-danger/20",
              )}
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
              >
                <path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
              </svg>
              Delete
            </button>
          </div>

          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
