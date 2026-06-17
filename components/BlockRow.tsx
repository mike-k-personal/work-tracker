"use client";

// components/BlockRow.tsx
// A single editable schedule block row: type toggle (work|break), label input,
// start/end time inputs ("HH:MM"), and a delete button. Mobile-friendly with
// large touch targets. Purely presentational/controlled — all edits are pushed
// up via onChange/onRemove; the parent (ScheduleEditor) owns the list and
// validation/sorting.

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
      className={`rounded-xl border bg-surface p-3 ${
        invalid ? "border-danger/60" : "border-border"
      }`}
      role="listitem"
    >
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
                className={`px-3 py-2 text-xs font-semibold capitalize transition-colors ${
                  selected
                    ? t === "work"
                      ? "bg-accent text-accent-contrast"
                      : "bg-success/20 text-success"
                    : "bg-surface-2 text-muted hover:text-text"
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
          className="min-w-0 flex-1 basis-40 rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
        />

        {/* Delete */}
        <button
          type="button"
          aria-label="Remove block"
          onClick={onRemove}
          className="shrink-0 rounded-lg border border-border bg-surface-2 p-2 text-muted transition-colors hover:border-danger/60 hover:text-danger"
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

      {/* Times */}
      <div className="mt-2 flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <span className="shrink-0">Start</span>
          <input
            type="time"
            value={block.start}
            aria-label="Start time"
            onChange={(e) => onChange({ start: e.target.value })}
            className="w-[7.5rem] rounded-lg px-2 py-1.5 text-sm tabular-nums outline-none focus:border-accent"
          />
        </label>
        <span className="text-muted" aria-hidden="true">
          –
        </span>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <span className="shrink-0">End</span>
          <input
            type="time"
            value={block.end}
            aria-label="End time"
            onChange={(e) => onChange({ end: e.target.value })}
            className="w-[7.5rem] rounded-lg px-2 py-1.5 text-sm tabular-nums outline-none focus:border-accent"
          />
        </label>
      </div>

      {invalid && (
        <p className="mt-2 text-xs text-danger">
          End time must be after start time.
        </p>
      )}
    </div>
  );
}
