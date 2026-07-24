import type { Product } from "@/config/types";
import {
  classifyProductShelf,
  DRONE_WORLD_CATEGORIES,
  isDroneWorldCategory,
  isGlobalProductsCategory,
  type ProductShelfInput
} from "@/lib/product-shelf-classification";
import { fieldsFromProduct, queryMatchesProductFields } from "@/lib/product-search-engine";

export type CatalogSortKey =
  | "featured"
  | "price-asc"
  | "price-desc"
  | "name-asc"
  | "name-desc";

export type CatalogProductGroup =
  | "all"
  | "drones"
  | "accessories-spare-parts"
  | "global-products";

const CATALOG_PRODUCT_GROUP_VALUES: CatalogProductGroup[] = [
  "all",
  "drones",
  "accessories-spare-parts",
  "global-products"
];

export type CatalogListingOptions = {
  query?: string;
  sort?: CatalogSortKey;
  group?: CatalogProductGroup;
};

export const CATALOG_SORT_OPTIONS: { value: CatalogSortKey; label: string }[] = [
  { value: "featured", label: "Featured" },
  { value: "price-asc", label: "Price: Low → High" },
  { value: "price-desc", label: "Price: High → Low" },
  { value: "name-asc", label: "Name: Ascending" },
  { value: "name-desc", label: "Name: Descending" }
];

const catalogNameCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base"
});

function compareProductNames(a: string, b: string, direction: "asc" | "desc") {
  const result = catalogNameCollator.compare(a, b);
  return direction === "asc" ? result : -result;
}

function compareProductSlugs(a: string, b: string) {
  return catalogNameCollator.compare(a, b);
}

export const CATALOG_GROUP_OPTIONS: { value: CatalogProductGroup; label: string }[] = [
  { value: "all", label: "All Products" },
  { value: "drones", label: "Drones" },
  { value: "accessories-spare-parts", label: "Accessories & Spare Parts" },
  { value: "global-products", label: "Global Products" }
];

export function parseCatalogProductGroupParam(value: string | undefined): CatalogProductGroup {
  if (!value?.trim()) return "all";
  const normalized = value.trim().toLowerCase() as CatalogProductGroup;
  return CATALOG_PRODUCT_GROUP_VALUES.includes(normalized) ? normalized : "all";
}

export type ProductsCatalogHrefOptions = {
  group?: CatalogProductGroup;
  q?: string;
};

export function parseCatalogSearchQueryParam(value: string | undefined): string {
  return value?.trim() ?? "";
}

export function buildProductsCatalogHref(options: ProductsCatalogHrefOptions | CatalogProductGroup = "all") {
  const normalized =
    typeof options === "string"
      ? { group: options, q: undefined }
      : { group: options.group ?? "all", q: options.q };
  const params = new URLSearchParams();
  if (normalized.group !== "all") params.set("filter", normalized.group);
  const query = parseCatalogSearchQueryParam(normalized.q);
  if (query) params.set("q", query);
  const search = params.toString();
  return search ? `/products?${search}` : "/products";
}

const SURVEY_DRONES_CATEGORY = "Survey Drones";
const ACCESSORY_CATEGORY = "Accessories";

const SPARE_PART_PATTERNS: RegExp[] = [
  /\b(?:spare|replacement|repair)\b/i,
  /\b(?:drone[\s-]?)?frame\b/i,
  /\b(?:drone[\s-]?)?arm\b/i,
  /\bpropeller(?:s)?\b/i,
  /\blanding[\s-]?gear\b/i,
  /\bbattery[\s-]?frame\b/i,
  /\b(?:cfrp|3d[\s-]?printed)[\s-]?(?:arm|frame)\b/i,
  /\bmaintenance[\s-]?kit\b/i
];

function productMatchesQuery(product: Product, query: string) {
  const trimmed = query.trim();
  if (!trimmed) return true;
  return queryMatchesProductFields(fieldsFromProduct(product), trimmed);
}

