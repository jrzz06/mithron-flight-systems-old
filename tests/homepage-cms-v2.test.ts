import { describe, expect, it } from "vitest";
import { mergeHomepageCmsV2Content } from "@/config/homepage-cms-v2";
import { aspectRatioMatches, validateCtaPair, validateImageDimensions, validateRequired } from "@/lib/cms/section-validation";
import { CMS_IMAGE_SPECS } from "@/config/homepage-section-registry";
import { resolveHomeMiniCarouselItems, pickHomeMiniCarouselItems } from "@/lib/home/mini-carousel";
import type { Product } from "@/config/types";

describe("homepage cms v2 merge", () => {
  it("merges inter-shelf banner defaults", () => {
    const merged = mergeHomepageCmsV2Content({});
    expect(merged.banners.interShelf).toHaveLength(3);
    expect(merged.banners.fullViewport).toHaveLength(2);
    expect(merged.reviews.maxCount).toBe(6);
  });
});

describe("section validation", () => {
  it("validates cta pairs", () => {
    const errors = validateCtaPair("Shop now", "");
    expect(errors[0]?.message).toContain("CTA link is required");
  });

  it("validates required fields", () => {
    expect(validateRequired("", "title", "Title")).toHaveLength(1);
  });

  it("matches hero 2.4:1 aspect ratio", () => {
    expect(aspectRatioMatches(1920, 800, CMS_IMAGE_SPECS.hero)).toBe(true);
    expect(aspectRatioMatches(1920, 1080, CMS_IMAGE_SPECS.hero)).toBe(false);
  });

  it("enforces exact hero dimensions when configured", () => {
    expect(validateImageDimensions(1920, 800, CMS_IMAGE_SPECS.hero)).toHaveLength(0);
    expect(validateImageDimensions(1920, 1080, CMS_IMAGE_SPECS.hero)[0]?.message).toContain("1920×800");
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
});
