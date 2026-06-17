// components/ui/PageHeader.tsx
// Consistent page title block: optional eyebrow, title, subtitle, and a
// right-aligned action slot. Use at the top of every top-level page.
import type { ReactNode } from "react";
import { cn } from "./cn";

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "mb-6 flex flex-wrap items-start justify-between gap-3",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow mb-1.5">{eyebrow}</p> : null}
        <h1 className="font-display text-[1.7rem] font-semibold leading-tight tracking-tight text-text">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1.5 text-sm text-muted">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export default PageHeader;
