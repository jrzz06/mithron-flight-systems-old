import type { Product } from "@/config/types";
import {
  buildProductsCatalogHref,
  type CatalogProductGroup
} from "@/lib/catalog-product-listing";
import {
  isGlobalProductsCategory,
  normalizeProductCategory
} from "@/lib/product-shelf-classification";
import {
  CATALOG_CATEGORY_SLUGS,
  catalogCategoryDefinitions,
  getCatalogCategoryByLabel,
  getCatalogCategoryDefinition,
  isCatalogCategorySlug,
  type CatalogCategoryDefinition,
  type CatalogCategorySlug
} from "@/lib/catalog-category-taxonomy";

export {
  CATALOG_CATEGORY_SLUGS,
  catalogCategoryDefinitions,
  getCatalogCategoryByLabel,
  getCatalogCategoryDefinition,
  isCatalogCategorySlug,
  type CatalogCategoryDefinition,
  type CatalogCategorySlug
};

const categoryByLegacyHref = new Map(catalogCategoryDefinitions.map((definition) => [definition.legacyHref, definition]));

function getCatalogCategoryByLegacyHref(href: string) {
  return categoryByLegacyHref.get(href);
}

export function filterProductsForCategorySlug(products: Product[], slug: CatalogCategorySlug) {
  const definition = getCatalogCategoryDefinition(slug);

  if (slug === "global-products") {
    return products.filter(isGlobalProductsCategory);
  }

  if (!definition.categoryNames.length) {
    return [];
  }

  const normalizedNames = new Set(definition.categoryNames.map(normalizeProductCategory));
  return products.filter((product) => normalizedNames.has(normalizeProductCategory(product.category)));
}

export const interestSlugToCategorySlug: Partial<Record<string, CatalogCategorySlug>> = {
  agriculture: "agri-drones",
  "video-drones": "video-drones",
  "creative-drones": "creative-drones",
  mapping: "survey-drones",
  surveillance: "surveillance-drones",
  "smart-farming": "agri-drones",
  "defense-security": "surveillance-drones",
  "industrial-inspection": "global-products",
  components: "accessories"
};

export function resolveCategoryHrefForInterest(slug: string) {
  const categorySlug = interestSlugToCategorySlug[slug];
  return categorySlug ? getCatalogCategoryDefinition(categorySlug).href : `/interest/${slug}`;
}

export type HomepageShelfCatalogKey = "drone-world" | "drone-care" | "global-products";

const homepageShelfFilterGroup: Record<HomepageShelfCatalogKey, CatalogProductGroup> = {
  "drone-world": "drones",
  "drone-care": "accessories-spare-parts",
  "global-products": "global-products"
};

export function parseProductsCategoryParam(value: string | undefined): CatalogCategorySlug | null {
  if (!value?.trim()) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "global-product" || normalized === "global-products") {
    return "global-products";
  }
  return isCatalogCategorySlug(normalized) ? normalized : null;
}

export function getProductsCatalogHref(group: CatalogProductGroup = "all") {
  return buildProductsCatalogHref(group);
}

export function getHomepageShelfCatalogHref(shelf: HomepageShelfCatalogKey) {
  return buildProductsCatalogHref(homepageShelfFilterGroup[shelf]);
}

export const ACCESSORIES_CATALOG_HREF = "/category/accessories";

const DRONE_CARE_STOREFRONT_PATH_ALIASES = new Set([
  "/dronecare",
  "/drone-care",
  "/drone_care"
]);

/** Legacy service landing paths that should open the accessories catalog instead. */
const DRONE_CARE_LEGACY_CATALOG_HREFS = new Set([
  "/product/mithron-care-plus"
]);

function normalizeStorefrontPath(href: string) {
  const trimmed = href.trim();
  if (!trimmed) return "";
  const withoutQuery = trimmed.split("?")[0]?.split("#")[0] ?? trimmed;
  return withoutQuery.replace(/\/+$/, "").toLowerCase();
}

export function isDroneCareStorefrontAlias(href: string) {
  return DRONE_CARE_STOREFRONT_PATH_ALIASES.has(normalizeStorefrontPath(href));
}

export function isDroneCareLegacyCatalogHref(href: string) {
  return DRONE_CARE_LEGACY_CATALOG_HREFS.has(normalizeStorefrontPath(href));
}

/** Map Drone Care storefront aliases to the accessories category page. */
export function resolveDroneCareStorefrontHref(href: string, fallback = ACCESSORIES_CATALOG_HREF) {
  const trimmed = href.trim();
  if (!trimmed) return fallback;
  if (isDroneCareStorefrontAlias(trimmed) || isDroneCareLegacyCatalogHref(trimmed)) {
    return ACCESSORIES_CATALOG_HREF;
  }
  return trimmed;
}
