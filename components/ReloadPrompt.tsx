"use client";

// components/ReloadPrompt.tsx
// Shown on load when we return to a RUNNING session after being away longer than
// the threshold (computed from lastSeenAt). The user reconciles the away time:
//   - Count as work  -> applyAway("work")   (credit the full away gap)
//   - Don't count     -> applyAway("discard")(credit only up to last heartbeat)
//   - End             -> endSession (completed log) then back to start panel
//   - Cancel          -> cancelSession (cancelled log, excluded from metrics)
// Presentational modal — the parent wires each choice to useActiveSession.

import { msToHuman } from "@/lib/format";

export default function ReloadPrompt({
  awayMs,
  kind = "work",
  busy = false,
  onCountAsWork,
  onDontCount,
  onEnd,
  onCancel,
}: {
  awayMs: number;
  kind?: "work" | "break";
  busy?: boolean;
  onCountAsWork: () => void;
  onDontCount: () => void;
  onEnd: () => void;
  onCancel: () => void;
}) {
  const label = kind === "break" ? "break" : "session";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome back"
    >
      <div className="w-full max-w-sm rounded-3xl border border-border bg-surface p-6 shadow-2xl">
        <h2 className="mb-1 text-lg font-semibold">Welcome back</h2>
        <p className="mb-5 text-sm text-muted">
          Your {label} was running and you were away for{" "}
          <span className="font-semibold text-text">{msToHuman(awayMs)}</span>.
          Should that time count as work?
        </p>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCountAsWork}
            className="w-full rounded-2xl bg-accent px-4 py-3 text-base font-semibold text-accent-contrast transition-colors hover:bg-accent-hover disabled:opacity-40"
          >
            Count as work
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onDontCount}
            className="w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 text-base font-medium transition-colors hover:border-accent disabled:opacity-40"
          >
            Don&apos;t count it
          </button>

          <div className="mt-1 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onEnd}
              className="rounded-2xl border border-border bg-surface-2 px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:text-text disabled:opacity-40"
            >
              End {label}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className="rounded-2xl border border-border bg-surface-2 px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:text-danger disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
