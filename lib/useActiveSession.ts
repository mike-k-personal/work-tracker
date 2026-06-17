"use client";

// lib/useActiveSession.ts
// Client hook that owns the live active-session lifecycle:
//   - fetch the active session on mount,
//   - a 1s "tick" that drives time-derived UI (remaining is always recomputed
//     from immutable timestamps in lib/timer, never decremented),
//   - a ~25s heartbeat (only while running) that also flushes on
//     visibilitychange:hidden via keepalive,
//   - typed action callbacks (start/pause/resume/extend/setObjectives/end/
//     cancel/startBreak/applyAway) that call lib/api and update local state.
//
// Components consume this and never call lib/api directly for the active
// session, so optimistic local state + the server response stay coordinated.

import { useCallback, useEffect, useRef, useState } from "react";

import type { ActiveSession, LogEntry, Objective } from "@/lib/types";
import type { AwayChoice } from "@/lib/timer";
import * as api from "@/lib/api";

const HEARTBEAT_MS = 25_000;
/** Away threshold: below this we silently resume; above, prompt. */
export const AWAY_THRESHOLD_MS = 20_000;

export type StartWorkInput = {
  projectId?: string | null;
  milestoneId?: string | null;
  taskName: string;
  objectives?: Objective[];
  estimateMs: number;
};

export type UseActiveSession = {
  /** The current active session (null when none), kept in local state. */
  active: ActiveSession | null;
  /** True until the first fetch resolves. */
  loading: boolean;
  /** Last action/fetch error message, if any. */
  error: string | null;
  /** A monotonically-updating "now" (epoch ms), ticking ~1s while a session runs. */
  now: number;
  /**
   * Away-time (ms) detected on load for a running session, or 0 when none /
   * already reconciled. The page uses this to decide whether to show
   * ReloadPrompt before continuing.
   */
  awayMs: number;
  /** Dismiss the away prompt without reconciling (treated as "count as work"). */
  clearAway: () => void;

  // --- actions -------------------------------------------------------------
  startWork: (input: StartWorkInput) => Promise<ActiveSession | null>;
  startBreak: (opts?: {
    estimateMs?: number;
    taskName?: string;
  }) => Promise<ActiveSession | null>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  extend: (addMs: number) => Promise<void>;
  setObjectives: (objectives: Objective[]) => Promise<void>;
  applyAway: (choice: AwayChoice) => Promise<void>;
  end: (
    endReason?: Parameters<typeof api.endSession>[0],
  ) => Promise<LogEntry | null>;
  cancel: () => Promise<LogEntry | null>;
  /** Re-fetch from the server (e.g. after an external change). */
  refresh: () => Promise<void>;
};

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

