import type { CatalogSearchResult } from "@/services/catalog";
import type { CatalogSearchIndexEntry } from "@/lib/catalog-search-index";

export type SlimCatalogSearchIndexEntry = Pick<
  CatalogSearchIndexEntry,
  "slug" | "name" | "tagline" | "price" | "badge" | "category" | "image" | "availability" | "sortOrder"
>;

export function toSlimCatalogSearchIndex(index: CatalogSearchIndexEntry[]): SlimCatalogSearchIndexEntry[] {
  return index.map(({ slug, name, tagline, price, badge, category, image, availability, sortOrder }) => ({
    slug,
    name,
    tagline,
    price,
    badge,
    category,
    image,
    availability,
    sortOrder: sortOrder ?? 0
  }));
}

export function toSlimCatalogSearchResults(results: CatalogSearchResult[]): CatalogSearchResult[] {
  return results;
}
