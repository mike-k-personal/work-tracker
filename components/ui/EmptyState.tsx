// components/ui/EmptyState.tsx
// Friendly placeholder for empty lists / zero-data states.
import type { ReactNode } from "react";
import { cn } from "./cn";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface/60 px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent-hover">
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-semibold text-text">{title}</p>
      {description ? (
        <p className="mt-1 max-w-xs text-sm text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export default EmptyState;
