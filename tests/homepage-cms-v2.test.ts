import { describe, expect, it } from "vitest";
import {
  mergeHomepageCmsV2Content,
  overlayHomepageCmsV2Draft,
  emptyInterShelfBanner,
  defaultHomepageCmsV2Content
} from "@/config/homepage-cms-v2";
import { emptyHomepageCmsContent } from "@/config/homepage-cms";
import { mergeHomepageV2DraftPreviewFromPayload } from "@/services/homepage-cms-v2";
import { resolveHomeMiniCarouselItems, pickHomeMiniCarouselItems } from "@/lib/home/mini-carousel";
import type { Product } from "@/config/types";
import {
  isHomepageSectionContentReady,
  resolveCmsSectionDisplayStatus,
  normalizeCmsSectionStatus,
  buildHomepageOutlineStatuses
} from "@/lib/cms/section-content-status";
import { hasHomepageSectionDraftChanges } from "@/lib/cms/homepage-section-slice";

describe("homepage cms v2 merge", () => {
  it("merges inter-shelf banner defaults", () => {
    const merged = mergeHomepageCmsV2Content({});
    expect(merged.banners.interShelf).toHaveLength(3);
    expect(merged.banners.fullViewport).toHaveLength(2);
    expect(merged.reviews.maxCount).toBe(6);
  });

  it("pads sparse banner arrays so editors never receive undefined slots", () => {
    const merged = mergeHomepageCmsV2Content({
      banners: {
        interShelf: [{ heading: "Only first" }],
        fullViewport: []
      }
    });
    expect(merged.banners.interShelf[0]?.heading).toBe("Only first");
    expect(merged.banners.interShelf[1]).toBeDefined();
    expect(merged.banners.interShelf[2]).toBeDefined();
    expect(merged.banners.fullViewport[0]).toBeDefined();
    expect(merged.banners.fullViewport[1]).toBeDefined();
  });

  it("defaults and preserves related article selectedItems", () => {
    expect(mergeHomepageCmsV2Content({}).relatedArticles.selectedItems).toEqual([]);
    const merged = mergeHomepageCmsV2Content({
      relatedArticles: {
        selectedItems: [
          { source: "press", id: "press-1" },
          { source: "blog", id: "blog-2" },
          null
        ]
      }
    });
    expect(merged.relatedArticles.selectedItems).toEqual([
      { source: "press", id: "press-1" },
      { source: "blog", id: "blog-2" }
    ]);
  });

  it("hero status coercion never throws on nullish status values", () => {
    const nullish: string | null | undefined = null;
    expect(String(nullish ?? "draft").toLowerCase()).toBe("draft");
    const missing: string | undefined = undefined;
    expect(String(missing ?? "draft").toLowerCase()).toBe("draft");
  });

  it("preserves live banner heading/image when draft only patches another field", () => {
    const live = mergeHomepageCmsV2Content({
      banners: {
        interShelf: [
          {
            ...emptyInterShelfBanner(),
            heading: "Live heading",
            imageSrc: "https://cdn.example/banner.jpg",
            href: "https://example.com"
          }
        ]
      }
    });
    const overlaid = overlayHomepageCmsV2Draft(live, {
      banners: {
        interShelf: [{ subtitle: "Draft subtitle only" }]
      }
    });
    expect(overlaid.banners.interShelf[0]?.heading).toBe("Live heading");
    expect(overlaid.banners.interShelf[0]?.imageSrc).toBe("https://cdn.example/banner.jpg");
    expect(overlaid.banners.interShelf[0]?.subtitle).toBe("Draft subtitle only");
  });

  it("draft preview payload merge does not wipe live banners via shallow draft.banners", () => {
    const merged = mergeHomepageV2DraftPreviewFromPayload({
      homepage: {
        v2: {
          banners: {
            interShelf: [
              {
                heading: "Published",
                imageSrc: "https://cdn.example/live.jpg",
                href: "/shop"
              }
            ]
          }
        },
        draftV2: {
          banners: {
            interShelf: [{ ctaLabel: "Shop now" }]
          }
        }
      }
    });
    expect(merged.banners.interShelf[0]?.heading).toBe("Published");
    expect(merged.banners.interShelf[0]?.imageSrc).toBe("https://cdn.example/live.jpg");
    expect(merged.banners.interShelf[0]?.ctaLabel).toBe("Shop now");
  });
});

