import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getDefaultHomepageCmsContent, SHELF_PRODUCT_CARD_SLOTS } from "@/config/homepage-cms";
import type { Product } from "@/config/types";
import { mapProductsToSlotItems } from "@/lib/admin/shelf-slot-product";
import {
  resolveEffectiveShelfSlotItemsPadded,
  shelfCategoryHintForShelfKey
} from "@/lib/home/shelf-product-resolution";

const pickerSource = readFileSync("components/admin/cms/product-replace-picker.tsx", "utf8");

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

describe("product replace picker source contract", () => {
  it("uses a flex-growing scroll region for results", () => {
    expect(pickerSource).toContain("flex max-h-[85dvh]");
    expect(pickerSource).toContain("min-h-0 flex-1");
    expect(pickerSource).toContain("overflow-y-auto");
  });

  it("documents browseCatalog and shelfCategoryHint props", () => {
    expect(pickerSource).toContain("browseCatalog");
    expect(pickerSource).toContain("shelfCategoryHint");
  });
});

describe("padded shelf slot items", () => {
  it("returns length-4 positional slots aligned with SHELF_PRODUCT_CARD_SLOTS", () => {
    const catalog = [
      product({ slug: "drone-a", name: "Drone A", category: "Agri Drones", interests: ["drone"] }),
      product({ slug: "drone-b", name: "Drone B", category: "Agri Drones", interests: ["drone", "uav"] }),
      product({ slug: "drone-c", name: "Drone C", category: "Agri Drones", interests: ["drone"] }),
      product({ slug: "drone-d", name: "Drone D", category: "Agri Drones", interests: ["drone"] })
    ];
    const shelf = getDefaultHomepageCmsContent().shelves.droneWorld;
    const padded = resolveEffectiveShelfSlotItemsPadded("drone-world", shelf, catalog, SHELF_PRODUCT_CARD_SLOTS);

    expect(padded).toHaveLength(SHELF_PRODUCT_CARD_SLOTS);
    expect(padded.filter(Boolean)).toHaveLength(4);
  });

  it("browse catalog filter matches homepage product pool", () => {
    const catalog = [
      product({ slug: "drone-a", name: "Drone A", category: "Agri Drones", interests: ["drone"] }),
      product({ slug: "acc-1", name: "Battery", category: "Accessories", interests: ["battery"] })
    ];
    const browse = mapProductsToSlotItems(catalog);
    const hint = shelfCategoryHintForShelfKey("droneWorld");

    expect(hint).toBe("Agri Drones");
    expect(browse.some((item) => item.category.includes("Agri"))).toBe(true);
  });
});
