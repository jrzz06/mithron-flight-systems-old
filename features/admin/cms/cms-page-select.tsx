"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/platform/form-field";
import { CMS_WORKSPACE_PAGES } from "@/config/cms-workspace";
import type { CmsWorkspacePage } from "@/features/admin/cms/cms-visual-workspace";

export type CmsPageOption = {
  id: string;
  label: string;
  description?: string;
};

const DEFAULT_PAGES: CmsPageOption[] = [
  { id: "homepage", label: "Homepage Builder", description: "Edit homepage sections" },
  ...CMS_WORKSPACE_PAGES.filter((page) => page.id !== "homepage").map((page) => ({
    id: page.id,
    label: page.label,
    description: page.description
  }))
];

export function CmsPageSelect({
  value,
  pages = DEFAULT_PAGES,
  onChange
}: {
  value: string;
  pages?: CmsPageOption[];
  onChange?: (pageId: string) => void;
}) {
  const router = useRouter();

  return (
    <label className="grid min-w-[200px] flex-1 gap-1.5">
      <span className="type-meta font-medium uppercase tracking-[0.06em] text-[var(--platform-text-muted)]">Area</span>
      <Select
        value={value}
        onChange={(event) => {
          const pageId = event.currentTarget.value;
          onChange?.(pageId);
          if (pageId === "homepage") {
            router.push("/admin/cms");
            return;
          }
          router.push(`/admin/cms?page=${encodeURIComponent(pageId)}`);
        }}
        data-cms-page-select
      >
        {pages.map((page) => (
          <option key={page.id} value={page.id}>
            {page.label}
          </option>
        ))}
      </Select>
    </label>
  );
}

export function buildCmsPageOptionsFromWorkspace(pages: CmsWorkspacePage[]): CmsPageOption[] {
  return [
    { id: "homepage", label: "Homepage Builder", description: "Edit homepage sections" },
    ...pages
      .filter((page) => page.id !== "homepage")
      .map((page) => ({ id: page.id, label: page.label, description: page.description }))
  ];
}
