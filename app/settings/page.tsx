"use client";

// app/settings/page.tsx
// Settings + Backup. Lets the user edit Pomodoro defaults and the
// notification/sound toggles, verify notifications + chime on their actual
// device, and export/import all data as JSON. Talks to the server only through
// the typed client wrappers in @/lib/api; uses the client-only notify/sound
// helpers directly for the test buttons.

import { useCallback, useEffect, useRef, useState } from "react";
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

  const permLabel = (() => {
    const p = notificationPermission();
    if (p === "unsupported") return "Not supported on this device";
    if (p === "granted") return "Allowed";
    if (p === "denied") return "Blocked";
    return "Not yet requested";
  })();

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted">
          Pomodoro defaults, notifications, and your data.
        </p>
      </header>

      {loadError ? (
        <div className="rounded-2xl border border-danger/40 bg-surface p-4 text-sm text-danger">
          {loadError}
        </div>
      ) : !settings ? (
        <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
          Loading…
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {/* Pomodoro defaults */}
          <section aria-labelledby="defaults-heading">
            <h2
              id="defaults-heading"
              className="mb-3 text-sm font-semibold tracking-tight text-muted"
            >
              Pomodoro defaults
            </h2>
            <div className="overflow-hidden rounded-2xl border border-border bg-surface">
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
            </div>
          </section>

          {/* Notifications + sound */}
          <section aria-labelledby="alerts-heading">
            <h2
              id="alerts-heading"
              className="mb-3 text-sm font-semibold tracking-tight text-muted"
            >
              Alerts
            </h2>
            <div className="overflow-hidden rounded-2xl border border-border bg-surface">
              <ToggleRow
                label="Notifications"
                hint={`Browser notifications when a timer ends or a block changes. Permission: ${permLabel}.`}
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
                  className="flex-1 rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm font-medium text-text transition-colors hover:border-accent hover:text-accent active:scale-[0.99]"
                >
                  Test notification
                </button>
                <button
                  type="button"
                  onClick={handleTestChime}
                  className="flex-1 rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm font-medium text-text transition-colors hover:border-accent hover:text-accent active:scale-[0.99]"
                >
                  Test chime
                </button>
              </div>
            </div>
            <p className="mt-2 px-1 text-xs text-muted">
              Use the test buttons to confirm alerts work on this device — iOS
              requires the app to be installed to the Home Screen for
              notifications.
            </p>
          </section>

          {/* Backup */}
          <section aria-labelledby="backup-heading">
            <h2
              id="backup-heading"
              className="mb-3 text-sm font-semibold tracking-tight text-muted"
            >
              Backup
            </h2>
            <div className="overflow-hidden rounded-2xl border border-border bg-surface">
              <div className="flex flex-col gap-1 p-4">
                <span className="text-sm font-medium">Export data</span>
                <span className="text-xs text-muted">
                  Download everything (history, schedule, settings) as a JSON
                  file.
                </span>
                <button
                  type="button"
                  onClick={handleExport}
                  className="mt-3 self-start rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-hover active:scale-[0.99]"
                >
                  Export JSON
                </button>
              </div>
              <div className="h-px bg-border" />
              <div className="flex flex-col gap-1 p-4">
                <span className="text-sm font-medium">Import data</span>
                <span className="text-xs text-muted">
                  Restore from a backup file. This overwrites all current data.
                </span>
                <button
                  type="button"
                  onClick={handleImportPick}
                  disabled={importing}
                  className="mt-3 self-start rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-sm font-semibold text-text transition-colors hover:border-accent hover:text-accent active:scale-[0.99] disabled:opacity-50"
                >
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
            </div>
          </section>

          {/* About / sync + passcode note */}
          <section aria-labelledby="about-heading">
            <h2
              id="about-heading"
              className="mb-3 text-sm font-semibold tracking-tight text-muted"
            >
              About
            </h2>
            <div className="rounded-2xl border border-border bg-surface p-4 text-xs leading-relaxed text-muted">
              <p>
                Data syncs across your phone and Mac only when an Upstash Redis
                store is configured (the{" "}
                <code className="rounded bg-surface-2 px-1 py-0.5 text-[11px] text-text">
                  UPSTASH_REDIS_REST_URL
                </code>{" "}
                /{" "}
                <code className="rounded bg-surface-2 px-1 py-0.5 text-[11px] text-text">
                  KV_REST_API_URL
                </code>{" "}
                env vars). Without it, data is stored locally on this server
                only — use Export / Import above to move it between devices.
              </p>
              <p className="mt-3">
                You can optionally protect the app with a passphrase by setting
                an{" "}
                <code className="rounded bg-surface-2 px-1 py-0.5 text-[11px] text-text">
                  APP_PASSCODE
                </code>{" "}
                environment variable on the server. It&rsquo;s off by default;
                when set, API routes require the passphrase before reading or
                writing data.
              </p>
            </div>
          </section>
        </div>
      )}

      {/* Toast */}
      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className={`fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-50 mx-auto w-fit max-w-[90vw] rounded-xl border px-4 py-2.5 text-sm shadow-lg md:bottom-6 md:left-60 ${
            toast.kind === "ok"
              ? "border-success/40 bg-surface text-success"
              : "border-danger/40 bg-surface text-danger"
          }`}
        >
          {toast.text}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row sub-components (kept local; presentational only).
// ---------------------------------------------------------------------------

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
        <div className="text-sm font-medium">{label}</div>
        <div className="mt-0.5 text-xs text-muted">{hint}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => onStep(-5)}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface-2 text-lg leading-none text-text transition-colors hover:border-accent hover:text-accent active:scale-95"
        >
          −
        </button>
        <div className="relative">
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
            className="h-10 w-16 rounded-xl border border-border bg-surface-2 text-center text-base font-semibold tabular-nums text-text outline-none focus:border-accent disabled:opacity-50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
        </div>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => onStep(5)}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface-2 text-lg leading-none text-text transition-colors hover:border-accent hover:text-accent active:scale-95"
        >
          +
        </button>
        <span className="ml-1 w-8 text-xs text-muted">min</span>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  busy,
  onToggle,
}: {
  label: string;
  hint: string;
  checked: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 p-4">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="mt-0.5 text-xs text-muted">{hint}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={busy}
        onClick={onToggle}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50 ${
          checked
            ? "border-accent bg-accent"
            : "border-border bg-surface-2"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}
