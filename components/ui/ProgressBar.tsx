// components/ui/ProgressBar.tsx
// Horizontal progress track. `value` is a 0–100 percentage.
import { cn } from "./cn";

export type ProgressTone = "accent" | "success" | "warning" | "danger";

const FILL: Record<ProgressTone, string> = {
  accent: "bg-gradient-to-r from-accent-hover to-accent-2",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

const SIZE = { sm: "h-1.5", md: "h-2.5", lg: "h-3.5" } as const;

export function ProgressBar({
  value,
  tone = "accent",
  size = "md",
  className,
  label,
}: {
  value: number;
  tone?: ProgressTone;
  size?: keyof typeof SIZE;
  className?: string;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn(
        "w-full overflow-hidden rounded-full bg-surface-2",
        SIZE[size],
        className,
      )}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-500 ease-out",
          FILL[tone],
        )}
        style={{ width: `${pct === 0 ? 0 : Math.max(pct, 4)}%` }}
      />
    </div>
  );
}

export default ProgressBar;
