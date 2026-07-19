import type { HomepageCmsContent } from "@/config/homepage-cms";
import type { HomepageCmsV2Content } from "@/config/homepage-cms-v2";
import {
  fullViewportBannerIndex,
  getHomepageSectionDefinition,
  homepageSectionRegistry,
  interShelfBannerIndex,
  missionKeyFromSectionId,
  shelfKeyFromSectionId,
  type HomepageSectionId
} from "@/config/homepage-section-registry";
import { hasHomepageSectionDraftChanges } from "@/lib/cms/homepage-section-slice";
import { validateSectionForPublish } from "@/lib/cms/section-validation";

type AdminRow = Record<string, unknown>;

export type CmsSectionDisplayStatus = "Draft" | "Live" | "Empty";

export type HomepageOutlineSectionStatus = {
  dirty: boolean;
  published: boolean;
  contentReady: boolean;
  updatedAt?: string | null;
};

/**
 * Optional banner slots stay hidden until they have saved content.
 * Related Articles + Customer Testimonials always appear so editors can add the first cards.
 */
const HIDE_UNTIL_CONTENT_KINDS = new Set(["inter-shelf-banner", "full-viewport-banner"]);

export function shouldShowInHomepageOutline(
  sectionId: HomepageSectionId,
  status?: { contentReady?: boolean } | null
): boolean {
  const definition = getHomepageSectionDefinition(sectionId);
  if (!definition) return false;
  if (definition.editorKind === "footer-view") return false;
  if (HIDE_UNTIL_CONTENT_KINDS.has(definition.editorKind)) {
    return status?.contentReady === true;
  }
  return true;
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function heroImageSrc(row: AdminRow) {
  const image = row.image;
  if (image && typeof image === "object" && !Array.isArray(image)) {
    return text((image as Record<string, unknown>).src);
  }
  return "";
}

/** True when the section has the minimum content required to publish / show on storefront. */
export function isHomepageSectionContentReady(
  sectionId: HomepageSectionId,
  input: {
    homepageContent: HomepageCmsContent;
    homepageV2: HomepageCmsV2Content;
    heroRows?: AdminRow[];
  }
): boolean {
  const definition = getHomepageSectionDefinition(sectionId);
  if (!definition) return true;

  switch (definition.editorKind) {
    case "inter-shelf-banner": {
      const index = interShelfBannerIndex(sectionId);
      if (index === null) return false;
      const banner = input.homepageV2.banners.interShelf[index];
      return validateSectionForPublish("inter-shelf-banner", {
        heading: banner?.heading ?? "",
        imageSrc: banner?.imageSrc ?? "",
        ctaLabel: banner?.ctaLabel ?? "",
        href: banner?.href ?? ""
      }).valid;
    }
    case "full-viewport-banner": {
      const index = fullViewportBannerIndex(sectionId);
      if (index === null) return false;
      const banner = input.homepageV2.banners.fullViewport[index];
      return validateSectionForPublish("full-viewport-banner", {
        heading: banner?.heading ?? "",
        imageSrc: banner?.desktopImageSrc ?? "",
        desktopImageSrc: banner?.desktopImageSrc ?? "",
        ctaLabel: banner?.ctaLabel ?? "",
        href: banner?.href ?? ""
      }).valid;
    }
    case "mini-carousel":
      return validateSectionForPublish("mini-carousel", input.homepageV2.miniCarousel).valid;
    case "product-shelf": {
      const shelfKey = shelfKeyFromSectionId(sectionId);
      if (!shelfKey) return false;
      const shelf = input.homepageContent.shelves[shelfKey];
      return Boolean(text(shelf?.title));
    }
    case "hero-carousel": {
      const rows = input.heroRows ?? [];
      return rows.some((row) => {
        const status = text(row.status, "draft").toLowerCase();
        if (status === "draft" || status === "archived") return false;
        return Boolean(heroImageSrc(row) && text(row.title));
      });
    }
    case "related-articles":
      return validateSectionForPublish("related-articles", {
        items: input.homepageV2.relatedArticles.items
      }).valid;
    case "reviews-section":
      return validateSectionForPublish("reviews-section", {
        title: input.homepageContent.testimonials.title,
        cards: input.homepageV2.testimonialCards
      }).valid;
    case "mission-world": {
      const missionKey = missionKeyFromSectionId(sectionId);
      if (!missionKey) return false;
      return Boolean(text(input.homepageContent.missions[missionKey]?.title));
    }
    case "footer-view":
      return true;
    default:
      return true;
  }
}

export function resolveCmsSectionDisplayStatus(opts: {
  hasDraftChanges: boolean;
  contentReady: boolean;
}): CmsSectionDisplayStatus {
  if (opts.hasDraftChanges) return "Draft";
  if (!opts.contentReady) return "Empty";
  return "Live";
}

export function normalizeCmsSectionStatus(status: string): CmsSectionDisplayStatus | null {
  const normalized = status.trim().toLowerCase();
  if (normalized === "draft") return "Draft";
  if (normalized === "live" || normalized === "published") return "Live";
  if (normalized === "empty") return "Empty";
  return null;
}

export function buildHomepageOutlineStatuses(input: {
  homepageContent: HomepageCmsContent;
  homepageV2Published: HomepageCmsV2Content;
  homepageV2Draft: HomepageCmsV2Content;
  homepageContentDraft?: HomepageCmsContent;
  heroRows?: AdminRow[];
  settingsPayload?: unknown;
  updatedAt?: string | null;
}): Partial<Record<HomepageSectionId, HomepageOutlineSectionStatus>> {
  const publishedBundle = {
    homepageContent: input.homepageContent,
    homepageV2: input.homepageV2Published
  };
  const draftBundle = {
    homepageContent: input.homepageContentDraft ?? input.homepageContent,
    homepageV2: input.homepageV2Draft
  };
  const heroHasDraft = (input.heroRows ?? []).some(
    (row) => text(row.status).toLowerCase() === "draft"
  );

  return Object.fromEntries(
    homepageSectionRegistry.map((definition) => {
      const hasDraftChanges =
        definition.editorKind === "hero-carousel"
          ? heroHasDraft
          : hasHomepageSectionDraftChanges(definition.id, publishedBundle, draftBundle);

      // Outline visibility uses saved (draft overlay) so a freshly Saved section appears before Publish.
      const contentReady = isHomepageSectionContentReady(definition.id, {
        homepageContent: draftBundle.homepageContent,
        homepageV2: draftBundle.homepageV2,
        heroRows: input.heroRows
      });

      const display = resolveCmsSectionDisplayStatus({
        hasDraftChanges,
        contentReady
      });

      return [
        definition.id,
        {
          dirty: hasDraftChanges,
          published: display === "Live",
          contentReady,
          updatedAt: input.updatedAt ?? null
        } satisfies HomepageOutlineSectionStatus
      ];
    })
  ) as Partial<Record<HomepageSectionId, HomepageOutlineSectionStatus>>;
}
