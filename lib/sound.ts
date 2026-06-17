// lib/sound.ts
// Web Audio chime — no external assets. Singleton AudioContext created lazily
// and unlocked/resumed from a user gesture (browsers require this). All entry
// points are safe to call repeatedly and never throw on unsupported/SSR.

"use client";

type AudioCtxCtor = typeof AudioContext;

function getCtor(): AudioCtxCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    AudioContext?: AudioCtxCtor;
    webkitAudioContext?: AudioCtxCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

let ctx: AudioContext | null = null;

/** Whether Web Audio is available. */
export function soundSupported(): boolean {
  return getCtor() !== null;
}

/** Lazily create (once) and return the shared AudioContext, or null. */
export function getAudioContext(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = getCtor();
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

/**
 * Unlock audio from a user gesture (e.g. the Start click). Creates the context
 * if needed and resumes it. Safe to call multiple times. Resolves true on
 * success.
 */
export async function unlock(): Promise<boolean> {
  const c = getAudioContext();
  if (!c) return false;
  try {
    if (c.state === "suspended") await c.resume();
    return c.state === "running";
  } catch {
    return false;
  }
}

/** Alias for unlock(); resume the context if it was suspended. */
export async function resume(): Promise<boolean> {
  return unlock();
}

/**
 * Play a short, pleasant ascending chime (three notes). No-op when unsupported.
 * Never throws. Best called after `unlock()` has run from a gesture.
 */
export function playChime(): void {
  const c = getAudioContext();
  if (!c) return;
  try {
    if (c.state === "suspended") {
      // Fire and forget; the chime will still schedule against the timeline.
      void c.resume();
    }
    const now = c.currentTime;

    // A gentle major-triad arpeggio: A5, C#6, E6.
    const notes = [880.0, 1108.73, 1318.51];
    const noteDur = 0.16; // seconds per note
    const gap = 0.12; // start-to-start spacing

    // Shared master gain to keep overall volume tame.
    const master = c.createGain();
    master.gain.value = 0.0001;
    master.connect(c.destination);

    notes.forEach((freq, i) => {
      const t0 = now + i * gap;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t0);

      // Soft attack/decay envelope to avoid clicks.
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.22, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + noteDur);

      osc.connect(gain);
      gain.connect(master);
      osc.start(t0);
      osc.stop(t0 + noteDur + 0.02);
    });

    // Bring master up immediately (per-note gains do the real shaping).
    master.gain.setValueAtTime(1, now);
  } catch {
    // ignore
  }
}
