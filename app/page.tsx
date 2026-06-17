"use client";

// app/page.tsx — Home / the core screen.
//
// No active session  -> today's Timeline + a centered StartPanel (and a quick
//                       break action lives in StartPanel).
// Active session     -> the ActiveSession focus view, with a compact timeline
//                       kept visible for orientation.
//
// On load, if a running work/break session has a stale lastSeenAt (we were away
// > ~20s), ReloadPrompt is shown first so the away time can be reconciled.
//
// The single useActiveSession instance owns fetch + tick + heartbeat + actions.
// Schedule + settings are fetched here for the timeline and default durations.
// The post-work BreakPrompt is rendered at THIS level (not inside ActiveSession)
// so it survives the active session being cleared on End.

import { useCallback, useEffect, useState } from "react";

import type {
  Milestone,
  Objective,
  Project,
  Schedule,
  Settings,
} from "@/lib/types";
import { effectiveBlocks } from "@/lib/schedule";
import {
  getSchedule,
  getSettings,
  getProjects,
  getMilestones,
} from "@/lib/api";
import { useActiveSession } from "@/lib/useActiveSession";

import Timeline from "@/components/Timeline";
import StartPanel from "@/components/StartPanel";
import ActiveSession from "@/components/ActiveSession";
import ReloadPrompt from "@/components/ReloadPrompt";
import BreakPrompt from "@/components/BreakPrompt";

const DEFAULT_SETTINGS: Settings = {
  defaultWorkMin: 50,
  defaultBreakMin: 10,
  notificationsEnabled: true,
  soundEnabled: true,
};

export default function Home() {
  const s = useActiveSession();
  const {
    active,
    loading,
    now,
    awayMs,
    applyAway,
    end,
    cancel,
    startBreak,
    pause,
    resume,
    extend,
    setObjectives,
    startWork,
  } = s;

  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [awayBusy, setAwayBusy] = useState(false);
  const [breakPromptOpen, setBreakPromptOpen] = useState(false);
  const [breakBusy, setBreakBusy] = useState(false);

  // Fetch settings + schedule + projects + milestones once. Failures fall back
  // to sane defaults so the start panel and timeline still render.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [st, sc, pr, ms] = await Promise.all([
          getSettings(),
          getSchedule(),
          getProjects(),
          getMilestones(),
        ]);
        if (!alive) return;
        setSettings(st);
        setSchedule(sc);
        setProjects(pr);
        setMilestones(ms);
      } catch {
        // keep defaults; timeline shows its empty state
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Tick "today" so the timeline window/now-line stay current across midnight.
  const todayBlocks = schedule
    ? effectiveBlocks(schedule, new Date(now))
    : [];

  // --- ReloadPrompt wiring -------------------------------------------------
  const showReload = awayMs > 0 && active != null;

  const onCountAsWork = useCallback(async () => {
    setAwayBusy(true);
    try {
      await applyAway("work");
    } finally {
      setAwayBusy(false);
    }
  }, [applyAway]);

  const onDontCount = useCallback(async () => {
    setAwayBusy(true);
    try {
      await applyAway("discard");
    } finally {
      setAwayBusy(false);
    }
  }, [applyAway]);

  const onAwayEnd = useCallback(async () => {
    setAwayBusy(true);
    try {
      const log = await end("manual");
      if (log && log.kind === "work") setBreakPromptOpen(true);
    } finally {
      setAwayBusy(false);
    }
  }, [end]);

  const onAwayCancel = useCallback(async () => {
    setAwayBusy(true);
    try {
      await cancel();
    } finally {
      setAwayBusy(false);
    }
  }, [cancel]);

  // --- BreakPrompt wiring (post-work) --------------------------------------
  const onStartBreakFromPrompt = useCallback(
    async (estimateMs: number) => {
      setBreakBusy(true);
      try {
        await startBreak({ estimateMs });
        setBreakPromptOpen(false);
      } finally {
        setBreakBusy(false);
      }
    },
    [startBreak],
  );

  // --- StartPanel wiring ---------------------------------------------------
  const onStartWork = useCallback(
    (input: {
      projectId: string | null;
      milestoneId: string | null;
      taskName: string;
      objectives: Objective[];
      estimateMs: number;
    }) =>
      startWork({
        projectId: input.projectId,
        milestoneId: input.milestoneId,
        taskName: input.taskName,
        objectives: input.objectives,
        estimateMs: input.estimateMs,
      }),
    [startWork],
  );

  const onStartBreakAdhoc = useCallback(
    (estimateMs: number) => startBreak({ estimateMs }),
    [startBreak],
  );

  const todayLabel = new Date(now).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="flex flex-1 flex-col p-4 sm:p-6">
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="relative h-10 w-10">
            <div className="absolute inset-0 animate-spin rounded-full border-2 border-border border-t-accent shadow-[0_0_14px_var(--glow)]" />
          </div>
        </div>
      ) : active ? (
        // ---------- ACTIVE: focus view + compact timeline ----------
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
          <div className="animate-fade-up flex-1 pt-2 lg:pt-8">
            <ActiveSession
              session={active}
              now={now}
              soundEnabled={settings.soundEnabled}
              notificationsEnabled={settings.notificationsEnabled}
              pause={pause}
              resume={resume}
              extend={extend}
              setObjectives={setObjectives}
              end={end}
              cancel={cancel}
              onWorkEnded={() => setBreakPromptOpen(true)}
            />
          </div>
          <aside
            className="animate-fade-up w-full shrink-0 lg:w-72"
            style={{ animationDelay: "90ms" }}
          >
            <div className="mb-2.5 flex items-baseline justify-between">
              <h2 className="eyebrow">Today</h2>
              <span className="readout text-[0.6875rem] uppercase tracking-[0.12em] text-faint">
                {todayLabel}
              </span>
            </div>
            <Timeline blocks={todayBlocks} now={now} pxPerMin={1.1} />
          </aside>
        </div>
      ) : (
        // ---------- IDLE: timeline + start panel ----------
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
          <aside
            className="animate-fade-up order-2 w-full shrink-0 lg:order-1 lg:w-72"
            style={{ animationDelay: "90ms" }}
          >
            <div className="mb-2.5 flex items-baseline justify-between">
              <h2 className="eyebrow">Today</h2>
              <span className="readout text-[0.6875rem] uppercase tracking-[0.12em] text-faint">
                {todayLabel}
              </span>
            </div>
            <Timeline blocks={todayBlocks} now={now} />
          </aside>
          <div className="order-1 flex flex-1 items-start justify-center pt-2 lg:order-2 lg:pt-8">
            <div className="animate-fade-up w-full">
              <StartPanel
                projects={projects}
                milestones={milestones}
                defaultWorkMin={settings.defaultWorkMin}
                defaultBreakMin={settings.defaultBreakMin}
                onStartWork={onStartWork}
                onStartBreak={onStartBreakAdhoc}
              />
            </div>
          </div>
        </div>
      )}

      {/* Away-time reconciliation on return to a running session */}
      {showReload && active && (
        <ReloadPrompt
          awayMs={awayMs}
          kind={active.kind}
          busy={awayBusy}
          onCountAsWork={onCountAsWork}
          onDontCount={onDontCount}
          onEnd={onAwayEnd}
          onCancel={onAwayCancel}
        />
      )}

      {/* Pomodoro break prompt after a work session ends */}
      {breakPromptOpen && !active && (
        <BreakPrompt
          defaultBreakMin={settings.defaultBreakMin}
          busy={breakBusy}
          onStartBreak={onStartBreakFromPrompt}
          onSkip={() => setBreakPromptOpen(false)}
        />
      )}
    </div>
  );
}
