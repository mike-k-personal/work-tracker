"use client";

// app/history/page.tsx
// Day-by-day work log. Fetches all logs (client-side) and hands them to
// HistoryList which groups by local day (newest first). Each entry links to its
// detail/edit route. Mobile-first.

import { useCallback, useEffect, useState } from "react";

import type { LogEntry } from "@/lib/types";
import { ApiError, getLogs } from "@/lib/api";
import HistoryList from "@/components/HistoryList";

export default function HistoryPage() {
  const [logs, setLogs] = useState<LogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getLogs();
      setLogs(data);
      setError(null);
    } catch (err) {
      setLogs([]);
      setError(
        err instanceof ApiError ? err.message : "Could not load history.",
      );
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getLogs()
      .then((data) => {
        if (!cancelled) {
          setLogs(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLogs([]);
          setError(
            err instanceof ApiError ? err.message : "Could not load history.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 md:py-8">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">History</h1>
        <p className="mt-0.5 text-sm text-muted">
          Your work sessions and breaks, day by day.
        </p>
      </header>

      {error && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-danger">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void load()}
            className="shrink-0 rounded-lg border border-danger/40 px-2.5 py-1 text-xs font-medium text-danger transition-colors hover:bg-danger/15"
          >
            Retry
          </button>
        </div>
      )}

      {logs === null ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-xl border border-border bg-surface"
            />
          ))}
        </div>
      ) : (
        <HistoryList logs={logs} />
      )}
    </div>
  );
}