function productText(product: ProductShelfInput) {
  return [product.slug, product.name, product.tagline, product.category].join(" ").toLowerCase();
}

export function isSparePartProduct(product: ProductShelfInput) {
  const text = productText(product);
  return SPARE_PART_PATTERNS.some((pattern) => pattern.test(text));
}

export function isDroneGroupProduct(product: ProductShelfInput) {
  if (isDroneWorldCategory(product)) return true;
  if (product.category === SURVEY_DRONES_CATEGORY) return true;
  return classifyProductShelf(product) === "drone-world";
}

export function isAccessoryGroupProduct(product: ProductShelfInput) {
  return product.category === ACCESSORY_CATEGORY && !isSparePartProduct(product);
}

export function matchesCatalogProductGroup(product: Product, group: CatalogProductGroup) {
  switch (group) {
    case "all":
      return true;
    case "drones":
      return isDroneGroupProduct(product);
    case "accessories-spare-parts":
      return isAccessoryGroupProduct(product) || isSparePartProduct(product);
    case "global-products":
      return isGlobalProductsCategory(product);
    default:
      return true;
  }
}

function sortCatalogProducts(
  products: Product[],
  sort: CatalogSortKey,
  originalOrder: Map<string, number>
) {
  const sorted = [...products];

  switch (sort) {
    case "featured":
      sorted.sort((left, right) => {
        const leftIndex = originalOrder.get(left.slug) ?? Number.MAX_SAFE_INTEGER;
        const rightIndex = originalOrder.get(right.slug) ?? Number.MAX_SAFE_INTEGER;
        return leftIndex - rightIndex;
      });
      break;
    case "price-asc":
      sorted.sort(
        (left, right) => left.price - right.price || compareProductSlugs(left.slug, right.slug)
      );
      break;
    case "price-desc":
      sorted.sort(
        (left, right) => right.price - left.price || compareProductSlugs(left.slug, right.slug)
      );
      break;
    case "name-asc":
      sorted.sort(
        (left, right) =>
          compareProductNames(left.name, right.name, "asc")
          || compareProductSlugs(left.slug, right.slug)
      );
      break;
    case "name-desc":
      sorted.sort(
        (left, right) =>
          compareProductNames(left.name, right.name, "desc")
          || compareProductSlugs(left.slug, right.slug)
      );
      break;
    default:
      break;
  }

  return sorted;
}

export function buildCatalogOriginalOrder(products: Product[]) {
  return new Map(products.map((product, index) => [product.slug, index]));
}

export function applyCatalogProductListing(
  products: Product[],
  options: CatalogListingOptions & { originalOrder?: Map<string, number> } = {}
): Product[] {
  const query = options.query ?? "";
  const sort = options.sort ?? "featured";
  const group = options.group ?? "all";
  const originalOrder = options.originalOrder ?? buildCatalogOriginalOrder(products);

  const filtered = products.filter(
    (product) => productMatchesQuery(product, query) && matchesCatalogProductGroup(product, group)
  );

  return sortCatalogProducts(filtered, sort, originalOrder);
}

/**
 * Strip below-fold / PDP-only blobs before shipping the catalog array to the client
 * listing island. Filter/sort semantics are unchanged — only RSC→client payload size.
 */
export function slimCatalogListingProducts(products: Product[]): Product[] {
  return products.map((product) => ({
    ...product,
    // Keep tax flags as concrete booleans across the RSC→client boundary.
    // `undefined` serializes as `$undefined` and can drop GST notes after hydrate.
    chargeTax: product.chargeTax !== false,
    taxIncluded: Boolean(product.taxIncluded),
    description: undefined,
    gallery: product.image ? [product.image] : [],
    hotspots: [],
    variants: [],
    bundles: [],
    story: [],
    specs: {},
    anchors: ["Overview"]
  }));
}

function isDroneMissionCategory(category: string) {
  return DRONE_WORLD_CATEGORIES.has(category) || category === SURVEY_DRONES_CATEGORY;
}
