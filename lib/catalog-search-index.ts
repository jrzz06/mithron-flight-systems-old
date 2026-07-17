import type { CatalogSearchResult } from "@/services/catalog";
import {
  categoryMatchesSearchQuery,
  queryMatchesProductFields,
  scoreProductSearch,
  type SearchableProductFields
} from "@/lib/product-search-engine";
import { MIN_SEARCH_QUERY_LENGTH, normalizeSearchText } from "@/lib/search-query";

export type CatalogSearchIndexEntry = CatalogSearchResult & {
  searchFields?: SearchableProductFields;
  sortOrder: number;
};

function resolveSearchFields(entry: CatalogSearchIndexEntry): SearchableProductFields {
  if (entry.searchFields) return entry.searchFields;
  return {
    name: entry.name,
    tagline: entry.tagline ?? "",
    slug: entry.slug,
    sku: entry.slug,
    category: entry.category ?? "",
    interests: [],
    anchors: [],
    badge: entry.badge ?? "",
    description: "",
    sourceDescription: "",
    specs: "",
    sourceCatalogId: ""
  };
}

function toSearchResult(entry: CatalogSearchIndexEntry): CatalogSearchResult {
  const { searchFields, sortOrder, ...result } = entry;
  void searchFields;
  void sortOrder;
  return result;
}

function scoreSearchEntry(entry: CatalogSearchIndexEntry, query: string) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery || normalizedQuery.length < MIN_SEARCH_QUERY_LENGTH) return 0;

  return scoreProductSearch(resolveSearchFields(entry), normalizedQuery, {
    sortOrder: entry.sortOrder
  });
}

export function searchCatalogIndex(
  index: CatalogSearchIndexEntry[],
  query: string,
  limit = 24
): CatalogSearchResult[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery || normalizedQuery.length < MIN_SEARCH_QUERY_LENGTH) return [];

  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);

  return index
    .map((entry) => ({
      entry,
      score: scoreSearchEntry(entry, normalizedQuery)
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (left.entry.sortOrder !== right.entry.sortOrder) {
        return left.entry.sortOrder - right.entry.sortOrder;
      }
      return left.entry.slug.localeCompare(right.entry.slug);
    })
    .slice(0, boundedLimit)
    .map((item) => toSearchResult(item.entry));
}

export function getFeaturedFromCatalogIndex(
  index: CatalogSearchIndexEntry[],
  limit = 4
): CatalogSearchResult[] {
  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 12);
  const badged = index.filter((entry) => Boolean(entry.badge));
  const featured = badged.length ? badged : index;
  return featured.slice(0, boundedLimit).map(toSearchResult);
}

export function suggestCatalogCategories(
  index: CatalogSearchIndexEntry[],
  query: string,
  limit = 4
) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];

  const counts = new Map<string, number>();
  for (const entry of index) {
    if (!categoryMatchesSearchQuery(entry.category, normalizedQuery)) continue;
    if (!queryMatchesProductFields(resolveSearchFields(entry), normalizedQuery)) continue;
    counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([category]) => category);
}