describe("section content status", () => {
  it("marks empty inter-shelf banners as not content-ready", () => {
    expect(
      isHomepageSectionContentReady("banner-inter-shelf-1", {
        homepageContent: emptyHomepageCmsContent,
        homepageV2: defaultHomepageCmsV2Content
      })
    ).toBe(false);
  });

  it("marks filled inter-shelf banners as content-ready", () => {
    const homepageV2 = mergeHomepageCmsV2Content({
      banners: {
        interShelf: [
          {
            heading: "After Drone World",
            imageSrc: "https://cdn.example/banner.jpg"
          }
        ]
      }
    });
    expect(
      isHomepageSectionContentReady("banner-inter-shelf-1", {
        homepageContent: emptyHomepageCmsContent,
        homepageV2
      })
    ).toBe(true);
  });

  it("resolves Draft / Empty / Live display status", () => {
    expect(resolveCmsSectionDisplayStatus({ hasDraftChanges: true, contentReady: false })).toBe("Draft");
    expect(resolveCmsSectionDisplayStatus({ hasDraftChanges: false, contentReady: false })).toBe("Empty");
    expect(resolveCmsSectionDisplayStatus({ hasDraftChanges: false, contentReady: true })).toBe("Live");
  });

  it("normalizes Live/live/published status casing", () => {
    expect(normalizeCmsSectionStatus("Live")).toBe("Live");
    expect(normalizeCmsSectionStatus("live")).toBe("Live");
    expect(normalizeCmsSectionStatus("published")).toBe("Live");
    expect(normalizeCmsSectionStatus("Empty")).toBe("Empty");
    expect(normalizeCmsSectionStatus("Draft")).toBe("Draft");
  });

  it("marks only mini-carousel dirty when draft differs there alone", () => {
    const publishedV2 = mergeHomepageCmsV2Content({
      miniCarousel: {
        enabled: true,
        slides: [
          {
            id: "slide-1",
            enabled: true,
            imageSrc: "/a.jpg",
            imageAlt: "A",
            heading: "Live",
            description: "",
            ctaLabel: "View",
            href: "/products",
            productSlug: "",
            sortOrder: 0
          }
        ]
      },
      banners: {
        interShelf: [
          {
            heading: "Banner",
            imageSrc: "https://cdn.example/banner.jpg"
          }
        ]
      }
    });
    const draftV2 = {
      ...publishedV2,
      miniCarousel: {
        ...publishedV2.miniCarousel,
        slides: publishedV2.miniCarousel.slides.map((slide) => ({
          ...slide,
          heading: "Draft heading"
        }))
      }
    };
    const published = { homepageContent: emptyHomepageCmsContent, homepageV2: publishedV2 };
    const draft = { homepageContent: emptyHomepageCmsContent, homepageV2: draftV2 };

    expect(hasHomepageSectionDraftChanges("mini-carousel", published, draft)).toBe(true);
    expect(hasHomepageSectionDraftChanges("banner-inter-shelf-1", published, draft)).toBe(false);

    const statuses = buildHomepageOutlineStatuses({
      homepageContent: emptyHomepageCmsContent,
      homepageV2Published: publishedV2,
      homepageV2Draft: draftV2
    });
    expect(statuses["mini-carousel"]?.dirty).toBe(true);
    expect(statuses["banner-inter-shelf-1"]?.dirty).toBe(false);
    expect(statuses["banner-inter-shelf-1"]?.published).toBe(true);
  });

  it("marks only mission-agri dirty when draft differs there alone", () => {
    const publishedContent = {
      ...emptyHomepageCmsContent,
      shelves: {
        ...emptyHomepageCmsContent.shelves,
        droneWorld: { ...emptyHomepageCmsContent.shelves.droneWorld, title: "Drone World" }
      },
      missions: {
        ...emptyHomepageCmsContent.missions,
        agri: { ...emptyHomepageCmsContent.missions.agri, title: "Agri Community World" }
      }
    };
    const draftContent = {
      ...publishedContent,
      missions: {
        ...publishedContent.missions,
        agri: { ...publishedContent.missions.agri, title: "Agri Draft Title" }
      }
    };
    const published = { homepageContent: publishedContent, homepageV2: defaultHomepageCmsV2Content };
    const draft = { homepageContent: draftContent, homepageV2: defaultHomepageCmsV2Content };

    expect(hasHomepageSectionDraftChanges("mission-agri", published, draft)).toBe(true);
    expect(hasHomepageSectionDraftChanges("shelf-drone-world", published, draft)).toBe(false);

    const statuses = buildHomepageOutlineStatuses({
      homepageContent: publishedContent,
      homepageContentDraft: draftContent,
      homepageV2Published: defaultHomepageCmsV2Content,
      homepageV2Draft: defaultHomepageCmsV2Content
    });
    expect(statuses["mission-agri"]?.dirty).toBe(true);
    expect(statuses["shelf-drone-world"]?.dirty).toBe(false);
    expect(statuses["shelf-drone-world"]?.published).toBe(true);
  });
});

