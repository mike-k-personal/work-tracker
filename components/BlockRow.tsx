"use client";

// components/BlockRow.tsx
// A single editable schedule block row: type toggle (work|break), label input,
// start/end time inputs ("HH:MM"), and a delete button. Mobile-friendly with
// large touch targets. Purely presentational/controlled — all edits are pushed
// up via onChange/onRemove; the parent (ScheduleEditor) owns the list and
// validation/sorting. Restyled onto the blue-dark design system: work blocks
// read as accent, break blocks as a calmer muted/success tone, with a colored
// left rail so a stack of blocks scans at a glance.

import type { Block, BlockType } from "@/lib/types";

/** A single, possibly out-of-order or invalid, block being edited. */
export default function BlockRow({
  block,
  invalid = false,
  onChange,
  onRemove,
}: {
  block: Block;
  /** Mark the row when its times are missing/inverted (parent decides). */
  invalid?: boolean;
  onChange: (patch: Partial<Block>) => void;
  onRemove: () => void;
}) {
  const isWork = block.type === "work";

  return (
    <div
      className={`relative overflow-hidden rounded-xl border bg-surface p-3 pl-4 transition-colors ${
        invalid
          ? "border-danger/60"
          : isWork
            ? "border-border hover:border-accent/40"
            : "border-border hover:border-border-strong"
      }`}
      role="listitem"
    >
      {/* Glowing colored left rail keys the block type at a glance:
          work = electric accent, break = calmer success/muted. */}
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 w-1 ${
          isWork
            ? "bg-accent shadow-[0_0_12px_0_var(--glow)]"
            : "bg-success/50"
        }`}
      />

      <div className="flex flex-wrap items-center gap-2">
        {/* Type toggle: work | break */}
        <div
          className="inline-flex shrink-0 overflow-hidden rounded-lg border border-border"
          role="group"
          aria-label="Block type"
        >
          {(["work", "break"] as BlockType[]).map((t) => {
            const selected = block.type === t;
            return (
              <button
                key={t}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  if (block.type !== t) onChange({ type: t });
                }}
                className={`h-9 px-3.5 font-mono text-[0.6875rem] font-semibold uppercase tracking-wider transition-colors ${
                  selected
                    ? t === "work"
                      ? "bg-accent text-accent-contrast"
                      : "bg-success/20 text-success"
                    : "bg-surface-2 text-faint hover:text-text"
                }`}
              >
                {t}
              </button>
            );
          })}
        </div>

        {/* Label */}
        <input
          type="text"
          value={block.label}
          placeholder={isWork ? "Deep work" : "Break"}
          aria-label="Block label"
          onChange={(e) => onChange({ label: e.target.value })}
          className="h-9 min-w-0 flex-1 basis-40 rounded-lg border border-border bg-surface-2 px-3 text-sm text-text outline-none transition-colors focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
        />

        {/* Delete */}
        <button
          type="button"
          aria-label="Remove block"
          onClick={onRemove}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-2 text-muted transition-colors hover:border-danger/60 hover:text-danger active:scale-95"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
          </svg>
        </button>
      </div>

      {/* Times — mono HH:MM readouts, instrument-styled. */}
      <div className="mt-2.5 flex items-center gap-2">
        <label className="flex items-center gap-2 font-mono text-[0.625rem] uppercase tracking-wider text-faint">
          <span className="shrink-0">Start</span>
          <input
            type="time"
            value={block.start}
            aria-label="Start time"
            onChange={(e) => onChange({ start: e.target.value })}
            className="h-9 w-[7.5rem] rounded-lg border border-border bg-surface-2 px-2.5 font-mono text-sm tabular-nums tracking-wide text-text outline-none transition-colors focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
          />
        </label>
        <span className="text-faint" aria-hidden="true">
          →
        </span>
        <label className="flex items-center gap-2 font-mono text-[0.625rem] uppercase tracking-wider text-faint">
          <span className="shrink-0">End</span>
          <input
            type="time"
            value={block.end}
            aria-label="End time"
            onChange={(e) => onChange({ end: e.target.value })}
            className="h-9 w-[7.5rem] rounded-lg border border-border bg-surface-2 px-2.5 font-mono text-sm tabular-nums tracking-wide text-text outline-none transition-colors focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
          />
        </label>
      </div>

      {invalid && (
        <p className="mt-2 font-mono text-[0.6875rem] uppercase tracking-wider text-danger">
          End time must be after start time.
        </p>
      )}
    </div>
  );
}
