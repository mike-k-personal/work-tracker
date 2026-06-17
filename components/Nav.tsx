"use client";

// components/Nav.tsx
// Responsive primary navigation.
//   - >= 768px (md): fixed LEFT sidebar.
//   - <  768px:      fixed BOTTOM tab bar (thumb-reachable, safe-area aware).
// Active route is highlighted. Icons are simple inline SVGs (no icon lib).
// Schedule is intentionally NOT here — it lives under Settings now.

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type Item = {
  href: string;
  label: string;
  icon: ReactNode;
};

const iconProps = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const ITEMS: Item[] = [
  {
    href: "/",
    label: "Focus",
    icon: (
      <svg {...iconProps} aria-hidden="true">
        <circle cx="12" cy="13" r="8" />
        <path d="M12 13V9.5" />
        <path d="M9 2h6" />
        <path d="M12 2v2.5" />
      </svg>
    ),
  },
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg {...iconProps} aria-hidden="true">
        <rect x="3" y="3" width="7" height="9" rx="1.6" />
        <rect x="14" y="3" width="7" height="5" rx="1.6" />
        <rect x="14" y="12" width="7" height="9" rx="1.6" />
        <rect x="3" y="16" width="7" height="5" rx="1.6" />
      </svg>
    ),
  },
  {
    href: "/metrics",
    label: "Metrics",
    icon: (
      <svg {...iconProps} aria-hidden="true">
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </svg>
    ),
  },
  {
    href: "/history",
    label: "History",
    icon: (
      <svg {...iconProps} aria-hidden="true">
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
        <path d="M3 4v4h4" />
        <path d="M12 8v4l3 2" />
      </svg>
    ),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: (
      <svg {...iconProps} aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
      </svg>
    ),
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Wordmark() {
  return (
    <div className="mb-8 flex items-center gap-2.5 px-2">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-accent-hover to-accent-2 font-display text-base font-bold text-[#051018] shadow-[0_6px_18px_-6px_var(--glow)]">
        W
      </span>
      <span className="flex flex-col leading-none">
        <span className="font-display text-sm font-semibold tracking-tight">
          Work Tracker
        </span>
        <span className="mt-1 font-mono text-[9px] uppercase tracking-[0.22em] text-faint">
          plan · focus · review
        </span>
      </span>
    </div>
  );
}

export default function Nav() {
  const pathname = usePathname() ?? "/";

  return (
    <>
      {/* Desktop / tablet: left sidebar */}
      <nav
        aria-label="Primary"
        className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border bg-surface/70 px-3 py-5 backdrop-blur-xl md:flex"
      >
        <Wordmark />
        <ul className="flex flex-1 flex-col gap-1">
          {ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-accent-soft text-text"
                      : "text-muted hover:bg-surface-2 hover:text-text"
                  }`}
                >
                  {active ? (
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-accent shadow-[0_0_12px_var(--glow)]"
                    />
                  ) : null}
                  <span
                    className={
                      active
                        ? "text-accent-hover"
                        : "text-faint group-hover:text-muted"
                    }
                    aria-hidden="true"
                  >
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Mobile: bottom tab bar */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-surface/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
      >
        {ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`relative flex flex-1 flex-col items-center gap-1 py-2 font-mono text-[9px] uppercase tracking-wider transition-colors ${
                active ? "text-accent-hover" : "text-faint"
              }`}
            >
              {active ? (
                <span
                  aria-hidden="true"
                  className="absolute top-0 h-0.5 w-8 rounded-full bg-accent shadow-[0_0_10px_var(--glow)]"
                />
              ) : null}
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
