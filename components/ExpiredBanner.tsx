"use client";

// components/ExpiredBanner.tsx
// Visual alert shown when a session's time is up. Purely presentational — the
// parent (ActiveSession) owns the one-shot chime/notify on expiry and renders
// this while the session is in the "over" state. It nudges the user to extend
// or end (those controls live alongside it in ActiveSession).

export default function ExpiredBanner({
  kind = "work",
  overMs,
  className = "",
}: {
  kind?: "work" | "break";
  /** How far past zero we are (ms), for an optional inline note. */
  overMs?: number;
  className?: string;
}) {
  const message =
    kind === "break"
      ? "Break's over — time to get back to it."
      : "Time's up. Extend if you need more, or wrap it up.";

  return (
    <div
      role="alert"
      className={`flex items-center gap-3 rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-danger ${className}`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-danger/20">
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path
            d="M12 7v5l3 2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <p className="text-sm font-medium leading-snug">{message}</p>
      {typeof overMs === "number" && overMs > 0 && (
        <span className="ml-auto shrink-0 text-xs font-semibold tabular-nums opacity-80">
          {Math.floor(overMs / 60_000)}m over
        </span>
      )}
    </div>
  );
}
