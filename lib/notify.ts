// lib/notify.ts
// Client-side notification helpers. Never throw; always degrade gracefully on
// unsupported / denied / SSR. Prefer the service-worker registration (works
// when the PWA is installed / backgrounded) and fall back to `new Notification`.

"use client";

/** Whether the Notification API exists in this environment. */
export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/** Current permission, or "unsupported". */
export function notificationPermission():
  | NotificationPermission
  | "unsupported" {
  if (!notificationsSupported()) return "unsupported";
  return Notification.permission;
}

/**
 * Request permission on demand (call from a user gesture). Resolves to the
 * resulting permission, or "denied" when unsupported. Never throws.
 */
export async function ensureNotificationPermission(): Promise<
  NotificationPermission | "denied"
> {
  if (!notificationsSupported()) return "denied";
  try {
    if (Notification.permission === "granted") return "granted";
    if (Notification.permission === "denied") return "denied";
    const result = await Notification.requestPermission();
    return result;
  } catch {
    return "denied";
  }
}

export type NotifyOptions = {
  tag?: string;
  /** Whether re-showing a same-tag notification should renotify. */
  renotify?: boolean;
  /** Optional small body icon path. */
  icon?: string;
  /** When true, the notification stays until interacted with. */
  requireInteraction?: boolean;
};

/**
 * Show a notification. Uses the SW registration if available (more reliable on
 * mobile / when backgrounded), else falls back to `new Notification`.
 * No-op (resolves false) when unsupported or not granted. Never throws.
 */
export async function notify(
  title: string,
  body?: string,
  tagOrOptions?: string | NotifyOptions,
): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if (Notification.permission !== "granted") return false;

  const opts: NotifyOptions =
    typeof tagOrOptions === "string"
      ? { tag: tagOrOptions }
      : (tagOrOptions ?? {});

  const notificationOptions: NotificationOptions & { renotify?: boolean } = {
    body,
    tag: opts.tag,
    icon: opts.icon ?? "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    renotify: opts.renotify,
    requireInteraction: opts.requireInteraction,
  };

  // Prefer the service worker registration when available.
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(title, notificationOptions);
        return true;
      }
    }
  } catch {
    // Fall through to the constructor path.
  }

  try {
    const n = new Notification(title, notificationOptions);
    void n;
    return true;
  } catch {
    return false;
  }
}
