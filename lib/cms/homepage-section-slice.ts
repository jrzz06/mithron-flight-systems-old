import type { HomepageCmsContent } from "@/config/homepage-cms";
import type { HomepageCmsV2Content } from "@/config/homepage-cms-v2";
import {
  getHomepageSectionDefinition,
  missionKeyFromSectionId,
  shelfKeyFromSectionId,
  type HomepageSectionId
} from "@/config/homepage-section-registry";

/** Slice of V2 JSON owned by one homepage builder section. */
export function extractV2SectionSlice(
  content: HomepageCmsV2Content,
  sectionKey: string
): Record<string, unknown> {
  if (sectionKey === "mini-carousel") {
    return { enabled: content.miniCarousel.enabled, slides: content.miniCarousel.slides };
  }
  if (sectionKey.startsWith("banner-inter-shelf-")) {
    const index = Number(sectionKey.split("-").pop()) - 1;
    if (index >= 0 && index < 3) return { ...content.banners.interShelf[index] };
  }
  if (sectionKey.startsWith("banner-full-viewport-")) {
    const index = Number(sectionKey.split("-").pop()) - 1;
    if (index >= 0 && index < 2) return { ...content.banners.fullViewport[index] };
  }
  if (sectionKey === "testimonials" || sectionKey === "reviews") {
    return {
      reviews: { ...content.reviews },
      testimonialCards: content.testimonialCards
    };
  }
  if (sectionKey === "related-articles") {
    return {
      enabled: content.relatedArticles.enabled,
      sectionTitle: content.relatedArticles.sectionTitle,
      sectionLead: content.relatedArticles.sectionLead,
      browseAllHref: content.relatedArticles.browseAllHref,
      items: content.relatedArticles.items,
      selectedItems: content.relatedArticles.selectedItems
    };
  }
  return {};
}

/** Slice of V1 JSON owned by one homepage builder section. */
export function extractV1SectionSlice(
  content: HomepageCmsContent,
  sectionId: HomepageSectionId | string
): Record<string, unknown> {
  const shelfKey = shelfKeyFromSectionId(sectionId as HomepageSectionId);
  if (shelfKey) {
    return { ...content.shelves[shelfKey] };
  }
  const missionKey = missionKeyFromSectionId(sectionId as HomepageSectionId);
  if (missionKey) {
    return { ...content.missions[missionKey] };
  }
  if (sectionId === "testimonials") {
    return { ...content.testimonials };
  }
  return {};
}

/**
 * Combined published-vs-draft slice for outline / dashboard dirty detection.
 * Reviews combine V1 title fields + V2 cards/settings.
 */
export function extractHomepageSectionSlice(
  sectionId: HomepageSectionId | string,
  input: {
    homepageContent: HomepageCmsContent;
    homepageV2: HomepageCmsV2Content;
  }
): Record<string, unknown> {
  const definition = getHomepageSectionDefinition(sectionId);
  if (!definition || definition.editorKind === "hero-carousel" || definition.editorKind === "footer-view") {
    return {};
  }

  if (sectionId === "testimonials") {
    return {
      v1: extractV1SectionSlice(input.homepageContent, sectionId),
      v2: extractV2SectionSlice(input.homepageV2, sectionId)
    };
  }

  if (
    definition.editorKind === "product-shelf" ||
    definition.editorKind === "mission-world"
  ) {
    return extractV1SectionSlice(input.homepageContent, sectionId);
  }

  return extractV2SectionSlice(input.homepageV2, sectionId);
}

export function hasHomepageSectionDraftChanges(
  sectionId: HomepageSectionId | string,
  published: {
    homepageContent: HomepageCmsContent;
    homepageV2: HomepageCmsV2Content;
  },
  draft: {
    homepageContent: HomepageCmsContent;
    homepageV2: HomepageCmsV2Content;
  }
): boolean {
  const definition = getHomepageSectionDefinition(sectionId);
  if (!definition || definition.editorKind === "footer-view") return false;
  if (definition.editorKind === "hero-carousel") return false;

  return (
    JSON.stringify(extractHomepageSectionSlice(sectionId, published)) !==
    JSON.stringify(extractHomepageSectionSlice(sectionId, draft))
  );
}
