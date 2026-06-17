// components/ui/Card.tsx
// Raised surface card. The base visual language for panels across the app.
import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export function Card({
  className,
  interactive,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn("card", interactive && "card-hover", className)}
      {...rest}
    />
  );
}

export default Card;
