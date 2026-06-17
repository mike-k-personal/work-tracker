"use client";

// app/projects/page.tsx
// There is no standalone projects index — projects live on the Dashboard and
// each opens at /projects/[id]. This route just redirects to /dashboard so any
// stale link or bookmark lands somewhere sensible.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ProjectsIndexPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);

  return (
    <div
      className="mx-auto flex w-full max-w-3xl flex-col items-center justify-center gap-3 px-4 py-24"
      role="status"
      aria-label="Redirecting to Dashboard"
    >
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent" />
      <p className="eyebrow animate-pulse-glow">Redirecting</p>
    </div>
  );
}
