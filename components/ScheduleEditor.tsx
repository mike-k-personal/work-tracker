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
// Restyled onto the blue-dark design system (.btn-* + tokens, EmptyState).

import type { Block } from "@/lib/types";
import { hhmmToMinutes } from "@/lib/format";
import BlockRow from "@/components/BlockRow";
import { EmptyState } from "@/components/ui/EmptyState";

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
  const validCount = blocks.filter((b) => !isBlockInvalid(b)).length;
  // Render in display order (sorted) without reordering the stored array, so
  // editing a time doesn't make a row jump while you're typing.
  const ordered = sortBlocks(blocks);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={addBlock}
          className="btn-primary h-10 px-3.5 text-sm"
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
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-surface-2 px-3.5 text-sm font-medium text-muted transition-colors hover:border-accent hover:text-accent-hover"
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
            >
              <path d="M3 6h13M3 12h9M3 18h5M18 8V4m0 0l-3 3m3-3l3 3" />
            </svg>
            Sort by start
          </button>
        )}

        {onCopyFrom && (
          <button
            type="button"
            onClick={onCopyFrom}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-surface-2 px-3.5 text-sm font-medium text-muted transition-colors hover:border-accent hover:text-accent-hover"
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
            >
              <rect x="9" y="9" width="11" height="11" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            {copyFromLabel ?? "Copy from template"}
          </button>
        )}

        {validCount > 0 && (
          <span className="ml-auto font-mono text-[0.6875rem] uppercase tracking-wider text-faint">
            {validCount} block{validCount === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {blocks.length === 0 ? (
        <EmptyState
          icon={
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
              <path d="M3 9h18M8 2.5v4M16 2.5v4" />
            </svg>
          }
          title="No blocks yet"
          description="Add a block to start building this day."
        />
      ) : (
        <div className="space-y-2" role="list" aria-label="Blocks">
          {ordered.map((block, i) => (
            <div
              key={block.id}
              className="animate-fade-up"
              style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
            >
              <BlockRow
                block={block}
                invalid={isBlockInvalid(block)}
                onChange={(patch) => patchBlock(block.id, patch)}
                onRemove={() => removeBlock(block.id)}
              />
            </div>
          ))}
        </div>
      )}

      {anyInvalid && (
        <p className="flex items-center gap-1.5 px-1 text-xs text-danger">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
          </svg>
          Some blocks have invalid times and won&apos;t be saved.
        </p>
      )}
    </div>
  );
}
