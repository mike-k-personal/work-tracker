"use client";

// components/MilestoneList.tsx
// The plan for a single project: an ordered list of milestones plus an
// add-milestone form (title + optional target date). Owns the optimistic
// mutations for each row (toggle done / rename / set date / delete) and the
// create flow, reconciling local state with the server response. The parent
// passes the project's milestones in and is notified of every change so it can
// keep page-level derived UI (progress, schedule status) in sync.

import { useMemo, useState } from "react";

import type { Milestone } from "@/lib/types";
import {
  ApiError,
  createMilestone,
  deleteMilestone,
  updateMilestone,
} from "@/lib/api";
import { progressOf, projectMilestones } from "@/lib/projects";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/components/ui/cn";
import MilestoneRow from "@/components/MilestoneRow";

export type MilestoneListProps = {
  projectId: string;
  milestones: Milestone[];
  /** Replace the full milestone set on the parent (optimistic + reconcile). */
  onChange: (next: Milestone[]) => void;
};

export default function MilestoneList({
  projectId,
  milestones,
  onChange,
}: MilestoneListProps) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [adding, setAdding] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ordered = useMemo(
    () => projectMilestones(milestones, projectId),
    [milestones, projectId],
  );
  const progress = useMemo(() => progressOf(ordered), [ordered]);

  function reportError(e: unknown, fallback: string) {
    setError(e instanceof ApiError ? e.message : fallback);
  }

  // --- Mutations ------------------------------------------------------------

  function patchLocal(id: string, patch: Partial<Milestone>) {
    onChange(milestones.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }

  function replaceLocal(saved: Milestone) {
    onChange(milestones.map((m) => (m.id === saved.id ? saved : m)));
  }

  async function toggleDone(m: Milestone, done: boolean) {
    setError(null);
    const prev = milestones;
    setSavingId(m.id);
    patchLocal(m.id, { done, doneAt: done ? Date.now() : null });
    try {
      const saved = await updateMilestone(m.id, { done });
      replaceLocal(saved);
    } catch (e) {
      onChange(prev);
      reportError(e, "Couldn't update milestone.");
    } finally {
      setSavingId(null);
    }
  }

  async function rename(m: Milestone, nextTitle: string) {
    setError(null);
    const prev = milestones;
    setSavingId(m.id);
    patchLocal(m.id, { title: nextTitle });
    try {
      const saved = await updateMilestone(m.id, { title: nextTitle });
      replaceLocal(saved);
    } catch (e) {
      onChange(prev);
      reportError(e, "Couldn't rename milestone.");
    } finally {
      setSavingId(null);
    }
  }

  async function setTargetDate(m: Milestone, targetDate: string | null) {
    setError(null);
    const prev = milestones;
    setSavingId(m.id);
    patchLocal(m.id, { targetDate });
    try {
      const saved = await updateMilestone(m.id, { targetDate });
      replaceLocal(saved);
    } catch (e) {
      onChange(prev);
      reportError(e, "Couldn't update target date.");
    } finally {
      setSavingId(null);
    }
  }

  async function remove(m: Milestone) {
    setError(null);
    const prev = milestones;
    setSavingId(m.id);
    onChange(milestones.filter((x) => x.id !== m.id));
    try {
      await deleteMilestone(m.id);
    } catch (e) {
      onChange(prev);
      reportError(e, "Couldn't delete milestone.");
    } finally {
      setSavingId(null);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t || adding) return;
    setError(null);
    setAdding(true);
    try {
      const saved = await createMilestone({
        projectId,
        title: t,
        targetDate: date ? date : null,
      });
      onChange([...milestones, saved]);
      setTitle("");
      setDate("");
    } catch (e) {
      reportError(e, "Couldn't add milestone.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="font-display text-lg font-semibold tracking-tight text-text">
            Milestones
          </h2>
          {progress.total > 0 ? (
            <Badge tone={progress.pct === 100 ? "success" : "muted"}>
              {progress.done}/{progress.total}
            </Badge>
          ) : null}
        </div>
        {progress.total > 0 ? (
          <p className="readout text-sm font-semibold text-muted tabular-nums">
            {progress.pct}%
          </p>
        ) : null}
      </div>

      {ordered.length === 0 ? (
        <EmptyState
          icon={
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
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          }
          title="No milestones yet"
          description="Break this project into dated checkpoints to track whether you're ahead or behind."
        />
      ) : (
        <div className="space-y-2">
          {ordered.map((m, i) => (
            <div
              key={m.id}
              className="animate-fade-up"
              style={{ animationDelay: `${Math.min(i, 12) * 55}ms` }}
            >
              <MilestoneRow
                milestone={m}
                saving={savingId === m.id}
                onToggleDone={(done) => toggleDone(m, done)}
                onRename={(t) => rename(m, t)}
                onSetTargetDate={(d) => setTargetDate(m, d)}
                onDelete={() => remove(m)}
              />
            </div>
          ))}
        </div>
      )}

      <form
        onSubmit={add}
        className="flex flex-col gap-2.5 rounded-xl border border-dashed border-border-strong bg-surface-2/30 p-3 sm:flex-row sm:items-center"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-border bg-surface-2 px-3 focus-within:border-accent/50">
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
            className="shrink-0 text-accent"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a milestone…"
            aria-label="New milestone title"
            className="h-11 min-w-0 flex-1 border-0 bg-transparent px-0 text-sm focus:outline-none"
          />
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="New milestone target date"
          className="h-11 rounded-lg px-3 font-mono text-sm tabular-nums sm:w-[10rem]"
        />
        <button
          type="submit"
          disabled={!title.trim() || adding}
          className={cn("btn-primary h-11 px-5 text-sm")}
        >
          {adding ? "Adding…" : "Add"}
        </button>
      </form>

      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
