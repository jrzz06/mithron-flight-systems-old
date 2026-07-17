import { describe, expect, it } from "vitest";
import { getDefaultHomepageCmsContent } from "@/config/homepage-cms";
import type { Product } from "@/config/types";
import { mapProductToReplaceItem, mapProductsToSlotItems } from "@/lib/admin/shelf-slot-product";
import { buildSlugInFilter } from "@/lib/catalog/filters";
import {
  padShelfSlugs,
  resolveEffectiveShelfProducts,
  resolveEffectiveShelfSlotItems,
  resolveEffectiveShelfSlotItemsPadded,
  resolveEffectiveShelfSlugs
} from "@/lib/home/shelf-product-resolution";

function product(partial: Partial<Product> & Pick<Product, "slug" | "name" | "category">): Product {
  return {
    tagline: partial.tagline ?? partial.name,
    price: partial.price ?? 1000,
    interests: partial.interests ?? [],
    image: partial.image ?? { src: "/test.png", alt: partial.name },
    hero: partial.image ?? { src: "/test.png", alt: partial.name },
    gallery: [],
    variants: partial.variants ?? [],
    bundles: [],
    story: [],
    specs: partial.specs ?? {},
    anchors: [],
    productUrl: `/product/${partial.slug}`,
    ...partial
  };
}

describe("shelf editor hydration parity", () => {
  it("maps resolved homepage products to slot items in shelf order", () => {
    const catalog = [
      product({ slug: "drone-a", name: "Drone A", category: "Agri Drones", interests: ["drone"] }),
      product({ slug: "drone-b", name: "Drone B", category: "Agri Drones", interests: ["drone", "uav"] })
    ];
    const shelf = getDefaultHomepageCmsContent().shelves.droneWorld;
    const slotItems = resolveEffectiveShelfSlotItems("drone-world", shelf, catalog, 4);
    const slugs = resolveEffectiveShelfSlugs("drone-world", shelf, catalog, 4);

    expect(slotItems.length).toBeGreaterThan(0);
    expect(slotItems[0]?.slug).toBe(slugs.filter(Boolean)[0]);
    expect(mapProductsToSlotItems(resolveEffectiveShelfProducts("drone-world", shelf, catalog, 4))).toEqual(slotItems);
  });

  it("never leaves a resolved slug without a slot item mapping", () => {
    const catalog = [
      product({ slug: "drone-a", name: "Drone A", category: "Agri Drones", interests: ["drone"] }),
      product({ slug: "drone-b", name: "Drone B", category: "Agri Drones", interests: ["drone"] })
    ];
    const shelf = getDefaultHomepageCmsContent().shelves.droneWorld;
    const slugs = padShelfSlugs(resolveEffectiveShelfSlugs("drone-world", shelf, catalog, 4), 4);
    const items = mapProductsToSlotItems(resolveEffectiveShelfProducts("drone-world", shelf, catalog, 4));
    const itemBySlug = new Map(items.map((item) => [item.slug, item]));

    for (const slug of slugs.filter(Boolean)) {
      expect(itemBySlug.has(slug)).toBe(true);
      expect(mapProductToReplaceItem(catalog.find((entry) => entry.slug === slug)!).slug).toBe(slug);
    }
  });

  it("builds direct slug filters for catalog API lookup", () => {
    expect(buildSlugInFilter(["drone-a", "drone-b"])).toBe("slug=in.(drone-a,drone-b)");
    expect(buildSlugInFilter([])).toBe("");
  });

  it("padded slot items preserve homepage position count", () => {
    const catalog = [
      product({ slug: "drone-a", name: "Drone A", category: "Agri Drones", interests: ["drone"] }),
      product({ slug: "drone-b", name: "Drone B", category: "Agri Drones", interests: ["drone"] }),
      product({ slug: "drone-c", name: "Drone C", category: "Agri Drones", interests: ["drone"] }),
      product({ slug: "drone-d", name: "Drone D", category: "Agri Drones", interests: ["drone"] })
    ];
    const shelf = getDefaultHomepageCmsContent().shelves.droneWorld;
    const padded = resolveEffectiveShelfSlotItemsPadded("drone-world", shelf, catalog, 4);

    expect(padded).toHaveLength(4);
    expect(padded.every((item) => item !== null)).toBe(true);
  });
});
