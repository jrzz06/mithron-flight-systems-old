"use client";

import dynamic from "next/dynamic";
import type { CmsDashboardSectionCard } from "@/features/admin/cms/cms-home-dashboard";

export const CmsHomeDashboard = dynamic(
  () => import("@/features/admin/cms/cms-home-dashboard").then((mod) => mod.CmsHomeDashboard),
  {
    loading: () => (
      <div
        data-cms-home-dashboard-loading
        className="rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface)] px-4 py-8 text-sm text-[var(--platform-text-muted)]"
      >
        Loading homepage sections…
      </div>
    )
  }
);

export type { CmsDashboardSectionCard };
