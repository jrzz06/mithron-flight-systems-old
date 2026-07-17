import { describe, expect, it } from "vitest";
import { getDefaultHomepageCmsContent } from "@/config/homepage-cms";
import { defaultHomepageCmsV2Content } from "@/config/homepage-cms-v2";
import type { Product } from "@/config/types";
import {
  buildPinnedMiniCarouselSlides,
  resolveMiniCarouselEditorState,
  resolveMiniCarouselSlotAssignments,
  resolveShelfSlotAssignments
} from "@/lib/cms/homepage-slot-assignment";
import { CMS_SHELF_KEY_TO_ID } from "@/lib/home/shelf-product-resolution";
import { CMS_PREVIEW_DEVICE_WIDTHS } from "@/components/admin/cms/cms-responsive-preview-frame";

function product(partial: Partial<Product> & Pick<Product, "slug" | "name" | "category">): Product {
  return {
    productUrl: partial.productUrl ?? `/product/${partial.slug}`,
    tagline: partial.tagline ?? partial.name,
    price: partial.price ?? 1000,
    interests: partial.interests ?? [],
    badge: partial.badge,
    image: partial.image ?? { src: "/test.png", alt: partial.name },
    hero: partial.hero ?? partial.image ?? { src: "/test.png", alt: partial.name },
    gallery: partial.gallery ?? [],
    variants: partial.variants ?? [],
    bundles: partial.bundles ?? [],
    story: partial.story ?? [],
    anchors: partial.anchors ?? [],
    specs: partial.specs ?? {},
    ...partial
  };
}

const sampleProducts: Product[] = [
  product({
    slug: "agri-drone-small",
    name: "Agri Kisan Drone Small",
    category: "Agri Drones",
    interests: ["agri", "drone"],
    price: 425000,
    image: { src: "/products/agri-small.jpg", alt: "Agri drone" }
  }),
  product({
    slug: "cinema-drone",
    name: "4K Cinema Drone",
    category: "Cinema Drones",
    interests: ["cinema", "drone"],
    price: 99500,
    image: { src: "/products/cinema.jpg", alt: "Cinema drone" }
  })
];

describe("homepage slot assignment", () => {
  it("marks shelf slots inferred when no productSlugs are stored", () => {
    const cms = getDefaultHomepageCmsContent();
    const shelf = { ...cms.shelves.droneWorld, productSlugs: [] };
    const assignments = resolveShelfSlotAssignments(CMS_SHELF_KEY_TO_ID.droneWorld, shelf, sampleProducts, 4);
    expect(assignments.some((slot) => slot.source === "inferred")).toBe(true);
    expect(assignments.filter((slot) => slot.product).length).toBeGreaterThan(0);
  });

  it("marks shelf slots pinned when slugs are stored", () => {
    const cms = getDefaultHomepageCmsContent();
    const shelf = { ...cms.shelves.droneWorld, productSlugs: ["agri-drone-small"] };
    const assignments = resolveShelfSlotAssignments(CMS_SHELF_KEY_TO_ID.droneWorld, shelf, sampleProducts, 4);
    expect(assignments[0]?.source).toBe("pinned");
    expect(assignments[0]?.slug).toBe("agri-drone-small");
  });

  it("resolves mini carousel inferred slots when CMS slides are empty", () => {
    const miniCarousel = { ...defaultHomepageCmsV2Content.miniCarousel, slides: [] };
    const state = resolveMiniCarouselEditorState(miniCarousel, sampleProducts);
    expect(state.slots.length).toBeGreaterThan(0);
    expect(state.hasInferredAssignments).toBe(true);
    expect(state.slots.every((slot) => slot.source === "inferred")).toBe(true);
  });

  it("builds pin-ready mini carousel slides from assignments", () => {
    const miniCarousel = { ...defaultHomepageCmsV2Content.miniCarousel, slides: [] };
    const state = resolveMiniCarouselEditorState(miniCarousel, sampleProducts);
    const slides = buildPinnedMiniCarouselSlides(state.slots);
    expect(slides[0]?.productSlug).toBeTruthy();
    expect(resolveMiniCarouselSlotAssignments({ enabled: true, slides }, sampleProducts)[0]?.source).toBe("pinned");
  });
});

describe("cms preview frame", () => {
  it("exposes desktop tablet mobile widths", () => {
    expect(CMS_PREVIEW_DEVICE_WIDTHS.desktop).toBe(1440);
    expect(CMS_PREVIEW_DEVICE_WIDTHS.tablet).toBe(768);
    expect(CMS_PREVIEW_DEVICE_WIDTHS.mobile).toBe(390);
  });

  it("scales down when container is narrower than device width", () => {
    const containerWidth = 500;
    const deviceWidth = CMS_PREVIEW_DEVICE_WIDTHS.desktop;
    const scale = Math.min(1, containerWidth / deviceWidth);
    expect(scale).toBeLessThan(1);
    expect(scale).toBeCloseTo(500 / 1440, 5);
  });
});
