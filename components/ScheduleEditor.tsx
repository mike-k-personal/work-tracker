"use client";

// components/ScheduleEditor.tsx
// Edits the ordered list of blocks for one schedule (a work/off template OR a
// date override). Add a block, edit type/label/times via BlockRow, sort by
// start time, and remove. Times are validated (end must be after start).
// When editing a date override, an optional "Copy from …" button seeds the list
// from the template matching that date's day-type.
//
// Controlled: the parent owns `blocks` and receives every change via onChange.
// This component never persists — the parent (schedule page) batches saves.

import type { Block } from "@/lib/types";
import { hhmmToMinutes } from "@/lib/format";
import BlockRow from "@/components/BlockRow";

/** A block whose start/end are missing or inverted (end <= start). */
export function isBlockInvalid(block: Block): boolean {
  const start = hhmmToMinutes(block.start);
  const end = hhmmToMinutes(block.end);
  // Both must be present-ish (we accept "00:00" only when both differ).
  if (!block.start || !block.end) return true;
  return end <= start;
}

/** Sort blocks ascending by start time (stable-ish for equal starts by end). */
export function sortBlocks(blocks: Block[]): Block[] {
  return [...blocks].sort((a, b) => {
    const sa = hhmmToMinutes(a.start);
    const sb = hhmmToMinutes(b.start);
    if (sa !== sb) return sa - sb;
    return hhmmToMinutes(a.end) - hhmmToMinutes(b.end);
  });
}

function newBlock(prev: Block[]): Block {
  // Default a new block to start where the last one ends (or 09:00),
  // running for an hour, so consecutive adds chain sensibly.
  const last = prev.length > 0 ? sortBlocks(prev)[prev.length - 1] : null;
  const startMin = last ? hhmmToMinutes(last.end) : 9 * 60;
  const start = clampHhmm(startMin);
  const end = clampHhmm(startMin + 60);
  return {
    id: crypto.randomUUID(),
    type: "work",
    label: "",
    start,
    end,
  };
}

function clampHhmm(minutes: number): string {
  const clamped = Math.min(24 * 60 - 1, Math.max(0, Math.floor(minutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${pad(h)}:${pad(m)}`;
}

export default function ScheduleEditor({
  blocks,
  onChange,
  onCopyFrom,
  copyFromLabel,
}: {
  blocks: Block[];
  onChange: (next: Block[]) => void;
  /** Provided ONLY when editing a date override — enables the copy button. */
  onCopyFrom?: () => void;
  /** e.g. "Copy from Workday schedule" — shown on the copy button. */
  copyFromLabel?: string;
}) {
  function patchBlock(id: string, patch: Partial<Block>) {
    onChange(blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  function removeBlock(id: string) {
    onChange(blocks.filter((b) => b.id !== id));
  }

  function addBlock() {
    onChange([...blocks, newBlock(blocks)]);
  }

  function sortByStart() {
    onChange(sortBlocks(blocks));
  }

  const anyInvalid = blocks.some(isBlockInvalid);
  // Render in display order (sorted) without reordering the stored array, so
  // editing a time doesn't make a row jump while you're typing.
  const ordered = sortBlocks(blocks);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={addBlock}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-hover"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add block
        </button>

        {blocks.length > 1 && (
          <button
            type="button"
            onClick={sortByStart}
            className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-text"
          >
            Sort by start
          </button>
        )}

        {onCopyFrom && (
          <button
            type="button"
            onClick={onCopyFrom}
            className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-text"
          >
            {copyFromLabel ?? "Copy from template"}
          </button>
        )}
      </div>

      {blocks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-muted">
          No blocks yet. Add one to build this day.
        </div>
      ) : (
        <div className="space-y-2" role="list" aria-label="Blocks">
          {ordered.map((block) => (
            <BlockRow
              key={block.id}
              block={block}
              invalid={isBlockInvalid(block)}
              onChange={(patch) => patchBlock(block.id, patch)}
              onRemove={() => removeBlock(block.id)}
            />
          ))}
        </div>
      )}

      {anyInvalid && (
        <p className="text-xs text-danger">
          Some blocks have invalid times and won&apos;t be saved.
        </p>
      )}
    </div>
  );
}
