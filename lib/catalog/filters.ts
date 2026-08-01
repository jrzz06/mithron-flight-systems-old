import { PUBLISHED_STOREFRONT_FILTER } from "@/lib/catalog-product-filters";

export const LEGACY_WIX_INVENTORY_CATEGORY = "Imported Wix Inventory";

/** Storefront published filter — keeps merge_status null-safe and excludes archived / legacy rows. */
export const publishedCatalogFilter = [
  PUBLISHED_STOREFRONT_FILTER,
  `category=neq.${encodeURIComponent(LEGACY_WIX_INVENTORY_CATEGORY)}`,
  "slug=not.like.audit-trace-*"
].join("&");

export function buildSlugInFilter(slugs: string[]) {
  const unique = [...new Set(slugs.map((slug) => slug.trim()).filter(Boolean))];
  if (!unique.length) return "";
  const encoded = unique.map((slug) => encodeURIComponent(slug)).join(",");
  return `slug=in.(${encoded})`;
}
