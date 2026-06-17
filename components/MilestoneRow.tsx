"use client";

// components/MilestoneRow.tsx
// A single milestone line within a project's plan — a tactile, instrument-grade
// row. Renders a custom glowing done checkbox (toggles done), the title
// (click-to-edit inline), a mono target-date chip, and a delete button. Open
// milestones whose target date is in the past render in the danger tone with an
// OVERDUE flag. Completed milestones are muted/struck-through and show a mono
// "done" readout. All mutations are surfaced to the parent via callbacks; the
// parent owns optimistic state + server reconciliation.

import { useEffect, useRef, useState } from "react";

import type { Milestone } from "@/lib/types";
import { dayKey } from "@/lib/format";
import { dayKeyToEpoch } from "@/lib/projects";
import { cn } from "@/components/ui/cn";

function formatTarget(targetDate: string): string {
  const e = dayKeyToEpoch(targetDate);
  if (e === null) return targetDate;
  return new Date(e).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatDoneAt(doneAt: number): string {
  return new Date(doneAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export type MilestoneRowProps = {
  milestone: Milestone;
  saving?: boolean;
  onToggleDone: (done: boolean) => void;
  onRename: (title: string) => void;
  onSetTargetDate: (targetDate: string | null) => void;
  onDelete: () => void;
};

export default function MilestoneRow({
  milestone,
  saving = false,
  onToggleDone,
  onRename,
  onSetTargetDate,
  onDelete,
}: MilestoneRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(milestone.title);
  const [showDate, setShowDate] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);

  // Keep the draft in sync if the milestone changes underneath us while not
  // actively editing (e.g. server reconcile).
  useEffect(() => {
    if (!editing) setDraft(milestone.title);
  }, [milestone.title, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    if (showDate) dateRef.current?.focus();
  }, [showDate]);

  const today = dayKey(Date.now());
  const overdue =
    !milestone.done &&
    milestone.targetDate !== null &&
    milestone.targetDate < today;

  function commitRename() {
    const next = draft.trim();
    setEditing(false);
    if (next && next !== milestone.title) {
      onRename(next);
    } else {
      setDraft(milestone.title);
    }
  }

  return (
    <div
      className={cn(
        "group relative flex items-start gap-3 rounded-xl border bg-surface-2/40 px-3 py-3 transition-colors duration-200 sm:px-3.5",
        overdue
          ? "border-danger/30 bg-danger/[0.06]"
          : "border-border hover:border-border-strong",
        milestone.done && "border-border bg-surface-2/25",
      )}
    >
      {/* Accent rail for open, overdue danger rail when past due. */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-2 left-0 w-0.5 rounded-full transition-colors",
          overdue
            ? "bg-danger/70"
            : milestone.done
              ? "bg-transparent"
              : "bg-transparent group-hover:bg-accent/50",
        )}
      />

      {/* Custom done checkbox — glows accent/success when checked. */}
      <button
        type="button"
        onClick={() => onToggleDone(!milestone.done)}
        disabled={saving}
        aria-label={
          milestone.done ? "Mark milestone open" : "Mark milestone done"
        }
        aria-pressed={milestone.done}
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-all duration-200 active:scale-90",
          milestone.done
            ? "border-accent/60 bg-accent-soft text-accent shadow-[0_0_12px_var(--glow)]"
            : overdue
              ? "border-danger/50 text-transparent hover:border-danger hover:text-danger/40"
              : "border-border-strong text-transparent hover:border-accent hover:text-accent/30 hover:shadow-[0_0_10px_var(--glow)]",
          saving && "opacity-60",
        )}
      >
        <svg
          width={15}
          height={15}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={cn(
            "transition-transform duration-200",
            milestone.done ? "scale-100" : "scale-75",
          )}
        >
          <path d="M5 12.5l4.5 4.5L19 6.5" />
        </svg>
      </button>

      {/* Title + meta */}
      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") {
                setDraft(milestone.title);
                setEditing(false);
              }
            }}
            className="w-full rounded-lg px-2 py-1 text-[0.9375rem] font-medium"
            aria-label="Milestone title"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={cn(
              "block w-full truncate text-left text-[0.9375rem] font-medium leading-snug text-text transition-colors hover:text-accent-hover",
              milestone.done &&
                "text-muted line-through decoration-faint/70 decoration-1",
            )}
            title="Click to rename"
          >
            {milestone.title}
          </button>
        )}

        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {milestone.done ? (
            <span className="inline-flex items-center gap-1.5 font-mono text-[0.6875rem] uppercase tracking-wider text-faint tabular-nums">
              <svg
                width={11}
                height={11}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12.5l4.5 4.5L19 6.5" />
              </svg>
              {milestone.doneAt ? `Done ${formatDoneAt(milestone.doneAt)}` : "Done"}
            </span>
          ) : showDate ? (
            <input
              ref={dateRef}
              type="date"
              value={milestone.targetDate ?? ""}
              onChange={(e) =>
                onSetTargetDate(e.target.value ? e.target.value : null)
              }
              onBlur={() => setShowDate(false)}
              className="rounded-md px-2 py-1 font-mono text-xs tabular-nums"
              aria-label="Milestone target date"
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowDate(true)}
              aria-label={
                milestone.targetDate
                  ? "Change target date"
                  : "Set target date"
              }
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[0.6875rem] font-medium uppercase tracking-wider tabular-nums transition-colors",
                overdue
                  ? "border-danger/40 bg-danger/10 text-danger"
                  : milestone.targetDate
                    ? "border-border bg-surface-2 text-muted hover:border-accent/40 hover:text-text"
                    : "border-dashed border-border bg-transparent text-faint hover:border-accent/40 hover:text-muted",
              )}
            >
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
              {milestone.targetDate ? (
                overdue ? (
                  <>
                    <span className="text-danger">Overdue</span>
                    <span aria-hidden="true" className="text-danger/40">
                      ·
                    </span>
                    {formatTarget(milestone.targetDate)}
                  </>
                ) : (
                  formatTarget(milestone.targetDate)
                )
              ) : (
                "Set date"
              )}
            </button>
          )}
        </div>
      </div>

      {/* Delete */}
      <button
        type="button"
        onClick={onDelete}
        disabled={saving}
        aria-label="Delete milestone"
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-faint transition-colors hover:bg-danger/10 hover:text-danger focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
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
          <path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
        </svg>
      </button>
    </div>
  );
}
