/** Curated high-intent storefront searches shown when the overlay input is empty. */

export const POPULAR_SEARCH_QUERIES = [
  "agriculture drone",
  "mapping drone",
  "surveillance",
  "G-HADRON",
  "battery",
  "controller",
  "sprayer",
  "accessories"
] as const;

export type PopularSearchQuery = (typeof POPULAR_SEARCH_QUERIES)[number];
