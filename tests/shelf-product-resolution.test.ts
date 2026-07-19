import { describe, expect, it } from "vitest";
import { getDefaultHomepageCmsContent } from "@/config/homepage-cms";
import type { Product } from "@/config/types";
import {
  buildShelfProductConfig,
  mapProductToReplaceItem,
  pickShelfProducts,
  resolveEffectiveShelfProducts,
  resolveEffectiveShelfSlugs
} from "@/lib/home/shelf-product-resolution";

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

const droneA = product({
  slug: "agri-kisan-drone",
  name: "Agri Kisan Drone",
  category: "Agri Drones",
  interests: ["agriculture", "drone"],
  tagline: "8-Liter Agri Kisan Drone"
});

const droneB = product({
  slug: "survey-drone",
  name: "Survey Drone UAV",
  category: "Agri Drones",
  interests: ["mapping", "drone"],
  tagline: "Survey platform"
});

const battery = product({
  slug: "6s-battery",
  name: "6S Battery Pack",
  category: "Accessories",
  interests: ["battery", "care"],
  tagline: "Field battery"
});

const globalItem = product({
  slug: "zio",
  name: "ZIO",
  category: "Global Products",
  interests: ["survey"],
  tagline: "Global catalog product"
});

describe("shelf product resolution", () => {
  it("falls back to catalog picks when shelf productSlugs are empty", () => {
    const shelf = getDefaultHomepageCmsContent().shelves.droneWorld;
    const config = buildShelfProductConfig("drone-world", shelf);
    const resolved = pickShelfProducts([battery, droneB, droneA], config, 4);

    expect(shelf.productSlugs).toEqual([]);
    expect(resolved.map((item) => item.slug)).toEqual(["survey-drone", "agri-kisan-drone"]);
    expect(resolveEffectiveShelfSlugs("drone-world", shelf, [battery, droneB, droneA], 4)).toEqual([
      "survey-drone",
      "agri-kisan-drone",
      "",
      ""
    ]);
  });

  it("prefers explicit CMS slugs when they resolve in the catalog", () => {
    const shelf = {
      ...getDefaultHomepageCmsContent().shelves.droneWorld,
      productSlugs: ["survey-drone", "agri-kisan-drone"]
    };
    const resolved = resolveEffectiveShelfProducts("drone-world", shelf, [battery, droneB, droneA], 4);

    expect(resolved.map((item) => item.slug)).toEqual(["survey-drone", "agri-kisan-drone"]);
  });

  it("does not auto-fill unrelated catalog products when pinned slugs are missing", () => {
    const shelf = {
      ...getDefaultHomepageCmsContent().shelves.droneWorld,
      productSlugs: ["missing-slug"]
    };
    const resolved = resolveEffectiveShelfProducts("drone-world", shelf, [battery, droneB, droneA], 4);
    const slugs = resolveEffectiveShelfSlugs("drone-world", shelf, [battery, droneB, droneA], 4);

    expect(resolved).toEqual([]);
    expect(slugs).toEqual(["missing-slug", "", "", ""]);
  });

  it("honors CMS View All href when set", () => {
    const shelf = {
      ...getDefaultHomepageCmsContent().shelves.droneWorld,
      href: "/products?filter=drones"
    };
    const config = buildShelfProductConfig("drone-world", shelf);
    expect(config.href).toBe("/products?filter=drones");
  });

  it("resolves global shelf products from the global category", () => {
    const shelf = getDefaultHomepageCmsContent().shelves.globalProducts;
    const resolved = resolveEffectiveShelfProducts("global-products", shelf, [battery, droneA, globalItem], 4);

    expect(resolved.map((item) => item.slug)).toEqual(["zio"]);
  });

  it("maps products to replace picker slot items", () => {
    const mapped = mapProductToReplaceItem(droneA);
    expect(mapped.slug).toBe("agri-kisan-drone");
    expect(mapped.name).toBe("Agri Kisan Drone");
    expect(mapped.imageSrc).toBe("/test.png");
  });
});
