import { describe, expect, it } from "vitest";
import { rankYouMayAlsoLikeCandidates } from "@/lib/product-you-may-also-like";
import type { ProductShellItem } from "@/services/catalog";

function shellItem(partial: Partial<ProductShellItem> & Pick<ProductShellItem, "slug" | "name" | "price">): ProductShellItem {
  return {
    slug: partial.slug,
    name: partial.name,
    price: partial.price,
    tagline: partial.tagline ?? "",
    category: partial.category ?? "Creative Drones",
    interests: partial.interests ?? [],
    image: partial.image ?? { src: "/products/example.png", alt: partial.name },
    searchText: partial.searchText ?? partial.name
  };
}

describe("rankYouMayAlsoLikeCandidates", () => {
  const current = {
    slug: "current",
    category: "Creative Drones",
    interests: ["creative"],
    price: 100_000
  };

  const candidates = [
    shellItem({ slug: "same-category", name: "Same Category", price: 120_000, category: "Creative Drones", interests: ["survey"] }),
    shellItem({ slug: "same-interest", name: "Same Interest", price: 200_000, category: "Survey Drones", interests: ["creative"] }),
    shellItem({ slug: "similar-price", name: "Similar Price", price: 95_000, category: "Accessories", interests: ["care"] }),
    shellItem({ slug: "fallback", name: "Fallback", price: 500_000, category: "Accessories", interests: ["care"] })
  ];

  it("prioritizes same category, then shared interests, then similar price", () => {
    const ranked = rankYouMayAlsoLikeCandidates(current, candidates, 4);
    expect(ranked.map((item) => item.slug)).toEqual([
      "same-category",
      "same-interest",
      "similar-price",
      "fallback"
    ]);
  });

  it("excludes the current product slug", () => {
    const ranked = rankYouMayAlsoLikeCandidates(current, [
      ...candidates,
      shellItem({ slug: "current", name: "Current", price: 100_000, category: "Creative Drones" })
    ], 4);
    expect(ranked.some((item) => item.slug === "current")).toBe(false);
  });
});
