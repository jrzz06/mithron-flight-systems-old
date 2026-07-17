import { beforeEach, describe, expect, it } from "vitest";
import {
  getRecentlyViewedForDisplay,
  readRecentlyViewedProducts,
  recordRecentlyViewedProduct,
  RECENTLY_VIEWED_MAX_DISPLAY,
  RECENTLY_VIEWED_MAX_STORED,
  type RecentlyViewedProduct
} from "@/lib/recently-viewed-products";

describe("recently viewed products", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        }
      }
    });
  });

  it("dedupes by slug and stores newest first", () => {
    recordRecentlyViewedProduct({
      slug: "alpha",
      name: "Alpha",
      price: 1,
      category: "Creative Drones",
      tagline: "One",
      image: { src: "/a.png" }
    });
    recordRecentlyViewedProduct({
      slug: "beta",
      name: "Beta",
      price: 2,
      category: "Creative Drones",
      tagline: "Two",
      image: { src: "/b.png" }
    });
    recordRecentlyViewedProduct({
      slug: "alpha",
      name: "Alpha Updated",
      price: 1,
      category: "Creative Drones",
      tagline: "One",
      image: { src: "/a.png" }
    });

    const items = readRecentlyViewedProducts();
    expect(items.map((item) => item.slug)).toEqual(["alpha", "beta"]);
    expect(items[0]?.name).toBe("Alpha Updated");
  });

  it("caps stored items and excludes the current slug from display", () => {
    for (let index = 0; index < RECENTLY_VIEWED_MAX_STORED + 2; index += 1) {
      recordRecentlyViewedProduct({
        slug: `item-${index}`,
        name: `Item ${index}`,
        price: index,
        category: "Creative Drones",
        tagline: "Tag",
        image: { src: `/item-${index}.png` }
      }, readRecentlyViewedProducts());
    }

    expect(readRecentlyViewedProducts()).toHaveLength(RECENTLY_VIEWED_MAX_STORED);

    const displayed = getRecentlyViewedForDisplay("item-0", readRecentlyViewedProducts());
    expect(displayed.some((item) => item.slug === "item-0")).toBe(false);
    expect(displayed.length).toBeLessThanOrEqual(RECENTLY_VIEWED_MAX_DISPLAY);
  });
});