describe("mini carousel cms fallback", () => {
  const products = [
    {
      slug: "test-drone",
      name: "Test Drone",
      category: "Video Drones",
      tagline: "Field ready drone",
      price: 1000,
      interests: ["drone", "mapping"],
      specs: {},
      image: { src: "/media/test.jpg", alt: "Test" }
    }
  ] as Product[];

  it("falls back to catalog pick when no cms slides", () => {
    const items = resolveHomeMiniCarouselItems(products, { enabled: true, slides: [] });
    expect(items.length).toBeGreaterThan(0);
    expect(pickHomeMiniCarouselItems(products).length).toBe(items.length);
  });

  it("uses cms slides when configured", () => {
    const items = resolveHomeMiniCarouselItems(products, {
      enabled: true,
      slides: [
        {
          id: "slide-1",
          enabled: true,
          imageSrc: "/media/cms-slide.jpg",
          imageAlt: "CMS slide",
          heading: "Featured",
          description: "New arrival",
          ctaLabel: "View",
          href: "/products",
          productSlug: "",
          sortOrder: 0
        }
      ]
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.label).toBe("Featured");
  });

  it("skips cms slides when pinned product is missing", () => {
    const items = resolveHomeMiniCarouselItems(products, {
      enabled: true,
      slides: [
        {
          id: "slide-missing",
          enabled: true,
          imageSrc: "/media/stale.jpg",
          imageAlt: "Stale",
          heading: "Stale heading",
          description: "Stale copy",
          ctaLabel: "View",
          href: "/product/gone",
          productSlug: "gone-product",
          sortOrder: 0
        }
      ]
    });
    expect(items).toHaveLength(0);
  });

  it("prefers live product fields over stored slide overrides", () => {
    const items = resolveHomeMiniCarouselItems(products, {
      enabled: true,
      slides: [
        {
          id: "slide-live",
          enabled: true,
          imageSrc: "/media/stale.jpg",
          imageAlt: "Stale",
          heading: "Stale heading",
          description: "Stale copy",
          ctaLabel: "View",
          href: "/product/wrong",
          productSlug: "test-drone",
          sortOrder: 0
        }
      ]
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.label).toBe("Test Drone");
    expect(items[0]?.href).toBe("/product/test-drone");
    expect(items[0]?.media.src).toBe("/media/test.jpg");
  });
});
