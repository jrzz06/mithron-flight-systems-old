"use client";

import dynamic from "next/dynamic";
import type { CmsDashboardSectionCard } from "@/features/admin/cms/cms-home-dashboard";

export const CmsHomeDashboard = dynamic(
  () => import("@/features/admin/cms/cms-home-dashboard").then((mod) => mod.CmsHomeDashboard),
  { ssr: false, loading: () => null }
);

export type { CmsDashboardSectionCard };
