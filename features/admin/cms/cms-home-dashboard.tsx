export type CmsDashboardSectionCard = {
  id: import("@/config/homepage-section-registry").HomepageSectionId;
  label: string;
  description: string;
  thumbnailSrc: string;
  status: string;
  updatedAt: string;
  isVisible: boolean;
  editable: boolean;
  duplicateEnabled: boolean;
  visibilityKey: string;
  hasDraftChanges: boolean;
};

export { CmsHomeDashboardClient as CmsHomeDashboard } from "@/features/admin/cms/cms-home-dashboard-client";
