"use client";

import dynamic from "next/dynamic";

export const CmsSectionEditor = dynamic(
  () => import("@/features/admin/cms/cms-section-editor").then((mod) => mod.CmsSectionEditor),
  { ssr: false, loading: () => <div className="rounded-2xl border border-[var(--cms-border)] bg-[var(--cms-surface-raised)] p-8 text-sm text-[var(--cms-text-muted)]">Loading editor…</div> }
);
