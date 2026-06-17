"use client";

// app/schedule/page.tsx
// Editor for the CONCEPTUAL schedule (a guide only — it never runs timers).
// Reached from Settings (schedule was removed from the primary nav), so there's
// a back link to /settings at the top.
// Two tabs:
//   1. Weekly — classify each day-of-week as a WORK day or an OFF day, then edit
//      the two reusable templates (one workday schedule, one off-day schedule).
//      Every work day inherits the workday template; every off day the off-day.
//   2. Date overrides — pick a date (defaults to tomorrow, for planning "the
//      night before") and build a custom block list that wins over the template
//      for that single date. Copy-from-template seeds it from the matching one.
// Loads via getSchedule, saves via putSchedule. A live Timeline preview shows
// the schedule being edited. Restyled onto the blue-dark design system.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Block, DayType, Schedule } from "@/lib/types";
import { ApiError, getSchedule, putSchedule } from "@/lib/api";
import { defaultDayTypes, dayTypeForDate } from "@/lib/schedule";
import ScheduleEditor, { isBlockInvalid } from "@/components/ScheduleEditor";
import Timeline from "@/components/Timeline";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";

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

function BackLink() {
  return (
    <Link
      href="/settings"
      className="group mb-4 inline-flex items-center gap-1.5 font-mono text-xs font-medium uppercase tracking-wider text-muted transition-colors hover:text-text"
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
        className="transition-transform duration-200 group-hover:-translate-x-0.5"
      >
        <path d="M15 18l-6-6 6-6" />
      </svg>
      Settings
    </Link>
  );
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
      <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
        <BackLink />
        <PageHeader title="Daily schedule" />
        <Card className="border-danger/40 p-4 text-sm text-danger">
          {loadError}
        </Card>
      </div>
    );
  }

  if (!schedule) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
        <BackLink />
        <PageHeader eyebrow="Reference" title="Daily schedule" />
        <Card className="flex items-center gap-2 p-4 text-sm text-muted">
          <span className="h-1.5 w-1.5 animate-pulse-glow rounded-full bg-accent" />
          <span className="font-mono text-xs uppercase tracking-wider">
            Loading…
          </span>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
      <BackLink />
      <PageHeader
        eyebrow="Reference"
        title="Daily schedule"
        subtitle="A guide for your day — it nudges you, but never starts or stops anything."
      />

      {/* Instrument-styled segmented tabs */}
      <div
        className="animate-fade-up mb-6 inline-flex w-full rounded-xl border border-border bg-surface p-1 sm:w-auto"
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
              className={`flex h-10 flex-1 items-center justify-center gap-2 rounded-lg px-4 font-mono text-xs font-medium uppercase tracking-wider transition-all duration-200 sm:flex-none ${
                active
                  ? "bg-surface-2 text-accent-hover shadow-[inset_0_0_0_1px_var(--accent-soft),0_0_12px_-4px_var(--glow)]"
                  : "text-muted hover:text-text"
              }`}
            >
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 rounded-full transition-colors ${
                  active ? "bg-accent" : "bg-faint/50"
                }`}
              />
              {label}
            </button>
          );
        })}
      </div>

      {tab === "weekly" ? (
        <div className="flex flex-col gap-6">
          {/* Work-day classification */}
          <Card
            className="animate-fade-up p-4 sm:p-5"
            style={{ animationDelay: "40ms" }}
          >
            <h2 className="font-display text-base font-semibold tracking-tight text-text">
              Which days do you work?
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              Tap a day to switch it between work and off.
            </p>
            <div
              className="mt-3 grid grid-cols-7 gap-1.5"
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
                    className={`flex h-12 flex-col items-center justify-center gap-0.5 rounded-xl border font-mono text-[0.6875rem] font-semibold uppercase tracking-wider transition-all duration-150 active:scale-95 ${
                      isWork
                        ? "border-accent bg-accent text-accent-contrast shadow-[0_0_14px_-4px_var(--glow)]"
                        : "border-border bg-surface-2 text-faint hover:border-border-strong hover:text-text"
                    }`}
                  >
                    {label}
                    <span
                      aria-hidden="true"
                      className={`h-1 w-1 rounded-full ${
                        isWork ? "bg-accent-contrast/60" : "bg-faint/40"
                      }`}
                    />
                  </button>
                );
              })}
            </div>
            <p className="mt-3 font-mono text-[0.6875rem] uppercase tracking-wider text-muted">
              {workDays.length === 0
                ? "Every day is an off day."
                : workDays.length === 7
                  ? "Every day is a work day."
                  : `Work · ${workDays.map((d) => DOW_LABELS[d]).join(" · ")}`}
            </p>
          </Card>

          {/* Template selector + editor */}
          <Card
            className="animate-fade-up p-4 sm:p-5"
            style={{ animationDelay: "100ms" }}
          >
            <h2 className="font-display text-base font-semibold tracking-tight text-text">
              Schedule template
            </h2>
            <div
              className="mt-3 inline-flex rounded-xl border border-border bg-surface-2 p-1"
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
                    className={`flex h-9 items-center gap-1.5 rounded-lg px-4 font-mono text-xs font-medium uppercase tracking-wider transition-all duration-200 ${
                      active
                        ? "bg-surface text-accent-hover shadow-[inset_0_0_0_1px_var(--accent-soft)]"
                        : "text-muted hover:text-text"
                    }`}
                  >
                    {TEMPLATE_LABEL[key]}
                    {count > 0 && (
                      <span
                        className={`tabular-nums ${
                          active ? "text-accent" : "text-faint"
                        }`}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="mt-2.5 text-xs text-muted">
              Editing the{" "}
              <span className="font-medium text-text">
                {TEMPLATE_LABEL[whichTemplate].toLowerCase()}
              </span>{" "}
              schedule — applies to every {whichTemplate} day above.
            </p>

            <div className="mt-4">
              <ScheduleEditor
                blocks={templateDraft}
                onChange={setTemplateDraft}
              />
            </div>

            {/* Save bar */}
            <SaveBar
              onSave={handleSaveWeekly}
              onRevert={handleRevertWeekly}
              saving={saving}
              dirty={weeklyDirty}
              saved={saved}
              saveError={saveError}
            />
          </Card>

          {/* Live preview */}
          <section
            className="animate-fade-up"
            style={{ animationDelay: "160ms" }}
          >
            <PreviewHeader label={`${TEMPLATE_LABEL[whichTemplate]} preview`} />
            <Timeline blocks={weeklyPreviewBlocks} now={weeklyPreviewNow} />
          </section>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Date selector + editor */}
          <Card
            className="animate-fade-up p-4 sm:p-5"
            style={{ animationDelay: "40ms" }}
          >
            <label
              className="block font-display text-base font-semibold tracking-tight text-text"
              htmlFor="override-date"
            >
              Custom day
            </label>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <input
                id="override-date"
                type="date"
                value={overrideDate}
                onChange={(e) =>
                  setOverrideDate(e.target.value || tomorrowKey())
                }
                className="h-11 rounded-xl border border-border bg-surface-2 px-3 font-mono text-sm tabular-nums text-text outline-none transition-colors focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
              />
              {hasOverride ? (
                <Badge tone="accent">Custom day</Badge>
              ) : (
                <Badge tone={overrideType === "off" ? "muted" : "default"}>
                  {overrideType === "off" ? "Off day" : "Work day"}
                </Badge>
              )}
            </div>
            <p className="mt-2.5 text-xs text-muted">
              <span className="font-medium text-text">
                {DOW_LABELS_LONG[overrideDateObj.getDay()]}
              </span>
              {hasOverride
                ? " · custom blocks override the template for this date."
                : ` · using the ${TEMPLATE_LABEL[overrideType].toLowerCase()} schedule. Add blocks to override just this date.`}
            </p>

            <div className="mt-4">
              <ScheduleEditor
                blocks={overrideDraft}
                onChange={setOverrideDraft}
                onCopyFrom={copyFromTemplate}
                copyFromLabel={`Copy from ${TEMPLATE_LABEL[overrideType]} schedule`}
              />
            </div>

            {/* Save bar */}
            <SaveBar
              onSave={handleSaveOverride}
              onRevert={handleRevertOverride}
              saving={saving}
              dirty={overrideDirty}
              saved={saved}
              saveError={saveError}
              extra={
                hasOverride ? (
                  <button
                    type="button"
                    onClick={handleClearOverride}
                    disabled={saving}
                    className="inline-flex h-10 items-center rounded-xl border border-border bg-surface-2 px-4 text-sm font-medium text-danger transition-colors hover:border-danger/60 disabled:opacity-50"
                  >
                    Clear override
                  </button>
                ) : null
              }
            />
          </Card>

          {/* Live preview */}
          <section
            className="animate-fade-up"
            style={{ animationDelay: "100ms" }}
          >
            <PreviewHeader label="Preview" />
            <Timeline blocks={overridePreviewBlocks} now={overridePreviewNow} />
          </section>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live-preview section header — eyebrow label with a faint "live" indicator,
// reinforcing that the Timeline below tracks a moving "now" line.
// ---------------------------------------------------------------------------

function PreviewHeader({ label }: { label: string }) {
  return (
    <div className="mb-3 flex items-center gap-2 px-1">
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 animate-pulse-glow rounded-full bg-accent"
      />
      <h2 className="eyebrow">{label}</h2>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared save bar: Save (primary) + Revert + optional extra + status.
// ---------------------------------------------------------------------------

function SaveBar({
  onSave,
  onRevert,
  saving,
  dirty,
  saved,
  saveError,
  extra,
}: {
  onSave: () => void;
  onRevert: () => void;
  saving: boolean;
  dirty: boolean;
  saved: boolean;
  saveError: string | null;
  extra?: React.ReactNode;
}) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-5">
      <button
        type="button"
        onClick={onSave}
        disabled={saving || !dirty}
        className="btn-primary h-10 px-5 text-sm disabled:cursor-not-allowed"
      >
        {saving ? "Saving…" : "Save"}
      </button>

      {dirty && !saving && (
        <button
          type="button"
          onClick={onRevert}
          className="inline-flex h-10 items-center rounded-xl border border-border bg-surface-2 px-4 text-sm font-medium text-muted transition-colors hover:text-text"
        >
          Revert
        </button>
      )}

      {extra}

      {dirty && !saving && (
        <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[0.6875rem] uppercase tracking-wider text-warning">
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full bg-warning"
          />
          Unsaved
        </span>
      )}

      {saved && !dirty && (
        <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[0.6875rem] uppercase tracking-wider text-success">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M20 6L9 17l-5-5" />
          </svg>
          Saved
        </span>
      )}
      {saveError && (
        <span className="ml-auto text-sm text-danger">{saveError}</span>
      )}
    </div>
  );
}
