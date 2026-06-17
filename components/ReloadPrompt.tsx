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
      className="animate-fade-in fixed inset-0 z-50 flex items-end justify-center bg-bg/70 p-4 backdrop-blur-md sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome back"
    >
      <div className="card animate-fade-up w-full max-w-sm p-6 shadow-card-lg">
        <p className="eyebrow mb-1.5">Reconnected</p>
        <h2 className="font-display mb-2 text-lg font-semibold tracking-tight text-text">
          Welcome back
        </h2>
        <p className="mb-5 text-sm text-muted">
          Your {label} was running and you were away for{" "}
          <span className="readout font-semibold text-text">
            {msToHuman(awayMs)}
          </span>
          . Should that time count as work?
        </p>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCountAsWork}
            className="btn-primary w-full px-4 py-3 text-base"
          >
            Count as work
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onDontCount}
            className="btn-secondary w-full px-4 py-3 text-base"
          >
            Don&apos;t count it
          </button>

          <div className="mt-1 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onEnd}
              className="btn-secondary px-4 py-2.5 text-sm"
            >
              End {label}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className="btn-secondary px-4 py-2.5 text-sm text-muted hover:text-danger"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
