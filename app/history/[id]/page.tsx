"use client";

// app/history/[id]/page.tsx
// Detail + edit + delete for a single history entry. There is no GET-single
// endpoint, so we load all logs and find the one by id. Editing goes through
// updateLog; deletion through deleteLog behind an INLINE confirm (no
// window.confirm/alert). Back link returns to the list.
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
import {
  msToHuman,
  prettyDate,
  prettyTime,
} from "@/lib/format";
import EntryEditor from "@/components/EntryEditor";

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
    <div className="mx-auto w-full max-w-2xl px-4 py-6 md:py-8">
      <Link
        href="/history"
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-text"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
        History
      </Link>

      {!loaded ? (
        <div className="h-40 animate-pulse rounded-2xl border border-border bg-surface" />
      ) : !entry ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface px-4 py-12 text-center">
          <p className="text-sm font-medium text-text">Entry not found</p>
          <p className="mt-1 text-xs text-muted">
            It may have been deleted. Return to your history.
          </p>
          {error && <p className="mt-3 text-xs text-danger">{error}</p>}
        </div>
      ) : editing ? (
        <>
          <h1 className="mb-5 text-xl font-semibold tracking-tight">
            Edit entry
          </h1>
          {error && (
            <p className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
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
        </>
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
    <article>
      {/* Header */}
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                isWork ? "bg-accent" : "bg-success"
              }`}
              aria-hidden="true"
            />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              {isWork ? "Work session" : "Break"}
            </span>
          </div>
          {isWork && entry.projectName && (
            <p className="mb-0.5 truncate text-sm font-medium text-accent">
              {entry.projectName}
            </p>
          )}
          <h1 className="break-words text-xl font-semibold tracking-tight">
            {entry.taskName || (isWork ? "Untitled session" : "Break")}
          </h1>
        </div>
        <span
          className={`mt-1 shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            completed
              ? "bg-success/15 text-success"
              : "bg-danger/15 text-danger"
          }`}
        >
          {completed ? "Completed" : "Cancelled"}
        </span>
      </div>

      {/* Stats */}
      <dl className="grid grid-cols-2 gap-3">
        <Stat label="Active time" value={msToHuman(entry.activeMs)} />
        <Stat label="Estimate" value={msToHuman(entry.estimateMs)} />
        <Stat
          label="Started"
          value={prettyDate(entry.startedAt)}
          mono
        />
        <Stat label="Ended" value={prettyTime(entry.endedAt)} mono />
        {entry.extensionsMs > 0 && (
          <Stat label="Extensions" value={msToHuman(entry.extensionsMs)} />
        )}
        {entry.estimateMs > 0 && (
          <Stat
            label={overMs >= 0 ? "Over estimate" : "Under estimate"}
            value={msToHuman(Math.abs(overMs))}
          />
        )}
      </dl>

      {/* Objectives */}
      {isWork && (
        <section className="mt-6">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold tracking-tight">
            Objectives
            <span className="text-xs font-normal text-muted tabular-nums">
              {entry.objectivesCompleted}/{entry.objectivesTotal}
            </span>
          </h2>
          {entry.objectives.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border bg-surface px-3 py-3 text-xs text-muted">
              No objectives were recorded.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {entry.objectives.map((o) => (
                <li
                  key={o.id}
                  className="flex items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2.5"
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                      o.done
                        ? "border-accent bg-accent text-accent-contrast"
                        : "border-border"
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
                      o.done ? "text-muted line-through" : "text-text"
                    }`}
                  >
                    {o.text}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {error && (
        <p className="mt-5 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {/* Actions */}
      <div className="mt-7 flex flex-col gap-3">
        <button
          type="button"
          onClick={onEdit}
          className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-hover"
        >
          Edit entry
        </button>

        {confirmingDelete ? (
          <div className="rounded-xl border border-danger/40 bg-danger/10 p-3">
            <p className="mb-3 text-sm text-text">
              Delete this entry permanently? This can’t be undone.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onConfirmDelete}
                disabled={deleting}
                className="flex-1 rounded-lg bg-danger px-3 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
              <button
                type="button"
                onClick={onCancelDelete}
                disabled={deleting}
                className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:text-text disabled:cursor-not-allowed disabled:opacity-60"
              >
                Keep
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={onAskDelete}
            className="w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm font-medium text-danger transition-colors hover:border-danger/40 hover:bg-danger/10"
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
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2.5">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd
        className={`mt-0.5 text-sm font-medium text-text ${
          mono ? "tabular-nums" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
