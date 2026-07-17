"use client";

import dynamic from "next/dynamic";
import type { CmsWorkspacePage, CmsWorkspaceSection } from "@/features/admin/cms/cms-visual-workspace";

export const CmsWorkspaceNav = dynamic(
  () => import("@/features/admin/cms/cms-workspace-nav").then((mod) => mod.CmsWorkspaceNav),
  { ssr: false, loading: () => null }
);

export type { CmsWorkspacePage, CmsWorkspaceSection };