export function useActiveSession(): UseActiveSession {
  const [active, setActive] = useState<ActiveSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [awayMs, setAwayMs] = useState(0);

  // Keep a ref to the latest active so async callbacks (setObjectives retry)
  // read fresh state without re-subscribing. Synced in an effect, not during
  // render.
  const activeRef = useRef<ActiveSession | null>(null);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const safeSetActive = useCallback((s: ActiveSession | null) => {
    if (mountedRef.current) setActive(s);
  }, []);

  // --- initial fetch + away detection --------------------------------------
  // Applies a fetched session to local state. All setState here runs *after*
  // the network await, so it is asynchronous (no cascading render).
  const applyFetched = useCallback((s: ActiveSession | null) => {
    if (!mountedRef.current) return;
    setActive(s);
    setError(null);
    // Detect a stale running session (we were away while it was running).
    if (s && s.status === "running" && s.runningSince !== null) {
      const away = Date.now() - s.lastSeenAt;
      setAwayMs(away > AWAY_THRESHOLD_MS ? away : 0);
    } else {
      setAwayMs(0);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const s = await api.getActive();
      applyFetched(s);
    } catch (e) {
      if (mountedRef.current) setError(messageOf(e));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [applyFetched]);

  useEffect(() => {
    let cancelled = false;
    api
      .getActive()
      .then((s) => {
        if (!cancelled) applyFetched(s);
      })
      .catch((e) => {
        if (!cancelled && mountedRef.current) setError(messageOf(e));
      })
      .finally(() => {
        if (!cancelled && mountedRef.current) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applyFetched]);

  // --- 1s tick (only meaningful while a session exists) --------------------
  useEffect(() => {
    if (!active) return;
    // The interval drives `now`; the first update lands within 1s. (Avoid a
    // synchronous setState here — it would cause a cascading render.)
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    // Recompute immediately when the tab becomes visible again (a backgrounded
    // tab throttles intervals; this makes expiry/over-state correct on return).
    const onVis = () => {
      if (document.visibilityState === "visible") setNow(Date.now());
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [active]);

  // --- heartbeat (~25s, only while running) + flush on hide ----------------
  useEffect(() => {
    const running = active?.status === "running";
    if (!running) return;

    let cancelled = false;
    const beat = async () => {
      try {
        const s = await api.heartbeat();
        if (!cancelled && mountedRef.current && s) setActive(s);
      } catch {
        // Heartbeats are best-effort; ignore transient failures.
      }
    };
    const id = window.setInterval(beat, HEARTBEAT_MS);

    // On hide, flush a heartbeat with keepalive so the lastSeenAt anchor is
    // fresh even if the tab is discarded.
    const onVis = () => {
      if (document.visibilityState !== "hidden") return;
      try {
        fetch("/api/active", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "heartbeat" }),
          keepalive: true,
          cache: "no-store",
        }).catch(() => {});
      } catch {
        // ignore
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [active?.status]);

  // --- actions -------------------------------------------------------------
  const startWork = useCallback(
    async (input: StartWorkInput): Promise<ActiveSession | null> => {
      try {
        const s = await api.startSession({
          kind: "work",
          projectId: input.projectId ?? null,
          milestoneId: input.milestoneId ?? null,
          taskName: input.taskName,
          objectives: input.objectives,
          estimateMs: input.estimateMs,
        });
        safeSetActive(s);
        setAwayMs(0);
        setError(null);
        setNow(Date.now()); // crisp timer from the first frame
        return s;
      } catch (e) {
        setError(messageOf(e));
        return null;
      }
    },
    [safeSetActive],
  );

  const startBreak = useCallback(
    async (opts?: {
      estimateMs?: number;
      taskName?: string;
    }): Promise<ActiveSession | null> => {
      try {
        const s = await api.startBreak(opts ?? {});
        safeSetActive(s);
        setAwayMs(0);
        setError(null);
        setNow(Date.now()); // crisp timer from the first frame
        return s;
      } catch (e) {
        setError(messageOf(e));
        return null;
      }
    },
    [safeSetActive],
  );

  const pause = useCallback(async () => {
    try {
      const s = await api.pauseSession();
      safeSetActive(s);
    } catch (e) {
      setError(messageOf(e));
    }
  }, [safeSetActive]);

  const resume = useCallback(async () => {
    try {
      const s = await api.resumeSession();
      safeSetActive(s);
      setNow(Date.now());
    } catch (e) {
      setError(messageOf(e));
    }
  }, [safeSetActive]);

  const extend = useCallback(
    async (addMs: number) => {
      if (!(addMs > 0)) return;
      try {
        const s = await api.extendSession(addMs);
        safeSetActive(s);
      } catch (e) {
        setError(messageOf(e));
      }
    },
    [safeSetActive],
  );

  const setObjectives = useCallback(
    async (objectives: Objective[]) => {
      // Optimistic update so checkboxes feel instant.
      const cur = activeRef.current;
      if (cur) safeSetActive({ ...cur, objectives });
      try {
        const s = await api.setObjectives(objectives);
        if (s) safeSetActive(s);
      } catch (e) {
        setError(messageOf(e));
        // Re-sync on failure.
        void refresh();
      }
    },
    [safeSetActive, refresh],
  );

  const applyAway = useCallback(
    async (choice: AwayChoice) => {
      try {
        const s = await api.applyAway(choice);
        safeSetActive(s);
      } catch (e) {
        setError(messageOf(e));
      } finally {
        if (mountedRef.current) {
          setAwayMs(0);
          setNow(Date.now());
        }
      }
    },
    [safeSetActive],
  );

  const clearAway = useCallback(() => setAwayMs(0), []);

  const end = useCallback(
    async (
      endReason?: Parameters<typeof api.endSession>[0],
    ): Promise<LogEntry | null> => {
      // Snapshot for accurate final active time (mostly informational; the
      // server computes the authoritative log).
      try {
        const log = await api.endSession(endReason);
        safeSetActive(null);
        setAwayMs(0);
        return log;
      } catch (e) {
        setError(messageOf(e));
        return null;
      }
    },
    [safeSetActive],
  );

  const cancel = useCallback(async (): Promise<LogEntry | null> => {
    try {
      const log = await api.cancelSession();
      safeSetActive(null);
      setAwayMs(0);
      return log;
    } catch (e) {
      setError(messageOf(e));
      return null;
    }
  }, [safeSetActive]);

  return {
    active,
    loading,
    error,
    now,
    awayMs,
    clearAway,
    startWork,
    startBreak,
    pause,
    resume,
    extend,
    setObjectives,
    applyAway,
    end,
    cancel,
    refresh,
  };
}
