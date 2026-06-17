"use client";

// app/schedule/page.tsx
// Editor for the CONCEPTUAL schedule (a guide only — it never runs timers).
// Two tabs:
//   1. Weekly — classify each day-of-week as a WORK day or an OFF day, then edit
//      the two reusable templates (one workday schedule, one off-day schedule).
//      Every work day inherits the workday template; every off day the off-day.
//   2. Date overrides — pick a date (defaults to tomorrow, for planning "the
//      night before") and build a custom block list that wins over the template
//      for that single date. Copy-from-template seeds it from the matching one.
// Loads via getSchedule, saves via putSchedule. A live Timeline preview shows
// the schedule being edited.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Block, DayType, Schedule } from "@/lib/types";
import { ApiError, getSchedule, putSchedule } from "@/lib/api";
import { defaultDayTypes, dayTypeForDate } from "@/lib/schedule";
import ScheduleEditor, { isBlockInvalid } from "@/components/ScheduleEditor";
import Timeline from "@/components/Timeline";

type Tab = "weekly" | "overrides";
type TemplateKey = "work" | "off";

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW_LABELS_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const TEMPLATE_LABEL: Record<TemplateKey, string> = {
  work: "Workday",
  off: "Off day",
};

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));

/** Local "YYYY-MM-DD" for a Date. */
function dateInputValue(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Tomorrow's local date key (default override target). */
function tomorrowKey(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return dateInputValue(d);
}

/** Parse a "YYYY-MM-DD" into a LOCAL Date (midnight). */
function parseDateKey(key: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return new Date();
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Strip invalid blocks before saving / previewing. */
function validBlocks(blocks: Block[]): Block[] {
  return blocks.filter((b) => !isBlockInvalid(b));
}

/** Canonical signature of a day-type map for cheap dirty/seed comparisons. */
function dayTypesSig(dt: Record<number, DayType>): string {
  return [0, 1, 2, 3, 4, 5, 6].map((d) => dt[d] ?? "?").join(",");
}

export default function SchedulePage() {
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>("weekly");

  // --- Weekly tab working copies -------------------------------------------
  const [dayTypes, setDayTypes] = useState<Record<number, DayType>>(() =>
    defaultDayTypes(),
  );
  const [whichTemplate, setWhichTemplate] = useState<TemplateKey>("work");
  const [workDraft, setWorkDraft] = useState<Block[]>([]);
  const [offDraft, setOffDraft] = useState<Block[]>([]);

  // --- Overrides tab working copies ----------------------------------------
  const [overrideDate, setOverrideDate] = useState<string>(() => tomorrowKey());
  const [overrideDraft, setOverrideDraft] = useState<Block[]>([]);

  // --- Shared save state ---------------------------------------------------
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // A tick so the Timeline "now" line stays roughly current.
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    getSchedule()
      .then((s) => {
        if (!cancelled) setSchedule(s);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setLoadError(
            e instanceof ApiError ? e.message : "Failed to load schedule.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Reseed the weekly working copies whenever the server schedule changes
  // (load/save), using the React-recommended "adjust state during render"
  // pattern instead of an effect (avoids cascading-render lint).
  const weeklySig = schedule
    ? JSON.stringify({
        d: dayTypesSig(schedule.dayTypes),
        w: schedule.templates.work,
        o: schedule.templates.off,
      })
    : "";
  const [weeklySeed, setWeeklySeed] = useState<string>("");
  if (schedule && weeklySig !== weeklySeed) {
    setWeeklySeed(weeklySig);
    setDayTypes({ ...defaultDayTypes(), ...schedule.dayTypes });
    setWorkDraft(schedule.templates.work.map((b) => ({ ...b })));
    setOffDraft(schedule.templates.off.map((b) => ({ ...b })));
    setSaved(false);
    setSaveError(null);
  }

  // The override blocks currently stored for the selected date.
  const storedOverride = useMemo<Block[]>(
    () => (schedule ? (schedule.overrides[overrideDate] ?? []) : []),
    [schedule, overrideDate],
  );
  const hasOverride = useMemo<boolean>(
    () => (schedule ? overrideDate in schedule.overrides : false),
    [schedule, overrideDate],
  );

  // Reseed the override draft whenever the selected date (or its stored blocks)
  // change.
  const overrideSig = `${overrideDate}:${JSON.stringify(storedOverride)}`;
  const [overrideSeed, setOverrideSeed] = useState<string>(overrideSig);
  if (overrideSig !== overrideSeed) {
    setOverrideSeed(overrideSig);
    setOverrideDraft(storedOverride.map((b) => ({ ...b })));
    setSaved(false);
    setSaveError(null);
  }

  // --- Weekly tab derived --------------------------------------------------
  const templateDraft = whichTemplate === "work" ? workDraft : offDraft;
  const setTemplateDraft = whichTemplate === "work" ? setWorkDraft : setOffDraft;

  const workDays = useMemo(
    () => [0, 1, 2, 3, 4, 5, 6].filter((d) => dayTypes[d] === "work"),
    [dayTypes],
  );

  const weeklyDirty = useMemo(() => {
    if (!schedule) return false;
    if (dayTypesSig(dayTypes) !== dayTypesSig(schedule.dayTypes)) return true;
    if (
      JSON.stringify(validBlocks(workDraft)) !==
      JSON.stringify(schedule.templates.work)
    )
      return true;
    if (
      JSON.stringify(validBlocks(offDraft)) !==
      JSON.stringify(schedule.templates.off)
    )
      return true;
    return false;
  }, [schedule, dayTypes, workDraft, offDraft]);

  const toggleDay = useCallback((d: number) => {
    setDayTypes((prev) => ({
      ...prev,
      [d]: prev[d] === "work" ? "off" : "work",
    }));
  }, []);

  // --- Overrides tab derived -----------------------------------------------
  const overrideDateObj = useMemo(
    () => parseDateKey(overrideDate),
    [overrideDate],
  );
  const overrideType: DayType = useMemo(
    () => (schedule ? dayTypeForDate(schedule, overrideDateObj) : "work"),
    [schedule, overrideDateObj],
  );

  const overrideDirty = useMemo(
    () =>
      JSON.stringify(validBlocks(overrideDraft)) !==
      JSON.stringify(storedOverride),
    [overrideDraft, storedOverride],
  );

  const copyFromTemplate = useCallback(() => {
    if (!schedule) return;
    const src =
      overrideType === "off"
        ? schedule.templates.off
        : schedule.templates.work;
    // Fresh ids so the override owns its blocks independently of the template.
    setOverrideDraft(src.map((b) => ({ ...b, id: crypto.randomUUID() })));
  }, [schedule, overrideType]);

  // --- Saves ---------------------------------------------------------------
  async function handleSaveWeekly() {
    if (!schedule) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const updated = await putSchedule({
        dayTypes,
        templates: {
          work: validBlocks(workDraft),
          off: validBlocks(offDraft),
        },
      });
      setSchedule(updated);
      setSaved(true);
    } catch (e: unknown) {
      setSaveError(
        e instanceof ApiError ? e.message : "Failed to save schedule.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveOverride() {
    if (!schedule) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const updated = await putSchedule({
        overrides: {
          ...schedule.overrides,
          [overrideDate]: validBlocks(overrideDraft),
        },
      });
      setSchedule(updated);
      setSaved(true);
    } catch (e: unknown) {
      setSaveError(
        e instanceof ApiError ? e.message : "Failed to save schedule.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleClearOverride() {
    if (!schedule) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const nextOverrides = { ...schedule.overrides };
      delete nextOverrides[overrideDate];
      const updated = await putSchedule({ overrides: nextOverrides });
      setSchedule(updated);
      setSaved(true);
    } catch (e: unknown) {
      setSaveError(
        e instanceof ApiError ? e.message : "Failed to clear override.",
      );
    } finally {
      setSaving(false);
    }
  }

  function handleRevertWeekly() {
    if (!schedule) return;
    setDayTypes({ ...defaultDayTypes(), ...schedule.dayTypes });
    setWorkDraft(schedule.templates.work.map((b) => ({ ...b })));
    setOffDraft(schedule.templates.off.map((b) => ({ ...b })));
    setSaved(false);
    setSaveError(null);
  }

  function handleRevertOverride() {
    setOverrideDraft(storedOverride.map((b) => ({ ...b })));
    setSaved(false);
    setSaveError(null);
  }

  // --- Preview -------------------------------------------------------------
  const noonOf = (epoch: number): number => {
    const d = new Date(epoch);
    d.setHours(12, 0, 0, 0);
    return d.getTime();
  };

  const weeklyPreviewBlocks = useMemo(
    () => validBlocks(templateDraft),
    [templateDraft],
  );
  // Show the live "now" line only when today actually uses the template being
  // edited; otherwise anchor to noon so the layout still reads sensibly.
  const todayType = dayTypes[new Date(now).getDay()] ?? "work";
  const weeklyPreviewNow =
    todayType === whichTemplate ? now : noonOf(now);

  const overridePreviewBlocks = useMemo(
    () => validBlocks(overrideDraft),
    [overrideDraft],
  );
  const overrideIsToday =
    dateInputValue(overrideDateObj) === dateInputValue(new Date(now));
  const overridePreviewNow = overrideIsToday
    ? now
    : noonOf(overrideDateObj.getTime());

  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="text-xl font-semibold">Schedule</h1>
        <p className="mt-4 rounded-xl border border-danger/40 bg-surface px-4 py-3 text-sm text-danger">
          {loadError}
        </p>
      </div>
    );
  }

  if (!schedule) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="text-xl font-semibold">Schedule</h1>
        <p className="mt-4 text-sm text-muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold">Schedule</h1>
        <p className="mt-1 text-sm text-muted">
          A guide for your day — it nudges you, but never starts or stops
          anything.
        </p>
      </header>

      {/* Tabs */}
      <div
        className="mb-5 inline-flex rounded-xl border border-border bg-surface p-1"
        role="tablist"
        aria-label="Schedule sections"
      >
        {(
          [
            ["weekly", "Weekly"],
            ["overrides", "Date overrides"],
          ] as [Tab, string][]
        ).map(([value, label]) => {
          const active = tab === value;
          return (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setTab(value);
                setSaved(false);
                setSaveError(null);
              }}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                active ? "bg-surface-2 text-text" : "text-muted hover:text-text"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {tab === "weekly" ? (
        <>
          {/* Work-day classification */}
          <section className="mb-6">
            <h2 className="mb-2 text-sm font-medium">Which days do you work?</h2>
            <div
              className="flex flex-wrap gap-1.5"
              role="group"
              aria-label="Work days"
            >
              {DOW_LABELS.map((label, i) => {
                const isWork = dayTypes[i] === "work";
                return (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={isWork}
                    onClick={() => toggleDay(i)}
                    title={`${DOW_LABELS_LONG[i]}: ${
                      isWork ? "work day" : "off day"
                    } — tap to toggle`}
                    className={`flex h-11 w-11 items-center justify-center rounded-xl border text-xs font-semibold transition-colors ${
                      isWork
                        ? "border-accent bg-accent text-accent-contrast"
                        : "border-border bg-surface-2 text-muted hover:text-text"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-sm text-muted">
              {workDays.length === 0
                ? "Every day is an off day."
                : workDays.length === 7
                  ? "Every day is a work day."
                  : `Work days: ${workDays
                      .map((d) => DOW_LABELS[d])
                      .join(", ")}`}
            </p>
          </section>

          {/* Template selector */}
          <section className="mb-4">
            <h2 className="mb-2 text-sm font-medium">Schedule template</h2>
            <div
              className="inline-flex rounded-xl border border-border bg-surface p-1"
              role="group"
              aria-label="Template"
            >
              {(["work", "off"] as TemplateKey[]).map((key) => {
                const active = whichTemplate === key;
                const count = (key === "work" ? workDraft : offDraft).filter(
                  (b) => !isBlockInvalid(b),
                ).length;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setWhichTemplate(key)}
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                      active
                        ? "bg-surface-2 text-text"
                        : "text-muted hover:text-text"
                    }`}
                  >
                    {TEMPLATE_LABEL[key]}
                    {count > 0 && (
                      <span className="ml-1.5 text-xs text-muted">
                        ({count})
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-sm text-muted">
              Editing the{" "}
              <span className="font-medium text-text">
                {TEMPLATE_LABEL[whichTemplate].toLowerCase()}
              </span>{" "}
              schedule — applies to every {whichTemplate} day above.
            </p>
          </section>

          {/* Editor */}
          <ScheduleEditor blocks={templateDraft} onChange={setTemplateDraft} />

          {/* Save bar */}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSaveWeekly}
              disabled={saving || !weeklyDirty}
              className="inline-flex items-center rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>

            {weeklyDirty && !saving && (
              <button
                type="button"
                onClick={handleRevertWeekly}
                className="rounded-lg border border-border bg-surface-2 px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:text-text"
              >
                Revert
              </button>
            )}

            {saved && !weeklyDirty && (
              <span className="text-sm text-success">Saved</span>
            )}
            {saveError && <span className="text-sm text-danger">{saveError}</span>}
          </div>

          {/* Live preview */}
          <section className="mt-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
              {TEMPLATE_LABEL[whichTemplate]} preview
            </h2>
            <Timeline blocks={weeklyPreviewBlocks} now={weeklyPreviewNow} />
          </section>
        </>
      ) : (
        <>
          {/* Date selector */}
          <div className="mb-5 space-y-2">
            <label className="block text-sm font-medium" htmlFor="override-date">
              Date
            </label>
            <input
              id="override-date"
              type="date"
              value={overrideDate}
              onChange={(e) => setOverrideDate(e.target.value || tomorrowKey())}
              className="rounded-lg px-3 py-2 text-sm tabular-nums outline-none focus:border-accent"
            />
            <p className="text-sm text-muted">
              {DOW_LABELS_LONG[overrideDateObj.getDay()]}
              {hasOverride ? (
                <span className="ml-2 rounded-md bg-accent/15 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-accent">
                  Custom day
                </span>
              ) : (
                <span className="ml-2 text-muted">
                  · {overrideType === "off" ? "off day" : "work day"} — using the{" "}
                  {TEMPLATE_LABEL[overrideType].toLowerCase()} schedule
                </span>
              )}
            </p>
          </div>

          {/* Editor */}
          <ScheduleEditor
            blocks={overrideDraft}
            onChange={setOverrideDraft}
            onCopyFrom={copyFromTemplate}
            copyFromLabel={`Copy from ${TEMPLATE_LABEL[overrideType]} schedule`}
          />

          {/* Save bar */}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSaveOverride}
              disabled={saving || !overrideDirty}
              className="inline-flex items-center rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>

            {overrideDirty && !saving && (
              <button
                type="button"
                onClick={handleRevertOverride}
                className="rounded-lg border border-border bg-surface-2 px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:text-text"
              >
                Revert
              </button>
            )}

            {hasOverride && (
              <button
                type="button"
                onClick={handleClearOverride}
                disabled={saving}
                className="rounded-lg border border-border bg-surface-2 px-4 py-2.5 text-sm font-medium text-danger transition-colors hover:border-danger/60 disabled:opacity-50"
              >
                Clear override
              </button>
            )}

            {saved && !overrideDirty && (
              <span className="text-sm text-success">Saved</span>
            )}
            {saveError && <span className="text-sm text-danger">{saveError}</span>}
          </div>

          {/* Live preview */}
          <section className="mt-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
              Preview
            </h2>
            <Timeline blocks={overridePreviewBlocks} now={overridePreviewNow} />
          </section>
        </>
      )}
    </div>
  );
}
