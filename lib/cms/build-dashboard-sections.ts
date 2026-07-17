import type { CmsDashboardSectionCard } from "@/features/admin/cms/cms-home-dashboard";
import { homepageSectionRegistry } from "@/config/homepage-section-registry";
import type { HomepageCmsContent } from "@/config/homepage-cms";
import type { HomepageCmsV2Content } from "@/config/homepage-cms-v2";
import type { Product } from "@/config/types";
import { pickHomeMiniCarouselItems } from "@/lib/home/mini-carousel";
import { resolveShelfSlotAssignments, CMS_SHELF_KEY_TO_ID } from "@/lib/cms/homepage-slot-assignment";
import { hasHomepageV1DraftChanges } from "@/services/homepage-cms";

type AdminRow = Record<string, unknown>;

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}
function formatDate(value: unknown) {
  const source = text(value);
  if (!source) return "";
  const parsed = new Date(source);
  if (Number.isNaN(parsed.getTime())) return source;
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

function heroImageSrc(row: AdminRow) {
  const image = row.image;
  if (image && typeof image === "object" && !Array.isArray(image)) {
    return text((image as Record<string, unknown>).src);
  }
  return "";
}

function hasV2DraftChanges(published: HomepageCmsV2Content, draft: HomepageCmsV2Content) {
  return JSON.stringify(published) !== JSON.stringify(draft);
}

function isV1Section(sectionId: string) {
  return (
    sectionId.startsWith("shelf-") ||
    sectionId.startsWith("mission-") ||
    sectionId === "testimonials"
  );
}

function isV2Section(sectionId: string) {
  return (
    sectionId === "mini-carousel" ||
    sectionId.startsWith("banner-") ||
    sectionId === "related-articles" ||
    sectionId === "testimonials"
  );
}

export function buildCmsDashboardSections(input: {
  homepageContent: HomepageCmsContent;
  homepageV2Published: HomepageCmsV2Content;
  homepageV2Draft: HomepageCmsV2Content;
  heroRows: AdminRow[];
  visibilityRows: AdminRow[];
  updatedAt?: string;
  settingsPayload?: unknown;
  catalogProducts?: Product[];
}): CmsDashboardSectionCard[] {
  const visibility = Object.fromEntries(
    input.visibilityRows.map((row) => [text(row.section_key), row.is_visible !== false])
  );

  const v2DraftPending = hasV2DraftChanges(input.homepageV2Published, input.homepageV2Draft);
  const v1DraftPending = hasHomepageV1DraftChanges(input.settingsPayload);

  const thumbnailFor = (sectionId: string) => {
    const preview = input.homepageV2Draft;
    const products = input.catalogProducts ?? [];
    if (sectionId === "hero") return heroImageSrc(input.heroRows[0] ?? {});
    if (sectionId === "mini-carousel") {
      const slideImage = preview.miniCarousel.slides[0]?.imageSrc;
      if (slideImage) return slideImage;
      return pickHomeMiniCarouselItems(products)[0]?.media.src ?? "";
    }
    if (sectionId === "shelf-drone-world") {
      const assignments = resolveShelfSlotAssignments(
        CMS_SHELF_KEY_TO_ID.droneWorld,
        input.homepageContent.shelves.droneWorld,
        products
      );
      return assignments[0]?.product?.imageSrc || input.homepageContent.shelves.droneWorld.heroImageSrc;
    }
    if (sectionId === "shelf-drone-care") {
      const assignments = resolveShelfSlotAssignments(
        CMS_SHELF_KEY_TO_ID.droneCare,
        input.homepageContent.shelves.droneCare,
        products
      );
      return assignments[0]?.product?.imageSrc || input.homepageContent.shelves.droneCare.heroImageSrc;
    }
    if (sectionId === "shelf-global-products") {
      const assignments = resolveShelfSlotAssignments(
        CMS_SHELF_KEY_TO_ID.globalProducts,
        input.homepageContent.shelves.globalProducts,
        products
      );
      return assignments[0]?.product?.imageSrc || input.homepageContent.shelves.globalProducts.heroImageSrc;
    }
    if (sectionId === "banner-inter-shelf-1") return text(preview.banners.interShelf[0]?.imageSrc);
    if (sectionId === "banner-inter-shelf-2") return text(preview.banners.interShelf[1]?.imageSrc);
    if (sectionId === "banner-inter-shelf-3") return text(preview.banners.interShelf[2]?.imageSrc);
    if (sectionId === "banner-full-viewport-1") {
      return text(preview.banners.fullViewport[0]?.desktopImageSrc) || text(preview.banners.fullViewport[0]?.mobileImageSrc);
    }
    if (sectionId === "banner-full-viewport-2") {
      return text(preview.banners.fullViewport[1]?.desktopImageSrc) || text(preview.banners.fullViewport[1]?.mobileImageSrc);
    }
    if (sectionId === "related-articles") return preview.relatedArticles.items.find((item) => item.imageSrc)?.imageSrc ?? "";
    return "";
  };

  const heroHasDraft = input.heroRows.some((row) => text(row.status).toLowerCase() === "draft");

  return homepageSectionRegistry.map((definition) => {
    const hasDraftChanges =
      definition.editorKind === "hero-carousel"
        ? heroHasDraft
        : (isV1Section(definition.id) && v1DraftPending) || (isV2Section(definition.id) && v2DraftPending);

    return {
      id: definition.id,
      label: definition.label,
      description: definition.description,
      thumbnailSrc: thumbnailFor(definition.id),
      status: hasDraftChanges ? "Draft" : "Live",
      updatedAt: formatDate(input.updatedAt),
      isVisible: visibility[definition.visibilityKey] ?? true,
      editable: definition.editable,
      duplicateEnabled: false,
      visibilityKey: definition.visibilityKey,
      hasDraftChanges
    };
  });
}
