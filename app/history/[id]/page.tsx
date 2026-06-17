"use client";

// app/history/[id]/page.tsx
// Detail + edit + delete for a single history entry. There is no GET-single
// endpoint, so we load all logs and find the one by id. Editing goes through
// updateLog; deletion through deleteLog behind an INLINE confirm (no
// window.confirm/alert). Back link returns to the list. Styled to the blue-dark
// design system; shows project + milestone Badges and the session's tasks.
//
// Next 16: dynamic-route `params` is a Promise even in client components — we
// unwrap it with React.use().

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useState } from "react";

import type { LogEntry, Project } from "@/lib/types";
import {
  ApiError,
  deleteLog,
  getLogs,
  getProjects,
  updateLog,
} from "@/lib/api";
import { msToHuman, prettyDate, prettyTime } from "@/lib/format";
import EntryEditor from "@/components/EntryEditor";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

export default function HistoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [entry, setEntry] = useState<LogEntry | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getLogs()
      .then((logs) => {
        if (cancelled) return;
        setEntry(logs.find((l) => l.id === id) ?? null);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError ? err.message : "Could not load this entry.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Projects power the reassignment dropdown in the editor.
  useEffect(() => {
    let cancelled = false;
    void getProjects()
      .then((p) => {
        if (!cancelled) setProjects(p);
      })
      .catch(() => {
        // non-fatal: the editor falls back to the entry's own project
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = useCallback(
    async (patch: Partial<LogEntry>) => {
      setSaving(true);
      setError(null);
      try {
        const updated = await updateLog(id, patch);
        setEntry(updated);
        setEditing(false);
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : "Could not save changes.",
        );
      } finally {
        setSaving(false);
      }
    },
    [id],
  );

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    setError(null);
    try {
      await deleteLog(id);
      router.push("/history");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not delete this entry.",
      );
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }, [id, router]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
      <Link
        href="/history"
        className="mb-5 inline-flex items-center gap-1.5 font-mono text-xs font-medium uppercase tracking-wider text-muted transition-colors hover:text-accent"
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
          <path d="m15 18-6-6 6-6" />
        </svg>
        Log
      </Link>

      {!loaded ? (
        <Card className="h-56 animate-pulse" />
      ) : !entry ? (
        <EmptyState
          title="Entry not found"
          description="It may have been deleted. Return to your history log."
          action={
            <Link href="/history" className="btn-secondary px-4 py-2.5 text-sm">
              Back to history
            </Link>
          }
        />
      ) : editing ? (
        <div className="animate-fade-up">
          <p className="eyebrow mb-1.5">Edit entry</p>
          <h1 className="mb-5 font-display text-[1.7rem] font-semibold leading-tight tracking-tight text-text">
            {entry.kind === "work" ? "Edit session" : "Edit break"}
          </h1>
          {error && (
            <p
              role="alert"
              className="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
            >
              {error}
            </p>
          )}
          <EntryEditor
            entry={entry}
            saving={saving}
            projects={projects}
            onSave={handleSave}
            onCancel={() => {
              setEditing(false);
              setError(null);
            }}
          />
        </div>
      ) : (
        <DetailView
          entry={entry}
          error={error}
          confirmingDelete={confirmingDelete}
          deleting={deleting}
          onEdit={() => {
            setError(null);
            setEditing(true);
          }}
          onAskDelete={() => setConfirmingDelete(true)}
          onCancelDelete={() => setConfirmingDelete(false)}
          onConfirmDelete={() => void handleDelete()}
        />
      )}
    </div>
  );
}

function DetailView({
  entry,
  error,
  confirmingDelete,
  deleting,
  onEdit,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  entry: LogEntry;
  error: string | null;
  confirmingDelete: boolean;
  deleting: boolean;
  onEdit: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  const isWork = entry.kind === "work";
  const completed = entry.status === "completed";
  const overMs = entry.activeMs - entry.estimateMs;

  return (
    <article className="flex flex-col gap-6">
      {/* Header card — the instrument readout for this entry. */}
      <Card
        className="animate-fade-up overflow-hidden p-0"
        style={{ animationDelay: "0ms" }}
      >
        <header className="border-b border-border/70 px-5 py-5">
          <div className="mb-3 flex items-center gap-2.5">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                completed
                  ? isWork
                    ? "bg-accent shadow-[0_0_8px_var(--glow)]"
                    : "bg-success"
                  : "bg-danger"
              }`}
              aria-hidden="true"
            />
            <span className="eyebrow">{isWork ? "Work session" : "Break"}</span>
            <Badge tone={completed ? "success" : "danger"} className="ml-auto">
              {completed ? "Completed" : "Cancelled"}
            </Badge>
          </div>

          <h1
            className={`break-words font-display text-[1.6rem] font-semibold leading-tight tracking-tight ${
              completed ? "text-text" : "text-faint line-through"
            }`}
          >
            {entry.taskName || (isWork ? "Untitled session" : "Break")}
          </h1>

          {isWork && (entry.projectName || entry.milestoneName) && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {entry.projectName && (
                <Badge tone="accent">{entry.projectName}</Badge>
              )}
              {entry.milestoneName && (
                <Badge tone="muted">{entry.milestoneName}</Badge>
              )}
            </div>
          )}
        </header>

        {/* Readout grid — hairline-divided instrument cells. */}
        <dl className="grid grid-cols-2 divide-x divide-y divide-border/70">
          <Stat label="Active time" value={msToHuman(entry.activeMs)} accent />
          <Stat label="Estimate" value={msToHuman(entry.estimateMs)} />
          <Stat label="Started" value={prettyDate(entry.startedAt)} />
          <Stat label="Ended" value={prettyTime(entry.endedAt)} />
          {entry.extensionsMs > 0 && (
            <Stat label="Extensions" value={msToHuman(entry.extensionsMs)} />
          )}
          {entry.estimateMs > 0 && (
            <Stat
              label={overMs >= 0 ? "Over estimate" : "Under estimate"}
              value={msToHuman(Math.abs(overMs))}
              tone={overMs > 0 ? "danger" : "success"}
            />
          )}
        </dl>
      </Card>

      {/* Tasks (objectives) */}
      {isWork && (
        <section className="animate-fade-up" style={{ animationDelay: "70ms" }}>
          <div className="mb-3 flex items-center gap-3">
            <span className="eyebrow text-muted">Tasks</span>
            <span
              aria-hidden="true"
              className="h-px flex-1 bg-gradient-to-r from-border-strong/80 to-transparent"
            />
            <span className="readout shrink-0 text-[0.6875rem] font-medium uppercase tracking-wider text-muted tabular-nums">
              {entry.objectivesCompleted}/{entry.objectivesTotal}
            </span>
          </div>
          {entry.objectives.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border bg-surface/40 px-4 py-3 text-xs text-muted">
              No tasks were recorded.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {entry.objectives.map((o) => (
                <li key={o.id}>
                  <Card className="flex items-center gap-3 px-4 py-3">
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                        o.done
                          ? "border-accent bg-accent text-accent-contrast shadow-[0_0_8px_var(--glow)]"
                          : "border-border-strong"
                      }`}
                      aria-hidden="true"
                    >
                      {o.done && (
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      )}
                    </span>
                    <span
                      className={`text-sm ${
                        o.done ? "text-faint line-through" : "text-text"
                      }`}
                    >
                      {o.text}
                    </span>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
        >
          {error}
        </p>
      )}

      {/* Actions */}
      <div
        className="animate-fade-up flex flex-col gap-3"
        style={{ animationDelay: "140ms" }}
      >
        <button
          type="button"
          onClick={onEdit}
          className="btn-primary h-12 px-5 text-sm"
        >
          Edit entry
        </button>

        {confirmingDelete ? (
          <Card className="border-danger/30 bg-danger/10 p-4">
            <p className="mb-3 text-sm text-text">
              Delete this entry permanently? This can&rsquo;t be undone.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onConfirmDelete}
                disabled={deleting}
                className="flex-1 rounded-xl bg-danger px-3 py-2.5 text-sm font-semibold text-accent-contrast transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
              <button
                type="button"
                onClick={onCancelDelete}
                disabled={deleting}
                className="btn-secondary flex-1 px-3 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                Keep
              </button>
            </div>
          </Card>
        ) : (
          <button
            type="button"
            onClick={onAskDelete}
            className="w-full rounded-xl border border-border bg-surface-2/60 px-4 py-3 text-sm font-medium text-danger transition-colors hover:border-danger/40 hover:bg-danger/10"
          >
            Delete entry
          </button>
        )}
      </div>
    </article>
  );
}

function Stat({
  label,
  value,
  accent = false,
  tone,
}: {
  label: string;
  value: string;
  accent?: boolean;
  tone?: "success" | "danger";
}) {
  const valueColor =
    tone === "danger"
      ? "text-danger"
      : tone === "success"
        ? "text-success"
        : accent
          ? "text-accent"
          : "text-text";
  return (
    <div className="px-5 py-4">
      <dt className="font-mono text-[0.625rem] font-medium uppercase tracking-[0.16em] text-faint">
        {label}
      </dt>
      <dd className={`readout mt-1 text-base font-medium tabular-nums ${valueColor}`}>
        {value}
      </dd>
    </div>
  );
}
