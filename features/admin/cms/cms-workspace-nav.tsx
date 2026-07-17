"use client";

import { buildCmsPageOptionsFromWorkspace, CmsPageSelect } from "@/features/admin/cms/cms-page-select";
import { CmsSectionSelect } from "@/features/admin/cms/cms-section-select";
import type { CmsWorkspacePage, CmsWorkspaceSection } from "@/features/admin/cms/cms-visual-workspace";

export function CmsWorkspaceNav({
  pageId,
  sectionId,
  workspacePages = [],
  workspaceSections = []
}: {
  pageId: string;
  sectionId?: string;
  workspacePages?: CmsWorkspacePage[];
  workspaceSections?: CmsWorkspaceSection[];
}) {
  const pageSections =
    pageId === "homepage"
      ? []
      : workspaceSections.filter((section) => {
          const page = workspacePages.find((entry) => entry.id === pageId);
          return page?.sectionIds.includes(section.id);
        });

  return (
    <div
      data-cms-workspace-nav
      className="flex flex-wrap items-end gap-3 rounded-[var(--platform-radius)] border border-[var(--platform-border)] bg-[var(--platform-surface)] p-4"
    >
      <CmsPageSelect value={pageId} pages={buildCmsPageOptionsFromWorkspace(workspacePages)} />
      <CmsSectionSelect pageId={pageId} value={sectionId ?? ""} workspaceSections={pageSections} />
    </div>
  );
}
