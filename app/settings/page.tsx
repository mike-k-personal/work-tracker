"use client";

// app/settings/page.tsx
// Settings + Backup, plus the entry point to the Daily schedule (schedule was
// folded out of the primary nav and now lives here). Lets the user open the
// schedule editor, edit Pomodoro defaults and the notification/sound toggles,
// verify notifications + chime on their actual device, and export/import all
// data as JSON. Talks to the server only through the typed client wrappers in
// @/lib/api; uses the client-only notify/sound helpers directly for the test
// buttons. Restyled onto the blue-dark design system + shared UI primitives.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ApiError,
  exportData,
  getSettings,
  importData,
  putSettings,
} from "@/lib/api";
import {
  ensureNotificationPermission,
  notificationPermission,
  notify,
} from "@/lib/notify";
import { playChime, soundSupported, unlock } from "@/lib/sound";
import type { Settings } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";

const MIN_MINUTES = 1;
const MAX_MINUTES = 600;

type Toast = { kind: "ok" | "err"; text: string };

function clampMinutes(n: number): number {
  if (!Number.isFinite(n)) return MIN_MINUTES;
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(n)));
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingField, setSavingField] = useState<keyof Settings | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  // Editable text for the two minute fields (kept as strings so the user can
  // clear/retype freely; committed onBlur / via the stepper).
  const [workText, setWorkText] = useState("");
  const [breakText, setBreakText] = useState("");

  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((t: Toast) => {
    setToast(t);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => {
    let alive = true;
    getSettings()
      .then((s) => {
        if (!alive) return;
        setSettings(s);
        setWorkText(String(s.defaultWorkMin));
        setBreakText(String(s.defaultBreakMin));
      })
      .catch((e) => {
        if (!alive) return;
        setLoadError(
          e instanceof ApiError ? e.message : "Couldn't load settings.",
        );
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  // Persist a patch and merge the server's authoritative result back in.
  const save = useCallback(
    async (field: keyof Settings, patch: Partial<Settings>) => {
      setSavingField(field);
      try {
        const next = await putSettings(patch);
        setSettings(next);
        setWorkText(String(next.defaultWorkMin));
        setBreakText(String(next.defaultBreakMin));
      } catch (e) {
        showToast({
          kind: "err",
          text: e instanceof ApiError ? e.message : "Couldn't save settings.",
        });
        // Re-sync editable text from last-known-good settings on failure.
        if (settings) {
          setWorkText(String(settings.defaultWorkMin));
          setBreakText(String(settings.defaultBreakMin));
        }
      } finally {
        setSavingField(null);
      }
    },
    [settings, showToast],
  );

  const commitMinutes = useCallback(
    (field: "defaultWorkMin" | "defaultBreakMin", raw: string) => {
      if (!settings) return;
      const current = settings[field];
      const parsed = clampMinutes(Number(raw));
      const setText =
        field === "defaultWorkMin" ? setWorkText : setBreakText;
      setText(String(parsed));
      if (parsed !== current) void save(field, { [field]: parsed });
    },
    [settings, save],
  );

  const toggle = useCallback(
    (field: "notificationsEnabled" | "soundEnabled") => {
      if (!settings) return;
      void save(field, { [field]: !settings[field] });
    },
    [settings, save],
  );

  const handleTestNotification = useCallback(async () => {
    const perm = await ensureNotificationPermission();
    if (perm !== "granted") {
      showToast({
        kind: "err",
        text:
          perm === "denied"
            ? "Notifications are blocked. Enable them in your browser/site settings."
            : "Notification permission was not granted.",
      });
      return;
    }
    const ok = await notify("Work Tracker", "Test notification — looking good!", {
      tag: "wt-test",
      renotify: true,
    });
    showToast(
      ok
        ? { kind: "ok", text: "Notification sent." }
        : { kind: "err", text: "Couldn't show a notification on this device." },
    );
  }, [showToast]);

  const handleTestChime = useCallback(async () => {
    if (!soundSupported()) {
      showToast({ kind: "err", text: "Audio isn't supported on this device." });
      return;
    }
    await unlock(); // resume the AudioContext from this gesture
    playChime();
    showToast({ kind: "ok", text: "Chime played." });
  }, [showToast]);

  const handleExport = useCallback(() => {
    try {
      exportData();
    } catch {
      showToast({ kind: "err", text: "Couldn't start the download." });
    }
  }, [showToast]);

  const handleImportPick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleImportFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // Allow re-picking the same file later.
      e.target.value = "";
      if (!file) return;

      const confirmed = window.confirm(
        "Import this backup? It will OVERWRITE all current data " +
          "(sessions, history, schedule, and settings) on every device. " +
          "Any in-progress session is discarded. This cannot be undone.",
      );
      if (!confirmed) return;

      setImporting(true);
      try {
        const text = await file.text();
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new Error("That file isn't valid JSON.");
        }
        const doc = await importData(parsed);
        setSettings(doc.settings);
        setWorkText(String(doc.settings.defaultWorkMin));
        setBreakText(String(doc.settings.defaultBreakMin));
        showToast({
          kind: "ok",
          text: `Imported ${doc.logs.length} log${
            doc.logs.length === 1 ? "" : "s"
          }.`,
        });
      } catch (err) {
        showToast({
          kind: "err",
          text:
            err instanceof ApiError
              ? err.message
              : err instanceof Error
                ? err.message
                : "Import failed.",
        });
      } finally {
        setImporting(false);
      }
    },
    [showToast],
  );

  const perm = notificationPermission();
  const permBadge: { tone: "success" | "danger" | "muted"; label: string } =
    perm === "granted"
      ? { tone: "success", label: "Allowed" }
      : perm === "denied"
        ? { tone: "danger", label: "Blocked" }
        : perm === "unsupported"
          ? { tone: "muted", label: "Not supported" }
          : { tone: "muted", label: "Not requested" };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        eyebrow="Control panel"
        title="Settings"
        subtitle="Your daily schedule, Pomodoro defaults, alerts, and data — all in one place."
      />

      {loadError ? (
        <Card className="border-danger/40 p-4 text-sm text-danger">
          {loadError}
        </Card>
      ) : !settings ? (
        <Card className="flex items-center gap-2 p-4 text-sm text-muted">
          <span className="h-1.5 w-1.5 animate-pulse-glow rounded-full bg-accent" />
          <span className="font-mono text-xs uppercase tracking-wider">
            Loading…
          </span>
        </Card>
      ) : (
        <div className="flex flex-col gap-8">
          {/* Daily schedule entry point — prominent link-Card (schedule isn't
              in the primary nav). */}
          <section aria-labelledby="schedule-heading" className="animate-fade-up">
            <SectionLabel id="schedule-heading">Planning</SectionLabel>
            <Link href="/schedule" className="group block">
              <Card
                interactive
                className="flex items-center gap-4 overflow-hidden p-4 transition-transform active:scale-[0.99]"
              >
                <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-accent/25 bg-accent-soft text-accent-hover shadow-[0_0_18px_-6px_var(--glow)]">
                  <svg {...iconProps} aria-hidden="true">
                    <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
                    <path d="M3 9h18M8 2.5v4M16 2.5v4" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-base font-semibold tracking-tight text-text">
                      Daily schedule
                    </span>
                    <span className="eyebrow text-[0.625rem]">Guide</span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    Set your weekly work / off days and time blocks
                  </div>
                </div>
                <svg
                  {...iconProps}
                  className="shrink-0 text-faint transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-accent"
                  aria-hidden="true"
                >
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </Card>
            </Link>
          </section>

          {/* Pomodoro defaults */}
          <section
            aria-labelledby="defaults-heading"
            className="animate-fade-up"
            style={{ animationDelay: "60ms" }}
          >
            <SectionLabel id="defaults-heading">Pomodoro defaults</SectionLabel>
            <Card className="overflow-hidden p-0">
              <MinuteRow
                label="Work session"
                hint="Pre-fills the duration when you start a work session."
                value={workText}
                busy={savingField === "defaultWorkMin"}
                onChange={setWorkText}
                onCommit={(v) => commitMinutes("defaultWorkMin", v)}
                onStep={(delta) =>
                  commitMinutes(
                    "defaultWorkMin",
                    String(settings.defaultWorkMin + delta),
                  )
                }
              />
              <div className="h-px bg-border" />
              <MinuteRow
                label="Break length"
                hint="Pre-fills the break prompt after a work session."
                value={breakText}
                busy={savingField === "defaultBreakMin"}
                onChange={setBreakText}
                onCommit={(v) => commitMinutes("defaultBreakMin", v)}
                onStep={(delta) =>
                  commitMinutes(
                    "defaultBreakMin",
                    String(settings.defaultBreakMin + delta),
                  )
                }
              />
            </Card>
          </section>

          {/* Notifications + sound */}
          <section
            aria-labelledby="alerts-heading"
            className="animate-fade-up"
            style={{ animationDelay: "120ms" }}
          >
            <SectionLabel id="alerts-heading">Alerts</SectionLabel>
            <Card className="overflow-hidden p-0">
              <ToggleRow
                label="Notifications"
                hint="Browser notifications when a timer ends or a block changes."
                badge={<Badge tone={permBadge.tone}>{permBadge.label}</Badge>}
                checked={settings.notificationsEnabled}
                busy={savingField === "notificationsEnabled"}
                onToggle={() => toggle("notificationsEnabled")}
              />
              <div className="h-px bg-border" />
              <ToggleRow
                label="Sound"
                hint="Play a chime when a timer ends."
                checked={settings.soundEnabled}
                busy={savingField === "soundEnabled"}
                onToggle={() => toggle("soundEnabled")}
              />
              <div className="h-px bg-border" />
              <div className="flex flex-col gap-3 p-4 sm:flex-row">
                <button
                  type="button"
                  onClick={handleTestNotification}
                  className="btn-secondary h-11 flex-1 px-4 text-sm"
                >
                  <svg {...iconProps} width={16} height={16} aria-hidden="true">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
                  </svg>
                  Test notification
                </button>
                <button
                  type="button"
                  onClick={handleTestChime}
                  className="btn-secondary h-11 flex-1 px-4 text-sm"
                >
                  <svg {...iconProps} width={16} height={16} aria-hidden="true">
                    <path d="M11 5 6 9H2v6h4l5 4V5z" />
                    <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" />
                  </svg>
                  Test chime
                </button>
              </div>
            </Card>
            <p className="mt-2 px-1 text-xs text-faint">
              Use the test buttons to confirm alerts work on this device — iOS
              requires the app to be installed to the Home Screen for
              notifications.
            </p>
          </section>

          {/* Backup */}
          <section
            aria-labelledby="backup-heading"
            className="animate-fade-up"
            style={{ animationDelay: "180ms" }}
          >
            <SectionLabel id="backup-heading">Backup</SectionLabel>
            <Card className="overflow-hidden p-0">
              <div className="flex flex-col gap-1 p-4">
                <span className="text-sm font-medium text-text">
                  Export data
                </span>
                <span className="text-xs text-muted">
                  Download everything (history, schedule, settings) as a JSON
                  file.
                </span>
                <button
                  type="button"
                  onClick={handleExport}
                  className="btn-primary mt-3 h-11 self-start px-4 text-sm"
                >
                  <svg {...iconProps} width={16} height={16} aria-hidden="true">
                    <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
                    <path d="M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
                  </svg>
                  Export JSON
                </button>
              </div>
              <div className="h-px bg-border" />
              <div className="flex flex-col gap-1 p-4">
                <span className="text-sm font-medium text-text">
                  Import data
                </span>
                <span className="text-xs text-muted">
                  Restore from a backup file. This overwrites all current data.
                </span>
                <button
                  type="button"
                  onClick={handleImportPick}
                  disabled={importing}
                  className="btn-secondary mt-3 h-11 self-start px-4 text-sm font-semibold disabled:opacity-50"
                >
                  <svg {...iconProps} width={16} height={16} aria-hidden="true">
                    <path d="M12 15V3m0 0 4 4m-4-4-4 4" />
                    <path d="M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
                  </svg>
                  {importing ? "Importing…" : "Import JSON"}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={handleImportFile}
                  className="hidden"
                />
              </div>
            </Card>
          </section>

          {/* About / sync + passcode note */}
          <section
            aria-labelledby="about-heading"
            className="animate-fade-up"
            style={{ animationDelay: "240ms" }}
          >
            <SectionLabel id="about-heading">About</SectionLabel>
            <Card className="p-4 text-xs leading-relaxed text-muted">
              <p>
                Data syncs across your phone and Mac only when an Upstash Redis
                store is configured (the{" "}
                <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11px] text-accent-hover">
                  UPSTASH_REDIS_REST_URL
                </code>{" "}
                /{" "}
                <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11px] text-accent-hover">
                  KV_REST_API_URL
                </code>{" "}
                env vars). Without it, data is stored locally on this server
                only — use Export / Import above to move it between devices.
              </p>
              <p className="mt-3">
                You can optionally protect the app with a passphrase by setting
                an{" "}
                <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[11px] text-accent-hover">
                  APP_PASSCODE
                </code>{" "}
                environment variable on the server. It&rsquo;s off by default;
                when set, API routes require the passphrase before reading or
                writing data.
              </p>
            </Card>
          </section>
        </div>
      )}

      {/* Toast */}
      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className={`animate-fade-up fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-50 mx-auto flex w-fit max-w-[90vw] items-center gap-2 rounded-xl border px-4 py-2.5 text-sm shadow-lg backdrop-blur-sm md:bottom-6 md:left-60 ${
            toast.kind === "ok"
              ? "border-success/40 bg-surface/95 text-success shadow-[0_8px_28px_-10px_rgb(74_222_128/0.4)]"
              : "border-danger/40 bg-surface/95 text-danger shadow-[0_8px_28px_-10px_rgb(251_113_133/0.4)]"
          }`}
        >
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              toast.kind === "ok" ? "bg-success" : "bg-danger"
            }`}
          />
          {toast.text}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared icon props for inline SVGs (matches the Nav style).
// ---------------------------------------------------------------------------

const iconProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

// ---------------------------------------------------------------------------
// Row sub-components (kept local; presentational only).
// ---------------------------------------------------------------------------

function SectionLabel({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  return (
    <h2 id={id} className="eyebrow mb-3 px-1">
      {children}
    </h2>
  );
}

function MinuteRow({
  label,
  hint,
  value,
  busy,
  onChange,
  onCommit,
  onStep,
}: {
  label: string;
  hint: string;
  value: string;
  busy: boolean;
  onChange: (v: string) => void;
  onCommit: (v: string) => void;
  onStep: (delta: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 p-4">
      <div className="min-w-0">
        <div className="text-sm font-medium text-text">{label}</div>
        <div className="mt-0.5 text-xs text-muted">{hint}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => onStep(-5)}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface-2 text-lg leading-none text-muted transition-colors hover:border-accent hover:text-accent active:scale-95"
        >
          −
        </button>
        <div className="relative flex items-baseline gap-1 rounded-xl border border-border bg-surface-2 px-2 transition-colors focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--accent-soft)]">
          <input
            type="number"
            inputMode="numeric"
            min={MIN_MINUTES}
            max={MAX_MINUTES}
            value={value}
            disabled={busy}
            aria-label={`${label} in minutes`}
            onChange={(e) => onChange(e.target.value)}
            onBlur={(e) => onCommit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className={`readout h-10 w-10 border-0 bg-transparent text-center text-base font-semibold text-text outline-none disabled:opacity-50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
              busy ? "animate-pulse-glow" : ""
            }`}
          />
          <span className="font-mono text-[0.625rem] uppercase tracking-wider text-faint">
            min
          </span>
        </div>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => onStep(5)}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface-2 text-lg leading-none text-muted transition-colors hover:border-accent hover:text-accent active:scale-95"
        >
          +
        </button>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  badge,
  checked,
  busy,
  onToggle,
}: {
  label: string;
  hint: string;
  badge?: React.ReactNode;
  checked: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 p-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text">{label}</span>
          {badge}
        </div>
        <div className="mt-0.5 text-xs text-muted">{hint}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={busy}
        onClick={onToggle}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-all duration-200 active:scale-95 disabled:opacity-50 ${
          checked
            ? "border-accent bg-accent shadow-[0_0_14px_-2px_var(--glow)]"
            : "border-border bg-surface-2"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full shadow transition-transform duration-200 ${
            checked
              ? "translate-x-6 bg-accent-contrast"
              : "translate-x-1 bg-faint"
          }`}
        />
      </button>
    </div>
  );
}
