"use client";

// components/ObjectiveList.tsx
// A fully-editable checklist of Tasks (the session's sub-objectives), controlled
// by the parent via `objectives` + `onChange`. Reused in two places:
//   - StartPanel (pre-start): edits a local draft list of tasks.
//   - ActiveSession (mid-session): each change is persisted via setObjectives.
// It is intentionally presentational/controlled — it never fetches. Operations
// are keyed by objective id (add / rename / toggle / remove). UI copy says
// "task(s)"; the underlying data type is still Objective.

import { useState } from "react";
import type { Objective } from "@/lib/types";

export default function ObjectiveList({
  objectives,
  onChange,
  disabled = false,
  showProgress = false,
  className = "",
}: {
  objectives: Objective[];
  onChange: (next: Objective[]) => void;
  /** Disable all editing (e.g. while a network action is in flight). */
  disabled?: boolean;
  /** Show an "N of M done" progress line above the list. */
  showProgress?: boolean;
  className?: string;
}) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    const next: Objective = {
      id: crypto.randomUUID(),
      text,
      done: false,
      createdAt: Date.now(),
    };
    onChange([...objectives, next]);
    setDraft("");
  };

  const toggle = (id: string) => {
    onChange(
      objectives.map((o) => (o.id === id ? { ...o, done: !o.done } : o)),
    );
  };

  const rename = (id: string, text: string) => {
    onChange(objectives.map((o) => (o.id === id ? { ...o, text } : o)));
  };

  const remove = (id: string) => {
    onChange(objectives.filter((o) => o.id !== id));
  };

  const total = objectives.length;
  const done = objectives.filter((o) => o.done).length;

  return (
    <div className={className}>
      {showProgress && total > 0 && (
        <p className="readout mb-2 text-xs font-medium text-muted">
          {done} of {total} done
        </p>
      )}

      {total > 0 && (
        <ul className="flex flex-col gap-1.5">
          {objectives.map((o, i) => (
            <li
              key={o.id}
              className="animate-fade-up flex items-center gap-2 rounded-xl border border-border bg-surface-2/70 px-3 py-2 transition-colors focus-within:border-accent/60 hover:border-border-strong"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <button
                type="button"
                role="checkbox"
                aria-checked={o.done}
                aria-label={o.done ? "Mark task not done" : "Mark task done"}
                disabled={disabled}
                onClick={() => toggle(o.id)}
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-all disabled:opacity-50 ${
                  o.done
                    ? "border-accent bg-accent text-accent-contrast shadow-[0_0_10px_-2px_var(--glow)]"
                    : "border-border-strong bg-bg hover:border-accent"
                }`}
              >
                {o.done && (
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    aria-hidden="true"
                  >
                    <path
                      d="M5 13l4 4L19 7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>

              <input
                type="text"
                value={o.text}
                disabled={disabled}
                onChange={(e) => rename(o.id, e.target.value)}
                aria-label="Task"
                className={`min-w-0 flex-1 bg-transparent text-sm outline-none disabled:opacity-50 ${
                  o.done ? "text-muted line-through" : "text-text"
                }`}
              />

              <button
                type="button"
                aria-label="Remove task"
                disabled={disabled}
                onClick={() => remove(o.id)}
                className="shrink-0 rounded-md p-1 text-faint transition-colors hover:text-danger disabled:opacity-50"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className={`flex items-center gap-2 ${total > 0 ? "mt-2" : ""}`}>
        <input
          type="text"
          value={draft}
          disabled={disabled}
          placeholder="Add a task…"
          aria-label="Add a task"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          className="min-w-0 flex-1 rounded-xl border border-border px-3 py-2 text-sm outline-none transition-colors focus:border-accent disabled:opacity-50"
        />
        <button
          type="button"
          onClick={add}
          disabled={disabled || draft.trim().length === 0}
          className="shrink-0 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm font-medium transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </div>
  );
}
