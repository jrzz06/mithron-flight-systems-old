"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import { SoftErrorBoundary } from "@/components/soft-error-boundary";

const CmsSectionEditorInner = dynamic(
  () => import("@/features/admin/cms/cms-section-editor").then((mod) => mod.CmsSectionEditor),
  {
    loading: () => (
      <div className="rounded-2xl border border-[var(--cms-border)] bg-[var(--cms-surface-raised)] p-8 text-sm text-[var(--cms-text-muted)]">
        Loading editor…
      </div>
    )
  }
);

export function CmsSectionEditor(props: ComponentProps<typeof CmsSectionEditorInner>) {
  return (
    <SoftErrorBoundary label="CMS editor" variant="retry">
      <CmsSectionEditorInner {...props} />
    </SoftErrorBoundary>
  );
}
