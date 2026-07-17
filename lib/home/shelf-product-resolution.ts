import type { HomepageShelfCms } from "@/config/homepage-cms";
import { SHELF_PRODUCT_CARD_SLOTS } from "@/config/homepage-shelf";
import type { Product } from "@/config/types";
import { mapProductToReplaceItem, mapProductsToSlotItems, type ShelfSlotProductItem } from "@/lib/admin/shelf-slot-product";
import { getHomepageShelfCatalogHref } from "@/lib/catalog-categories";
import {
  filterDroneCareProducts,
  filterDroneWorldProducts,
  isDroneCareShelfProduct,
  isDroneWorldCategory,
  isGlobalProductsCategory
} from "@/lib/product-shelf-classification";

export type HomepageShelfId = "drone-world" | "drone-care" | "global-products";

export type ProductShelfConfig = {
  id: HomepageShelfId;
  eyebrow: string;
  title: string;
  href: string;
  viewAllLabel: string;
  productFilter: (product: Product) => boolean;
  featurePriority: string[];
  featureExclude: string[];
  testId: string;
  heroEyebrow: string;
  heroSubtitle: string;
  heroBody: string;
  featureCta: string;
  heroCtaHref: string;
  tone: "world" | "care" | "global";
  productSlugs: string[];
  productCount: number;
};

export const CMS_SHELF_KEY_TO_ID: Record<"droneWorld" | "droneCare" | "globalProducts", HomepageShelfId> = {
  droneWorld: "drone-world",
  droneCare: "drone-care",
  globalProducts: "global-products"
};

export function shelfCategoryHintForShelfKey(shelfKey: keyof typeof CMS_SHELF_KEY_TO_ID) {
  switch (shelfKey) {
    case "droneWorld":
      return "Agri Drones";
    case "droneCare":
      return "Accessories";
    case "globalProducts":
      return "Global Products";
  }
}

const droneWorldProductFilter = (product: Product) => isDroneWorldCategory(product);
const droneCareProductFilter = (product: Product) => isDroneCareShelfProduct(product);
const globalProductFilter = (product: Product) => isGlobalProductsCategory(product);

const baseShelfConfigs: Record<HomepageShelfId, Omit<ProductShelfConfig, "productSlugs" | "productCount" | "eyebrow" | "title" | "heroEyebrow" | "heroSubtitle" | "heroBody" | "featureCta">> = {
  "drone-world": {
    id: "drone-world",
    href: getHomepageShelfCatalogHref("drone-world"),
    viewAllLabel: "View All",
    productFilter: droneWorldProductFilter,
    featurePriority: ["drone", "uav", "kisan", "sprayer", "seed spreader"],
    featureExclude: ["controller", "flight controller", "propeller", "battery", "cable", "connector", "sensor", "motor", "frame", "hpc"],
    testId: "drone-world-shelf",
    heroCtaHref: getHomepageShelfCatalogHref("drone-world"),
    tone: "world"
  },
  "drone-care": {
    id: "drone-care",
    href: getHomepageShelfCatalogHref("drone-care"),
    viewAllLabel: "View All",
    productFilter: droneCareProductFilter,
    featurePriority: ["battery", "propeller", "controller", "gimbal", "filter", "care", "spare"],
    featureExclude: [],
    testId: "drone-care-shelf",
    heroCtaHref: getHomepageShelfCatalogHref("drone-care"),
    tone: "care"
  },
  "global-products": {
    id: "global-products",
    href: getHomepageShelfCatalogHref("global-products"),
    viewAllLabel: "View All",
    productFilter: globalProductFilter,
    featurePriority: ["drone", "survey", "surveillance", "mapping", "industrial", "system"],
    featureExclude: ["cable", "connector", "propeller", "battery", "motor", "frame"],
    testId: "global-products-shelf",
    heroCtaHref: getHomepageShelfCatalogHref("global-products"),
    tone: "global"
  }
};

export function productShelfSearchText(product: Product) {
  return [
    product.name,
    product.tagline,
    product.category,
    ...product.interests,
    product.badge ?? "",
    product.specs["Product ID"] ?? ""
  ].join(" ").toLowerCase();
}

function textHasAny(text: string, values: string[]) {
  return values.some((value) => text.includes(value.toLowerCase()));
}

export function pickFeatureProduct(products: Product[], config: ProductShelfConfig) {
  const fallback = products[0];
  if (!fallback) return undefined;

  const eligible = products.filter((product) => !textHasAny(productShelfSearchText(product), config.featureExclude));
  const candidates = eligible.length ? eligible : products;
  return candidates.find((product) => textHasAny(productShelfSearchText(product), config.featurePriority)) ?? candidates[0] ?? fallback;
}

