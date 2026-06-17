"use client";

// components/ExtendControls.tsx
// Quick "+5 / +10 / custom" extension buttons shown when a session's remaining
// time reaches zero (or any time the user wants more time). Calls back with a
// positive number of MILLISECONDS to add; the parent forwards to extendSession.

import { useState } from "react";

export default function ExtendControls({
  onExtend,
  disabled = false,
  className = "",
}: {
  /** Called with a positive ms amount to add to the budget. */
  onExtend: (addMs: number) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [custom, setCustom] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  const addMinutes = (mins: number) => {
    if (!(mins > 0)) return;
    onExtend(Math.round(mins * 60_000));
  };

  const submitCustom = () => {
    const mins = parseInt(custom, 10);
    if (Number.isFinite(mins) && mins > 0) {
      addMinutes(mins);
      setCustom("");
      setShowCustom(false);
    }
  };

  const btn =
    "rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-sm font-semibold transition-colors hover:border-accent hover:text-accent disabled:opacity-40";

  return (
    <div className={`flex flex-wrap items-center justify-center gap-2 ${className}`}>
      <button
        type="button"
        className={btn}
        disabled={disabled}
        onClick={() => addMinutes(5)}
      >
        +5 min
      </button>
      <button
        type="button"
        className={btn}
        disabled={disabled}
        onClick={() => addMinutes(10)}
      >
        +10 min
      </button>

      {showCustom ? (
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            autoFocus
            value={custom}
            disabled={disabled}
            placeholder="min"
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitCustom();
              } else if (e.key === "Escape") {
                setShowCustom(false);
                setCustom("");
              }
            }}
            className="w-20 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-accent"
          />
          <button
            type="button"
            className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-hover disabled:opacity-40"
            disabled={disabled || !(parseInt(custom, 10) > 0)}
            onClick={submitCustom}
          >
            Add
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={btn}
          disabled={disabled}
          onClick={() => setShowCustom(true)}
        >
          Custom
        </button>
      )}
    </div>
  );
}
