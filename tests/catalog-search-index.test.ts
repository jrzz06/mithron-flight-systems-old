import { describe, expect, it } from "vitest";
import { fieldsFromCatalogRow } from "@/lib/product-search-engine";
import {
  getFeaturedFromCatalogIndex,
  searchCatalogIndex,
  type CatalogSearchIndexEntry
} from "@/lib/catalog-search-index";

function entry(
  partial: Partial<CatalogSearchIndexEntry> & Pick<CatalogSearchIndexEntry, "slug" | "name">
): CatalogSearchIndexEntry {
  const category = partial.category ?? "Agri Drones";
  const tagline = partial.tagline ?? "";
  const searchFields =
    partial.searchFields ??
    fieldsFromCatalogRow({
      slug: partial.slug,
      name: partial.name,
      tagline,
      category
    });

  return {
    slug: partial.slug,
    name: partial.name,
    tagline,
    price: partial.price ?? 1000,
    category,
    image: partial.image ?? { src: "/media/example.png", alt: partial.name },
    searchFields,
    sortOrder: partial.sortOrder ?? 10,
    badge: partial.badge
  };
}

describe("catalog search index", () => {
  const index: CatalogSearchIndexEntry[] = [
    entry({
      slug: "pixy-lr",
      name: "Pixy LR",
      tagline: "Long range mapping drone",
      category: "Video Drones"
    }),
    entry({
      slug: "source-a10e-agri-drone-10-liters-base",
      name: "A10E Agri Drone 10 Liters Base",
      category: "Agri Drones"
    }),
    entry({
      slug: "source-drone-battery",
      name: "Drone Battery Pack",
      category: "Accessories",
      searchFields: fieldsFromCatalogRow({
        slug: "source-drone-battery",
        name: "Drone Battery Pack",
        category: "Power Systems",
        description: "High-capacity lithium battery"
      })
    })
  ];

  it("returns empty results for blank query", () => {
    expect(searchCatalogIndex(index, "", 24)).toEqual([]);
  });

  it("matches exact and partial product names", () => {
    const results = searchCatalogIndex(index, "pixy", 24);
    expect(results.map((product) => product.slug)).toEqual(["pixy-lr"]);
  });

  it("matches multi-token queries across search text", () => {
    const results = searchCatalogIndex(index, "agri drone", 24);
    expect(results[0]?.slug).toBe("source-a10e-agri-drone-10-liters-base");
  });

  it("limits result count", () => {
    const results = searchCatalogIndex(index, "drone", 1);
    expect(results).toHaveLength(1);
  });

  it("matches single-character prefixes from primary fields only", () => {
    const results = searchCatalogIndex(index, "a", 24);
    expect(results.map((product) => product.slug)).toEqual(["source-a10e-agri-drone-10-liters-base"]);
  });

  it("matches partial prefixes like agr for Agri Drones", () => {
    const results = searchCatalogIndex(index, "agr", 24);
    expect(results.some((product) => product.slug === "source-a10e-agri-drone-10-liters-base")).toBe(true);
  });

  it("matches fuzzy compact spellings", () => {
    const fuzzyIndex = [
      entry({
        slug: "g-hadron",
        name: "G-HADRON",
        category: "Surveillance Drones",
        searchFields: fieldsFromCatalogRow({
          slug: "g-hadron",
          name: "G-HADRON",
          category: "Surveillance Drones",
          interests: ["ghadron mapping"]
        })
      })
    ];
    expect(searchCatalogIndex(fuzzyIndex, "ghadron", 24)[0]?.slug).toBe("g-hadron");
  });

  it("returns no results when query tokens do not all match", () => {
    expect(searchCatalogIndex(index, "pixy agriculture", 24)).toEqual([]);
    expect(searchCatalogIndex(index, "random nonsense", 24)).toEqual([]);
  });

  it("does not match unrelated description-only keywords", () => {
    const looseIndex = [
      entry({
        slug: "unrelated-product",
        name: "Industrial Gimbal",
        tagline: "Precision stabilization",
        category: "Stabilization",
        searchFields: fieldsFromCatalogRow({
          slug: "unrelated-product",
          name: "Industrial Gimbal",
          tagline: "Precision stabilization",
          category: "Stabilization",
          description: "precision stabilization platform for industrial payloads"
        })
      })
    ];
    expect(searchCatalogIndex(looseIndex, "surveillance", 24)).toEqual([]);
    expect(searchCatalogIndex(looseIndex, "a", 24)).toEqual([]);
  });

  it("returns featured badge products first", () => {
    const featuredIndex = [
      entry({ slug: "plain", name: "Plain Drone", sortOrder: 1 }),
      entry({ slug: "featured", name: "Featured Drone", badge: "New Stock", sortOrder: 99 })
    ];
    const featured = getFeaturedFromCatalogIndex(featuredIndex, 4);
    expect(featured[0]?.slug).toBe("featured");
  });
});
