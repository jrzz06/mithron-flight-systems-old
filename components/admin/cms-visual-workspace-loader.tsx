"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

const CmsVisualWorkspace = dynamic(
  () => import("@/features/admin/cms/cms-visual-workspace").then((module) => module.CmsVisualWorkspace),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface-muted)] px-4 py-10 text-sm text-[var(--platform-text-muted)]">
        Loading CMS editor…
      </div>
    )
  }
);

export function CmsVisualWorkspaceLoader(props: ComponentProps<typeof CmsVisualWorkspace>) {
  return <CmsVisualWorkspace {...props} />;
}
