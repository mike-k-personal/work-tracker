// lib/format.ts
// Pure formatting helpers. Day keys use the LOCAL timezone consistently so that
// history grouping and metrics agree across the app.

/** Floor an ms value to whole seconds (avoids 0.999s display artifacts). */
function totalSeconds(ms: number): number {
  return Math.max(0, Math.floor(ms / 1000));
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Format ms as a clock string:
 *   < 1 hour  => "mm:ss"
 *   >= 1 hour => "h:mm:ss"
 * Negative values are clamped to 0 (the "over" sign is the caller's concern).
 */
export function msToClock(ms: number): string {
  const secs = totalSeconds(ms);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${pad2(m)}:${pad2(s)}`;
  return `${pad2(m)}:${pad2(s)}`;
}

/**
 * Human-friendly duration: "1h 23m", "45m", "12s", "2h".
 * Shows seconds only when under a minute.
 */
export function msToHuman(ms: number): string {
  const secs = totalSeconds(ms);
  if (secs < 60) return `${secs}s`;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (parts.length === 0) return "0m";
  return parts.join(" ");
}

/** Local "YYYY-MM-DD" day key for an epoch-ms timestamp. */
export function dayKey(epoch: number): string {
  const d = new Date(epoch);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Friendly local date+time, e.g. "Mon, Jun 16, 3:45 PM". */
export function prettyDate(epoch: number): string {
  const d = new Date(epoch);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Friendly local date only, e.g. "Mon, Jun 16". */
export function prettyDay(epoch: number): string {
  const d = new Date(epoch);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** Friendly local time only, e.g. "3:45 PM". */
export function prettyTime(epoch: number): string {
  const d = new Date(epoch);
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Parse a block time "HH:MM" into minutes since local midnight.
 * Returns NaN-safe 0 on malformed input.
 */
export function hhmmToMinutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return 0;
  const hours = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const mins = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return hours * 60 + mins;
}

/** Format minutes-since-midnight back to a zero-padded "HH:MM". */
export function minutesToHhmm(minutes: number): string {
  const clamped = Math.min(24 * 60 - 1, Math.max(0, Math.floor(minutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

/** Format a "HH:MM" block time as a friendly local clock, e.g. "3:45 PM". */
export function prettyHhmm(hhmm: string): string {
  const mins = hhmmToMinutes(hhmm);
  const d = new Date();
  d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}
