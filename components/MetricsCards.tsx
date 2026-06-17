"use client";

// components/MetricsCards.tsx
// PRESENTATIONAL responsive grid of stat cards. Each card shows an eyebrow
// label, a big MONO readout value, and an optional sub-line. No data fetching —
// the /metrics page computes values (via lib/metrics) and passes them in as a
// flat list. Styled to the "precision instrument" design system: every card is
// an instrument readout, with the wide "Productive hours" card promoted to a
// glowing hero panel. Cards stagger in with animate-fade-up.

import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

export type MetricCard = {
  /** Stable key (used as React key). */
  id: string;
  /** Small uppercase label above the value. */
  label: string;
  /** The primary value (already formatted). */
  value: ReactNode;
  /** Optional secondary line under the value. */
  sub?: ReactNode;
  /** Tints the value text for emphasis. */
  tone?: "default" | "accent" | "success" | "warning" | "danger";
  /** Lets a card span two columns on wider grids (e.g. a highlight stat). */
  wide?: boolean;
};

const TONE_CLASS: Record<NonNullable<MetricCard["tone"]>, string> = {
  default: "text-text",
  accent: "text-accent",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

export default function MetricsCards({
  cards,
  className = "",
}: {
  cards: MetricCard[];
  className?: string;
}) {
  if (cards.length === 0) return null;

  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4",
        className,
      )}
    >
      {cards.map((c, i) => {
        const hero = !!c.wide;
        return (
          <div
            key={c.id}
            className={cn(
              "card card-hover animate-fade-up group relative flex flex-col justify-between overflow-hidden",
              hero
                ? "col-span-2 px-5 py-5 sm:px-6 sm:py-6"
                : "px-4 py-3.5 sm:px-4 sm:py-4",
            )}
            style={{ animationDelay: `${i * 55}ms` }}
          >
            {hero && (
              <>
                {/* Hero glow: a soft accent bloom in the corner + an outer halo. */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-accent/20 blur-3xl"
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-gradient-to-br from-accent-soft/70 via-transparent to-transparent"
                />
                {/* Accent edge rule along the top of the hero card. */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent"
                />
              </>
            )}

            <div className="relative flex items-center justify-between gap-2">
              <span className="eyebrow truncate">{c.label}</span>
              {/* Tiny instrument tick that brightens on hover. */}
              <span
                aria-hidden="true"
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full transition-colors",
                  hero
                    ? "bg-accent shadow-[0_0_8px_var(--glow)]"
                    : "bg-faint/60 group-hover:bg-accent/70",
                )}
              />
            </div>

            <div className="relative mt-2">
              <span
                className={cn(
                  "readout block font-semibold leading-none",
                  hero
                    ? "text-[2.6rem] sm:text-[3.25rem]"
                    : "text-[1.65rem] sm:text-[1.8rem]",
                  TONE_CLASS[c.tone ?? "default"],
                  hero &&
                    c.tone === "accent" &&
                    "[text-shadow:0_0_24px_var(--glow)]",
                )}
              >
                {c.value}
              </span>
              {c.sub !== undefined && c.sub !== null && (
                <span
                  className={cn(
                    "mt-1.5 block font-mono tabular-nums text-muted",
                    hero ? "text-xs sm:text-[0.8125rem]" : "text-[0.6875rem]",
                  )}
                >
                  {c.sub}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