export function pickShelfProducts(products: Product[], config: ProductShelfConfig, count = config.productCount || 5) {
  if (config.productSlugs.length) {
    const assigned = config.productSlugs
      .map((slug) => products.find((product) => product.slug === slug))
      .filter((product): product is Product => Boolean(product));
    if (assigned.length) return assigned.slice(0, count);
  }

  const selected = products.filter(config.productFilter);
  const pool = selected.length
    ? selected
    : config.tone === "care"
      ? filterDroneCareProducts(products)
      : config.tone === "global"
        ? []
        : filterDroneWorldProducts(products);
  const feature = pickFeatureProduct(pool, config);
  if (!feature) return [];
  const remaining = pool.filter((product) => product.slug !== feature.slug);
  return [feature, ...remaining].slice(0, count);
}

export function buildShelfProductConfig(shelfId: HomepageShelfId, cmsShelf: HomepageShelfCms): ProductShelfConfig {
  const base = baseShelfConfigs[shelfId];
  return {
    ...base,
    eyebrow: cmsShelf.eyebrow || base.id,
    title: cmsShelf.title,
    viewAllLabel: cmsShelf.viewAllLabel,
    heroEyebrow: cmsShelf.heroEyebrow,
    heroSubtitle: cmsShelf.heroSubtitle,
    heroBody: cmsShelf.heroBody,
    featureCta: cmsShelf.featureCta,
    heroCtaHref: cmsShelf.heroCtaHref || base.heroCtaHref,
    productSlugs: cmsShelf.productSlugs,
    productCount: cmsShelf.productCount || 5
  };
}

export function resolveEffectiveShelfProducts(
  shelfId: HomepageShelfId,
  cmsShelf: HomepageShelfCms,
  products: Product[],
  slotCount = SHELF_PRODUCT_CARD_SLOTS
): Product[] {
  const config = buildShelfProductConfig(shelfId, cmsShelf);
  if (cmsShelf.productSlugs.length) {
    const assigned = cmsShelf.productSlugs
      .map((slug) => products.find((product) => product.slug === slug))
      .filter((product): product is Product => Boolean(product));
    if (assigned.length) return assigned.slice(0, slotCount);
  }
  return pickShelfProducts(products, config, slotCount).slice(0, slotCount);
}

export function resolveEffectiveShelfSlugs(
  shelfId: HomepageShelfId,
  cmsShelf: HomepageShelfCms,
  products: Product[],
  slotCount = SHELF_PRODUCT_CARD_SLOTS
): string[] {
  const resolved = resolveEffectiveShelfProducts(shelfId, cmsShelf, products, slotCount);
  const slugs = resolved.map((product) => product.slug);
  return Array.from({ length: slotCount }, (_, index) => slugs[index] ?? "");
}

export function padShelfSlugs(slugs: string[], slotCount = SHELF_PRODUCT_CARD_SLOTS) {
  return Array.from({ length: slotCount }, (_, index) => slugs[index] ?? "");
}

export function resolveEffectiveShelfSlotItems(
  shelfId: HomepageShelfId,
  cmsShelf: HomepageShelfCms,
  products: Product[],
  slotCount = SHELF_PRODUCT_CARD_SLOTS
): ShelfSlotProductItem[] {
  return mapProductsToSlotItems(resolveEffectiveShelfProducts(shelfId, cmsShelf, products, slotCount));
}

export function resolveEffectiveShelfSlotItemsPadded(
  shelfId: HomepageShelfId,
  cmsShelf: HomepageShelfCms,
  products: Product[],
  slotCount = SHELF_PRODUCT_CARD_SLOTS
): Array<ShelfSlotProductItem | null> {
  const slugs = resolveEffectiveShelfSlugs(shelfId, cmsShelf, products, slotCount);
  const resolved = resolveEffectiveShelfProducts(shelfId, cmsShelf, products, slotCount);
  const bySlug = new Map(resolved.map((product) => [product.slug, mapProductToReplaceItem(product)]));
  return slugs.map((slug) => (slug ? bySlug.get(slug) ?? null : null));
}

export { mapProductToReplaceItem, mapProductsToSlotItems } from "@/lib/admin/shelf-slot-product";
export type { ShelfSlotProductItem } from "@/lib/admin/shelf-slot-product";
