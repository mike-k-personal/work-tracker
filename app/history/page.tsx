"use client";

// app/history/page.tsx
// Day-by-day work log. Fetches all logs (client-side) and hands them to
// HistoryList which groups by local day (newest first). Each entry links to its
// detail/edit route. Restyled to the blue-dark design system (PageHeader, Card,
// shared primitives). Mobile-first, skim-friendly.

import { useCallback, useEffect, useState } from "react";

import type { LogEntry } from "@/lib/types";
import { ApiError, getLogs } from "@/lib/api";
import HistoryList from "@/components/HistoryList";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";

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
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="animate-fade-up">
        <PageHeader
          eyebrow="Log"
          title="History"
          subtitle="Every work session and break, recorded day by day."
        />
      </div>

      {error && (
        <div
          role="alert"
          className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void load()}
            className="shrink-0 rounded-lg border border-danger/40 px-2.5 py-1 font-mono text-xs font-medium uppercase tracking-wider text-danger transition-colors hover:bg-danger/15"
          >
            Retry
          </button>
        </div>
      )}

      {logs === null ? (
        <div className="flex flex-col gap-6" aria-busy="true">
          {[0, 1].map((g) => (
            <div key={g} className="flex flex-col gap-2.5">
              <div className="mb-1 flex items-center gap-3">
                <span className="h-3 w-24 rounded bg-surface-2" />
                <span className="h-px flex-1 bg-border" />
              </div>
              {[0, 1].map((i) => (
                <Card key={i} className="h-[5.25rem] animate-pulse" />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <HistoryList logs={logs} />
      )}
    </div>
  );
}
