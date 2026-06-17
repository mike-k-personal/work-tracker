// components/ui/Badge.tsx
// Small pill label with tonal variants. Used for schedule status, counts, tags.
import type { ReactNode } from "react";
import { cn } from "./cn";

export type BadgeTone =
  | "default"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "muted";

const TONES: Record<BadgeTone, string> = {
  default: "border-border bg-surface-2 text-text",
  accent: "border-accent/30 bg-accent-soft text-accent-hover",
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-danger/30 bg-danger/10 text-danger",
  muted: "border-border bg-surface-2 text-muted",
};

export function Badge({
  tone = "default",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[0.6875rem] font-medium uppercase tracking-wider",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export default Badge;
