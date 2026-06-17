"use client";

// components/SWRegister.tsx
// Registers the hand-rolled service worker on mount. No auto notification
// prompt — Notification permission is requested later on a user gesture
// (Start / settings toggle), per the plan.

import { useEffect } from "react";

export default function SWRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    // Register after the window has loaded to avoid contending with the
    // initial render / first paint.
    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => {
          // Registration failures are non-fatal (e.g. unsupported / insecure
          // context). The app works without the SW; just no offline shell.
        });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
