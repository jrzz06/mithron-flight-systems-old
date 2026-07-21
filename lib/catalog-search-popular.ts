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

/** Idle Quick Links for the search overlay (Insta360-style single list). */
export const SEARCH_QUICK_LINKS = [
  "10L Agriculture Drone",
  "Mapping Drone",
  "Survey Drone",
  "Flight Controller",
  "GNSS Module",
  "Agriculture Accessories"
] as const;

export type SearchQuickLink = (typeof SEARCH_QUICK_LINKS)[number];
