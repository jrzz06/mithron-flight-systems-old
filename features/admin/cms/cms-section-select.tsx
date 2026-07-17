"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/platform/form-field";
import type { HomepageSectionId } from "@/config/homepage-section-registry";
import { getBuilderSectionLabel, homepageSectionRegistry } from "@/config/homepage-section-registry";
import type { CmsWorkspaceSection } from "@/features/admin/cms/cms-visual-workspace";

export function CmsSectionSelect({
  pageId,
  value,
  workspaceSections = [],
  onChange
}: {
  pageId: string;
  value: string;
  workspaceSections?: CmsWorkspaceSection[];
  onChange?: (sectionId: string) => void;
}) {
  const router = useRouter();

  const homepageOptions = homepageSectionRegistry.map((section) => ({
    id: section.id,
    label: getBuilderSectionLabel(section.id)
  }));

  const workspaceOptions = workspaceSections.map((section) => ({
    id: section.id,
    label: section.title
  }));

  const options = pageId === "homepage" ? homepageOptions : workspaceOptions;

  if (!options.length) return null;

  return (
    <label className="grid min-w-[200px] flex-1 gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--platform-text-muted)]">Section</span>
      <Select
        value={value || options[0]?.id}
        onChange={(event) => {
          const sectionId = event.currentTarget.value;
          onChange?.(sectionId);
          if (pageId === "homepage") {
            router.push(`/admin/cms/${sectionId}`);
            return;
          }
          router.push(`/admin/cms?page=${encodeURIComponent(pageId)}&section=${encodeURIComponent(sectionId)}`);
        }}
        data-cms-section-select
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </Select>
    </label>
  );
}

export type { HomepageSectionId };
