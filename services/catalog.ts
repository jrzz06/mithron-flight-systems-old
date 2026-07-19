import { cache } from "react";
import { readThroughCache, withSingleFlight, REDIS_CACHE_KEYS, setCachedJson } from "@/lib/cache-redis";
import { rankYouMayAlsoLikeCandidates } from "@/lib/product-you-may-also-like";
import { resolveCatalogPricing } from "@/lib/catalog-pricing";
import type { Bundle, MediaAsset, Product, ProductVariant, StorySection } from "@/config/types";
import { getProductMarketingTagline } from "@/lib/product-marketing-copy";
import { clipProductPreviewText } from "@/lib/product-preview-text";
import {
  classifyProductShelf,
  filterDroneCareProducts,
  filterDroneWorldProducts,
  type ProductShelfInput
} from "@/lib/product-shelf-classification";
import {
  catalogCategoryDefinitions,
  filterProductsForCategorySlug,
  getCatalogCategoryDefinition,
  isCatalogCategorySlug,
  type CatalogCategorySlug
} from "@/lib/catalog-categories";
import { dedupeProductsBySlug } from "@/lib/catalog-shelf-layout";
import { resolveCatalogCardImage } from "@/lib/media/catalog-card-image";
import {
  getFeaturedFromCatalogIndex,
  searchCatalogIndex,
  type CatalogSearchIndexEntry
} from "@/lib/catalog-search-index";
import { isTypesenseSearchEnabled } from "@/lib/search/search-provider";
import { searchCatalogProductsTypesense } from "@/lib/search/typesense-adapter";
import {
  fieldsFromCatalogRow,
  queryMatchesProductFields
} from "@/lib/product-search-engine";
import {
  mergeSearchResultsBySlug,
  MIN_SEARCH_QUERY_LENGTH,
  SEARCH_SECONDARY_MIN_TOKEN,
  SEARCH_TERTIARY_MIN_TOKEN,
  tokenizeSearchQuery
} from "@/lib/search-query";
import { canonicalizeSpecRecord, formatAvailability, isSpecLikeBlob, parseInlineSpecPairs } from "@/lib/product-spec-text";
import { customerFacingAvailability } from "@/services/inventory-csv";
import { availabilityLabelFromQuantity, getInventoryQuantitiesBySlug } from "@/services/inventory";
import type { OrderCatalogProduct } from "@/services/orders";
import { resolveStorefrontSrc } from "@/lib/media/resolve-storefront-src";
import { buildProductResponsiveAsset } from "@/lib/media/product-responsive";
import { resolveStorefrontBadgeText, resolveStorefrontProductBadge } from "@/lib/product-badge";

export type CatalogDataErrorCode = "missing_source_image" | "catalog_unavailable";

export type CatalogDataError = {
  code: CatalogDataErrorCode;
  slug: string;
  message: string;
};

export type EnterpriseMenuLoadResult = {
  products: Product[];
  errors: CatalogDataError[];
};

export type ProductPageLoadResult =
  | { status: "ready"; product: Product }
  | { status: "not_found" }
  | { status: "error"; error: CatalogDataError };

type JsonRecord = Record<string, unknown>;

type MithronProductRow = {
  slug: string;
  product_url: string | null;
  workflow_status: "draft" | "pending_review" | "published" | "rejected" | "archived" | null;
  published_at: string | null;
  archived_at: string | null;
  is_visible: boolean | null;
  name: string;
  tagline: string | null;
  seo_title: string | null;
  seo_description: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image: JsonRecord | null;
  price: number | string | null;
  compare_at: number | string | null;
  badge: string | null;
  badge_enabled: boolean | null;
  badge_text: string | null;
  badge_style: string | null;
  description: string | null;
  on_sale: boolean | null;
  discount_type: "percent" | "amount" | null;
  discount_value: number | string | null;
  cost_of_goods: number | string | null;
  show_price_per_unit: boolean | null;
  charge_tax: boolean | null;
  tax_group: string | null;
  tax_rate: number | string | null;
  tax_included: boolean | null;
  category: string;
  interests: string[] | null;
  image: JsonRecord | null;
  hero: JsonRecord | null;
  gallery: JsonRecord[] | null;
  hotspots: Product["hotspots"] | null;
  variants: ProductVariant[] | null;
  bundles: Bundle[] | null;
  story: StorySection[] | null;
  specs: Record<string, string> | null;
  anchors: string[] | null;
  sort_order: number | null;
  source_url: string | null;
  source_catalog_id: string | null;
  source_description: string | null;
  source_images: Array<{ src?: string; width?: number | null; height?: number | null }> | null;
  source_availability: string | null;
  source_currency: string | null;
};

type SourceImageRecord = { src?: string; width?: number | string | null; height?: number | string | null };
type ProductAffinityRow = Pick<MithronProductRow, "slug" | "category" | "interests" | "price">;

type MithronProductShellRow = Pick<
  MithronProductRow,
  "slug" | "name" | "tagline" | "price" | "badge" | "badge_enabled" | "badge_text" | "badge_style" | "category" | "interests" | "image" | "hero" | "gallery" | "source_catalog_id" | "source_description" | "source_images"
>;

type EnterpriseMenuProductRow = Pick<
  MithronProductRow,
  "slug" | "name" | "tagline" | "price" | "badge" | "badge_enabled" | "badge_text" | "badge_style" | "category" | "interests" | "image" | "source_catalog_id" | "source_description" | "source_images"
>;

type ProductMediaLinkRow = {
  product_slug: string | null;
  media_asset_id: string | null;
  usage: string | null;
  variant_id: string | null;
  is_primary: boolean | null;
  sort_order: number | null;
  alt_text: string | null;
  caption: string | null;
};

type MediaAssetRow = {
  id: string | null;
  bucket?: string | null;
  storage_path?: string | null;
  public_url: string | null;
  mime_type: string | null;
  width: number | string | null;
  height: number | string | null;
  alt: string | null;
  alt_text: string | null;
  caption: string | null;
  thumbnail_path?: string | null;
  webp_path?: string | null;
  variants?: unknown;
  responsive_variants?: unknown;
};

const MEDIA_ASSET_SELECT =
  "id,bucket,storage_path,public_url,mime_type,width,height,alt,alt_text,caption,responsive_variants,variants";
const MEDIA_ASSET_CHUNK_SIZE = 20;

export type ProductShellItem = {
  slug: string;
  name: string;
  tagline: string;
  price: number;
  badge?: string;
  category: string;
  interests: string[];
  image: MediaAsset;
  searchText: string;
};

export type CatalogSearchResult = {
  slug: string;
  name: string;
  tagline: string;
  price: number;
  badge?: string;
  category: string;
  image: MediaAsset;
  availability?: string;
};

export type { CatalogSearchIndexEntry } from "@/lib/catalog-search-index";

type CatalogSearchIndexRow = Omit<
  Pick<
    MithronProductRow,
    | "slug"
    | "name"
    | "tagline"
    | "price"
    | "badge"
    | "badge_enabled"
    | "badge_text"
    | "badge_style"
    | "category"
    | "interests"
    | "image"
    | "source_catalog_id"
    | "source_availability"
    | "sort_order"
  >,
  never
> & {
  source_description?: string | null;
};

type CatalogSearchRow = {
  slug: string;
  name: string;
  tagline: string | null;
  price: number | string | null;
  badge: string | null;
  badge_enabled: boolean | null;
  badge_text: string | null;
  badge_style: string | null;
  category: string;
  image: JsonRecord | null;
  hero: JsonRecord | null;
  description?: string | null;
  source_description?: string | null;
  source_catalog_id?: string | null;
  interests?: string[] | null;
  anchors?: string[] | null;
  specs?: Record<string, string> | null;
  source_availability?: string | null;
  rank?: number | null;
};

const homepageProductSelect = [
  "slug",
  "product_url",
  "workflow_status",
  "published_at",
  "archived_at",
  "is_visible",
  "name",
  "tagline",
  "price",
  "compare_at",
  "badge",
  "badge_enabled",
  "badge_text",
  "badge_style",
  "category",
  "interests",
  "image",
  "hero",
  "source_catalog_id",
  "source_description",
  "source_availability",
  "source_currency",
  "source_url",
  "sort_order"
].join(",");

const HOMEPAGE_PRODUCT_LIMIT = 80;
const CATALOG_PAGE_SIZE = 200;
const CATALOG_MAX_ROWS = 10_000;
const CATALOG_SEARCH_INDEX_LIMIT = 800;
const CATALOG_SHOWROOM_LIMIT = 560;
const CATALOG_CATEGORY_MAX_ROWS = 500;
const CATALOG_INTEREST_LIMIT = 500;
/** @deprecated Bounded legacy scan — prefer targeted catalog loaders. */
const CATALOG_LEGACY_LIST_LIMIT = 500;
const SHELL_PREVIEW_LIMIT = 120;
const ENTERPRISE_MENU_PER_CATEGORY_LIMIT = 16;
const PRODUCT_MEDIA_LIMIT = 2000;
const CHECKOUT_PRICING_SELECT = "slug,name,price,compare_at,on_sale,discount_type,discount_value,category,charge_tax,tax_group,tax_rate,tax_included";
const CART_PRICING_SELECT =
  "slug,name,price,compare_at,on_sale,discount_type,discount_value,category,charge_tax,tax_group,tax_rate,tax_included,bundles,image,specs";
/** Slim index fields only — heavy blobs (description/hero/specs) load on PDP, not search. */
const catalogSearchIndexSelect = "slug,name,tagline,price,badge,badge_enabled,badge_text,badge_style,category,interests,image,source_catalog_id,source_availability,sort_order";
import { publishedCatalogFilter } from "@/lib/catalog/filters";

const enterpriseMenuSelect = [
  "slug",
  "name",
  "tagline",
  "price",
  "badge",
  "badge_enabled",
  "badge_text",
  "badge_style",
  "category",
  "interests",
  "image",
  "source_images",
  "source_catalog_id",
  "source_description"
].join(",");

const catalogListSelect = [
  "slug",
  "product_url",
  "workflow_status",
  "published_at",
  "archived_at",
  "is_visible",
  "name",
  "tagline",
  "price",
  "compare_at",
  "badge",
  "badge_enabled",
  "badge_text",
  "badge_style",
  "category",
  "interests",
  "image",
  "hero",
  "sort_order",
  "source_catalog_id",
  "source_availability",
  "source_currency"
].join(",");

const productSelect = [
  "slug",
  "product_url",
  "workflow_status",
  "published_at",
  "archived_at",
  "is_visible",
  "name",
  "tagline",
  "seo_title",
  "seo_description",
  "og_title",
  "og_description",
  "og_image",
  "price",
  "compare_at",
  "badge",
  "badge_enabled",
  "badge_text",
  "badge_style",
  "description",
  "on_sale",
  "discount_type",
  "discount_value",
  "cost_of_goods",
  "show_price_per_unit",
  "charge_tax",
  "tax_group",
  "tax_rate",
  "tax_included",
  "category",
  "interests",
  "image",
  "hero",
  "gallery",
  "hotspots",
  "variants",
  "bundles",
  "story",
  "specs",
  "anchors",
  "sort_order",
  "source_url",
  "source_catalog_id",
  "source_description",
  "source_images",
  "source_availability",
  "source_currency"
].join(",");

/**
 * Core PDP / card fields without below-fold JSON blobs (gallery, hotspots, variants, bundles, story).
 * PDP first paint currently needs gallery + variants + bundles via productSelect — leave loadProductForPage
 * on productSelect this pass. Prefer productCoreSelect for summary/core-cache paths.
 */
const productCoreSelect = [
  "slug",
  "product_url",
  "workflow_status",
  "published_at",
  "archived_at",
  "is_visible",
  "name",
  "tagline",
  "seo_title",
  "seo_description",
  "og_title",
  "og_description",
  "og_image",
  "price",
  "compare_at",
  "badge",
  "badge_enabled",
  "badge_text",
  "badge_style",
  "description",
  "on_sale",
  "discount_type",
  "discount_value",
  "cost_of_goods",
  "show_price_per_unit",
  "charge_tax",
  "tax_group",
  "tax_rate",
  "tax_included",
  "category",
  "interests",
  "image",
  "hero",
  "specs",
  "anchors",
  "sort_order",
  "source_url",
  "source_catalog_id",
  "source_description",
  "source_images",
  "source_availability",
  "source_currency"
].join(",");

function decodeHtml(value: string) {
  return value
    .replace(/&#009;/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCatalogRows<T>(text: string): T[] {
  try {
    return JSON.parse(text) as T[];
  } catch (error) {
    const sanitized = text.replace(/[\u0000-\u001F]/g, " ");
    if (sanitized === text) throw error;
    try {
      return JSON.parse(sanitized) as T[];
    } catch (sanitizedError) {
      const message = sanitizedError instanceof Error ? sanitizedError.message : String(sanitizedError);
      throw new Error(`Failed to parse mithron_products catalog response after control-character cleanup: ${message}`);
    }
  }
}

function cleanText(value: unknown, fallback = "") {
  return decodeHtml(typeof value === "string" ? value : fallback);
}

/** Keep editor HTML intact for storefront rich-text rendering (do not strip tags). */
function preserveDescriptionHtml(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function toNumber(value: number | string | null | undefined) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

const minimumTrustedCatalogImageEdge = 720;

function parseFiniteDimension(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : undefined;
}

function normalizeProductImageSrc(src: string) {
  return resolveStorefrontSrc(src);
}

function isSupabaseStorageSrc(src: string) {
  return /^https?:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\//i.test(src);
}

function isExternalHttpsSrc(src: string) {
  return /^https:\/\//i.test(src.trim());
}

function trustedCatalogDimensions(rawSrc: string, width: unknown, height: unknown) {
  const parsedWidth = parseFiniteDimension(width);
  const parsedHeight = parseFiniteDimension(height);
  if (!parsedWidth || !parsedHeight) return { width: undefined, height: undefined };

  const largestEdge = Math.max(parsedWidth, parsedHeight);
  if (largestEdge < minimumTrustedCatalogImageEdge) {
    return { width: undefined, height: undefined };
  }

  return { width: parsedWidth, height: parsedHeight };
}

function mediaArea(asset: MediaAsset) {
  return (asset.width ?? 0) * (asset.height ?? 0);
}

function mediaQualityScore(asset: MediaAsset, index: number) {
  const area = mediaArea(asset);
  const sourceRank = asset.src.includes("/storage/v1/object/public/")
    ? 3
    : asset.src.startsWith("/")
      ? 2
      : isExternalHttpsSrc(asset.src)
        ? 1.5
        : 1;
  return area + sourceRank * 10_000 - index;
}

function mediaFromJson(value: JsonRecord | undefined | null, fallbackAlt: string): MediaAsset | null {
  const src = typeof value?.src === "string" ? value.src.trim() : null;
  if (!src) return null;
  const record = value as JsonRecord;
  const dimensions = trustedCatalogDimensions(src, record.width, record.height);
  const normalizedSrc = normalizeProductImageSrc(src);
  return {
    id: typeof record.id === "string" ? record.id : undefined,
    src: normalizedSrc,
    alt: cleanText(record.alt, fallbackAlt),
    kind: record.kind === "video" || record.kind === "model" ? record.kind : "image",
    width: dimensions.width,
    height: dimensions.height,
    poster: typeof record.poster === "string" ? record.poster : undefined,
    local: typeof record.local === "boolean" ? record.local : normalizedSrc.startsWith("/")
  };
}

function mediaFromSourceImage(image: SourceImageRecord | undefined, alt: string): MediaAsset | null {
  if (!image || typeof image.src !== "string") return null;
  const src = image.src.trim();
  if (!src) return null;
  const dimensions = trustedCatalogDimensions(src, image.width, image.height);
  const normalizedSrc = normalizeProductImageSrc(src);
  return {
    src: normalizedSrc,
    alt,
    kind: "image",
    width: dimensions.width,
    height: dimensions.height,
    local: normalizedSrc.startsWith("/")
  };
}

function enrichImageWithLinkedResponsive(image: MediaAsset, linked?: MediaAsset): MediaAsset {
  if (!linked?.responsive || image.responsive) return image;
  const normalizedImageSrc = image.src.split("?")[0];
  const normalizedLinkedSrc = linked.src.split("?")[0];
  if (normalizedImageSrc === normalizedLinkedSrc) {
    return { ...image, responsive: linked.responsive };
  }
  return image;
}

function normalizeProductCardImage(image: MediaAsset): MediaAsset {
  const hydrated = image;
  const normalized = resolveCatalogCardImage(hydrated);
  if (normalized.src === hydrated.src && normalized.alt === hydrated.alt) {
    return hydrated;
  }
  return { ...hydrated, src: normalized.src, alt: normalized.alt };
}

// Only the primary image was getting responsive/WebP delivery via the linked
// media-asset lookup; gallery entries 2-N rendered straight from the raw JSON
// `src` with no responsive variants. Match each gallery item against the
// `product_media_assets` (usage=gallery) rows for the same product by src so
// every uploaded image - not just the first - gets responsive delivery.
function enrichGalleryWithLinkedResponsive(gallery: MediaAsset[], linkedGalleryMedia?: MediaAsset[]): MediaAsset[] {
  if (!linkedGalleryMedia?.length) return gallery;
  return gallery.map((item) => enrichImageWithLinkedResponsive(item, linkedGalleryMedia.find((linked) => {
    if (!linked.responsive) return false;
    return linked.src.split("?")[0] === item.src.split("?")[0];
  })));
}

function normalizeMediaAssetRow(row: MediaAssetRow): MediaAssetRow {
  return {
    ...row,
    responsive_variants: row.responsive_variants ?? row.variants
  };
}

function mediaFromMediaAssetRow(row: MediaAssetRow | undefined, fallbackAlt: string): MediaAsset | null {
  if (!row) return null;
  const normalizedRow = normalizeMediaAssetRow(row);
  const src = typeof normalizedRow.public_url === "string" ? normalizedRow.public_url.trim() : "";
  if (!src) return null;
  const storagePath = typeof normalizedRow.storage_path === "string" ? normalizedRow.storage_path : "";
  const isCatalogCutout = storagePath.includes("catalog-cutouts/v1/") || src.includes("/catalog-cutouts/v1/");
  const rowWidth = isCatalogCutout && !normalizedRow.width ? 1024 : normalizedRow.width;
  const rowHeight = isCatalogCutout && !normalizedRow.height ? 1024 : normalizedRow.height;
  const dimensions = trustedCatalogDimensions(src, rowWidth, rowHeight);
  if (!dimensions.width || !dimensions.height) return null;
  const kind = normalizedRow.mime_type?.startsWith("video/") ? "video" : "image";
  const responsive = buildProductResponsiveAsset(normalizedRow, fallbackAlt, process.env.NEXT_PUBLIC_SUPABASE_URL);

  return {
    id: typeof normalizedRow.id === "string" ? normalizedRow.id : undefined,
    src,
    alt: cleanText(normalizedRow.alt_text ?? normalizedRow.alt ?? normalizedRow.caption, fallbackAlt),
    kind,
    width: dimensions.width,
    height: dimensions.height,
    local: false,
    responsive
  };
}

function selectPrimaryProductImage(row: Pick<MithronProductRow, "image" | "hero" | "gallery" | "source_images">, alt: string) {
  const candidates = [
    mediaFromJson(row.image, alt),
    mediaFromJson(row.hero, alt),
    ...(row.gallery ?? []).map((item) => mediaFromJson(item, alt)),
    ...(row.source_images ?? []).map((item) => mediaFromSourceImage(item, alt))
  ].filter((item): item is MediaAsset => Boolean(item));

  return candidates
    .map((asset, index) => ({ asset, score: mediaQualityScore(asset, index) }))
    .sort((left, right) => right.score - left.score)[0]?.asset ?? null;
}

function dedupeMediaAssets(items: MediaAsset[]) {
  return items.filter((item, index, list) => list.findIndex((candidate) => candidate.src === item.src) === index);
}

function postgrestIn(values: string[]) {
  return `in.(${values.map((value) => `"${value.replace(/"/g, "\"\"")}"`).join(",")})`;
}

function rankCatalogCutoutLink(
  link: ProductMediaLinkRow,
  slug: string,
  storagePath: string
) {
  const path = storagePath.toLowerCase();
  const normalizedSlug = slug.toLowerCase().replace(/^source-/, "");
  let score = link.sort_order ?? 0;

  if (!path.includes("/source-") && path.includes(`/${normalizedSlug}-`)) score -= 200;
  else if (!path.includes("/source-") && path.includes(normalizedSlug)) score -= 150;
  else if (path.includes(`/${slug.toLowerCase()}-`)) score -= 100;
  else if (path.includes(normalizedSlug)) score -= 60;

  if (path.includes("/source-")) score += 50;
  if (path.includes("variants")) score += 20;

  return score;
}

function pickBestCatalogCutoutLinks(
  links: ProductMediaLinkRow[],
  mediaById: Map<string, MediaAssetRow>
) {
  const bestBySlug = new Map<string, ProductMediaLinkRow>();

  for (const link of links) {
    if (!link.product_slug || !link.media_asset_id) continue;
    const storagePath = mediaById.get(link.media_asset_id)?.storage_path ?? "";
    const current = bestBySlug.get(link.product_slug);
    if (!current) {
      bestBySlug.set(link.product_slug, link);
      continue;
    }

    const currentPath = mediaById.get(current.media_asset_id ?? "")?.storage_path ?? "";
    if (
      rankCatalogCutoutLink(link, link.product_slug, storagePath)
      < rankCatalogCutoutLink(current, link.product_slug, currentPath)
    ) {
      bestBySlug.set(link.product_slug, link);
    }
  }

  return [...bestBySlug.values()];
}

async function overlayLiveInventoryAvailability<T extends { slug: string; source_availability?: string | null }>(
  rows: T[],
  options?: { freshness?: "catalog" | "checkout" }
): Promise<T[]> {
  const slugs = rows.map((row) => row.slug).filter(Boolean);
  if (!slugs.length) return rows;
  const quantities = await getInventoryQuantitiesBySlug(slugs, process.env, {
    freshness: options?.freshness ?? "catalog"
  });
  return rows.map((row) => {
    const entry = quantities.get(row.slug);
    if (!entry) return row;
    return { ...row, source_availability: availabilityLabelFromQuantity(entry.quantity) };
  });
}

function chunkItems<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

const PLACEHOLDER_VARIANT_IDS = new Set(["csv-stock", "source", "default", "stock"]);
const PLACEHOLDER_VARIANT_NAMES = /^(csv\s*stock(\s*row)?|source\s*listing|default|in\s*stock)$/i;

function isPlaceholderVariant(variant: ProductVariant) {
  return PLACEHOLDER_VARIANT_IDS.has(variant.id.trim().toLowerCase())
    || PLACEHOLDER_VARIANT_NAMES.test(cleanText(variant.name).trim());
}

function normalizeVariant(row: MithronProductRow): ProductVariant[] {
  const variants = row.variants?.filter((variant) => !isPlaceholderVariant(variant)) ?? [];
  if (variants.length) return variants;

  const availability = customerFacingAvailability(row.source_availability);
  return [{ id: "availability", name: availability, tone: "#16a34a" }];
}

function normalizeBundleDescription(value: string, fallback: string) {
  const raw = cleanText(value, fallback);
  if (isSpecLikeBlob(raw)) return "";

  const clean = clipProductPreviewText(raw, 140);
  if (isSpecLikeBlob(clean)) return "";
  if (clean && isSpecLikeBlob(fallback)) return clean;

  const clippedFallback = clipProductPreviewText(fallback, 140);
  return clean || (isSpecLikeBlob(clippedFallback) ? "" : clippedFallback);
}

function normalizeBundles(row: MithronProductRow, description: string): Bundle[] {
  const pricing = resolveCatalogPricing(row);
  const salePrice = pricing.salePrice;
  const compareAt = pricing.compareAt ?? undefined;

  if (row.bundles?.length) {
    return row.bundles.map((bundle) => ({
      ...bundle,
      description: normalizeBundleDescription(bundle.description, description),
      price: salePrice,
      compareAt
    }));
  }

  return [{
    id: "standard",
    name: "Standard setup",
    price: salePrice,
    compareAt,
    description: isSpecLikeBlob(description) ? "" : clipProductPreviewText(description, 140),
    includes: []
  }];
}

const INTERNAL_SPEC_KEYS = new Set(["Product ID", "Source", "Currency", "Category", "Availability"]);

function countCustomerFacingSpecs(specs: Record<string, string>) {
  return Object.entries(specs).filter(([key, value]) => !INTERNAL_SPEC_KEYS.has(key) && value.trim()).length;
}

function normalizeSpecs(row: MithronProductRow) {
  const specs = canonicalizeSpecRecord(
    Object.fromEntries(Object.entries(row.specs ?? {}).map(([key, value]) => [key, cleanText(value)])),
    { preserveKeys: INTERNAL_SPEC_KEYS }
  );

  const merged: Record<string, string> = {
    "Product ID": row.source_catalog_id ?? row.slug,
    Category: row.category,
    Availability: formatAvailability(customerFacingAvailability(row.source_availability, specs.Availability ?? "Unknown")),
    Currency: row.source_currency ?? specs.Currency ?? "INR",
    ...specs,
    Source: row.source_url ?? specs.Source ?? "Mithron product database"
  };

  if (countCustomerFacingSpecs(merged) < 3) {
    const parsed = parseInlineSpecPairs(row.source_description ?? row.tagline ?? "");
    for (const [key, value] of Object.entries(parsed)) {
      if (!merged[key]?.trim()) merged[key] = value;
    }
  }

  return merged;
}

function normalizeStory(row: MithronProductRow, marketingTagline: string, hero: MediaAsset): StorySection[] {
  if (row.story?.length) {
    return row.story.map((section) => ({
      ...section,
      title: cleanText(section.title),
      body: clipProductPreviewText(cleanText(section.body), 1200),
      media: section.media ?? hero
    }));
  }

  const name = cleanText(row.name);

  return [{
    id: "overview",
    kicker: cleanText(row.category) || "Overview",
    title: name,
    body: marketingTagline,
    media: hero,
    align: "center"
  }];
}

function resolveProductImage(
  row: Pick<MithronProductRow, "image" | "hero" | "gallery" | "source_images">,
  name: string,
  linkedMedia?: MediaAsset
) {
  const rowImage = selectPrimaryProductImage(row, name);
  const supabaseRowImage = rowImage && isSupabaseStorageSrc(rowImage.src) ? rowImage : null;

  if (linkedMedia) {
    if (!linkedMedia.src.trim() && supabaseRowImage) return supabaseRowImage;
    return linkedMedia;
  }

  if (supabaseRowImage) {
    return supabaseRowImage;
  }

  return null;
}

function createMissingSourceImageError(slug: string): CatalogDataError {
  return {
    code: "missing_source_image",
    slug,
    message: `Missing source image for Mithron product ${slug}.`
  };
}

function createCatalogUnavailableError(slug: string, cause?: unknown): CatalogDataError {
  const detail = cause instanceof Error ? cause.message : undefined;
  return {
    code: "catalog_unavailable",
    slug,
    message: detail
      ? `Catalog data is temporarily unavailable for ${slug}: ${detail}`
      : `Catalog data is temporarily unavailable for ${slug}.`
  };
}

export function createNavigationCatalogUnavailableError(cause?: unknown): CatalogDataError {
  return createCatalogUnavailableError("navigation", cause);
}

function isMissingSourceImageError(error: unknown): error is Error {
  return error instanceof Error && error.message.startsWith("Missing source image for Mithron product");
}

function resolveHydratedProductImage(
  row: Pick<MithronProductRow, "image" | "hero" | "gallery" | "source_images">,
  name: string,
  linkedPrimaryImage?: MediaAsset,
  slug?: string
): MediaAsset {
  const image = resolveProductImage(row, name, linkedPrimaryImage);
  if (!image) {
    throw new Error(`Missing source image for Mithron product ${slug ?? "unknown"}.`);
  }
  return normalizeProductCardImage(enrichImageWithLinkedResponsive(image, linkedPrimaryImage));
}

function mapStorefrontBadgeFields(row: Pick<MithronProductRow, "badge_enabled" | "badge_text" | "badge_style" | "badge">): Pick<Product, "badge" | "badgeStyle"> {
  const resolved = resolveStorefrontProductBadge(row);
  return {
    badge: resolved?.text,
    badgeStyle: resolved?.style
  };
}

function mapProductRow(row: MithronProductRow, linkedPrimaryImage?: MediaAsset, linkedGalleryMedia?: MediaAsset[]): Product {
  const name = cleanText(row.name);
  const marketingTagline = getProductMarketingTagline({
    name,
    category: row.category,
    tagline: row.tagline,
    sourceDescription: row.source_description
  });
  const sourceImages = row.source_images ?? [];
  const image = resolveHydratedProductImage(row, name, linkedPrimaryImage, row.slug);

  const hero = mediaFromJson(row.hero, name) ?? image;
  const gallery = [
    image,
    ...(row.gallery ?? []).map((item) => mediaFromJson(item, name)).filter((item): item is MediaAsset => Boolean(item)),
    ...sourceImages.map((item) => mediaFromSourceImage(item, name)).filter((item): item is MediaAsset => Boolean(item))
  ];
  const dedupedGallery = enrichGalleryWithLinkedResponsive(dedupeMediaAssets(gallery), linkedGalleryMedia);
  const pricing = resolveCatalogPricing(row);

  return {
    slug: row.slug,
    productUrl: row.product_url ?? `/product/${row.slug}`,
    workflowStatus: row.workflow_status ?? "published",
    publishedAt: row.published_at ?? undefined,
    archivedAt: row.archived_at ?? undefined,
    isVisible: row.is_visible ?? true,
    name,
    tagline: marketingTagline,
    seoTitle: row.seo_title ?? undefined,
    seoDescription: row.seo_description ?? undefined,
    ogTitle: row.og_title ?? undefined,
    ogDescription: row.og_description ?? undefined,
    ogImage: mediaFromJson(row.og_image, name) ?? undefined,
    price: pricing.salePrice,
    compareAt: pricing.compareAt ?? undefined,
    ...mapStorefrontBadgeFields(row),
    description: preserveDescriptionHtml(row.description),
    sourceDescription: preserveDescriptionHtml(row.source_description),
    onSale: pricing.onSale,
    discountType: pricing.discountType ?? undefined,
    discountValue: pricing.discountValue ?? undefined,
    costOfGoods: row.cost_of_goods ? toNumber(row.cost_of_goods) : undefined,
    showPricePerUnit: row.show_price_per_unit ?? undefined,
    chargeTax: row.charge_tax ?? undefined,
    taxGroup: row.tax_group ?? undefined,
    taxRate: row.tax_rate ? toNumber(row.tax_rate) : undefined,
    taxIncluded: row.tax_included ?? undefined,
    category: row.category,
    interests: row.interests ?? [],
    image,
    hero,
    gallery: dedupedGallery.length ? dedupedGallery : [image],
    hotspots: row.hotspots ?? [],
    variants: normalizeVariant(row),
    bundles: normalizeBundles(row, marketingTagline),
    story: normalizeStory(row, marketingTagline, hero),
    specs: normalizeSpecs(row),
    anchors: row.anchors?.length ? row.anchors : ["Overview", "Specs", "FAQ"],
    sourceCatalogId: row.source_catalog_id ?? undefined
  };
}

function mapEnterpriseMenuProduct(
  row: EnterpriseMenuProductRow,
  linkedPrimaryImage: MediaAsset | undefined,
  errors: CatalogDataError[]
): Product | null {
  const name = cleanText(row.name);
  const marketingTagline = getProductMarketingTagline({
    name,
    category: row.category,
    tagline: row.tagline,
    sourceDescription: row.source_description
  });
  const image = resolveProductImage(
    { ...row, hero: null, gallery: null },
    name,
    linkedPrimaryImage
  );

  if (!image) {
    const error = createMissingSourceImageError(row.slug);
    errors.push(error);
    console.warn(`[catalog] ${error.message}`);
    return null;
  }

  const hydratedImage = normalizeProductCardImage(enrichImageWithLinkedResponsive(image, linkedPrimaryImage));

  return {
    slug: row.slug,
    productUrl: `/product/${row.slug}`,
    workflowStatus: "published",
    isVisible: true,
    name,
    tagline: marketingTagline,
    price: resolveCatalogPricing(row).salePrice,
    ...mapStorefrontBadgeFields(row),
    category: row.category,
    interests: row.interests ?? [],
    image: hydratedImage,
    hero: hydratedImage,
    gallery: [hydratedImage],
    hotspots: [],
    variants: [],
    bundles: [],
    story: [],
    specs: {},
    anchors: ["Overview"],
    sourceCatalogId: row.source_catalog_id ?? undefined
  };
}

function mapProductShellRow(row: MithronProductShellRow, linkedPrimaryImage?: MediaAsset): ProductShellItem {
  const normalizedRow = row;
  const name = cleanText(normalizedRow.name);
  const tagline = getProductMarketingTagline({
    name,
    category: normalizedRow.category,
    tagline: normalizedRow.tagline,
    sourceDescription: normalizedRow.source_description
  });
  const image = resolveHydratedProductImage(normalizedRow, name, linkedPrimaryImage, normalizedRow.slug);

  const interestsValue = normalizedRow.interests ?? [];
  return {
    slug: normalizedRow.slug,
    name,
    tagline,
    price: resolveCatalogPricing(normalizedRow).salePrice,
    badge: resolveStorefrontBadgeText(normalizedRow),
    category: normalizedRow.category,
    interests: interestsValue,
    image,
    searchText: [
      name,
      tagline,
      normalizedRow.category,
      normalizedRow.slug,
      normalizedRow.source_catalog_id ?? "",
      normalizedRow.source_description ?? "",
      ...interestsValue
    ].join(" ").toLowerCase()
  };
}

function mapProductShellRowOrNull(row: MithronProductShellRow, linkedPrimaryImage?: MediaAsset): ProductShellItem | null {
  const normalizedRow = row;
  const name = cleanText(normalizedRow.name);
  const tagline = getProductMarketingTagline({
    name,
    category: normalizedRow.category,
    tagline: normalizedRow.tagline,
    sourceDescription: normalizedRow.source_description
  });
  const resolved = resolveProductImage(normalizedRow, name, linkedPrimaryImage);
  if (!resolved) return null;

  const interestsValue = normalizedRow.interests ?? [];
  return {
    slug: normalizedRow.slug,
    name,
    tagline,
    price: resolveCatalogPricing(normalizedRow).salePrice,
    badge: resolveStorefrontBadgeText(normalizedRow),
    category: normalizedRow.category,
    interests: interestsValue,
    image: normalizeProductCardImage(enrichImageWithLinkedResponsive(resolved, linkedPrimaryImage)),
    searchText: [
      name,
      tagline,
      normalizedRow.category,
      normalizedRow.slug,
      normalizedRow.source_catalog_id ?? "",
      normalizedRow.source_description ?? "",
      ...interestsValue
    ].join(" ").toLowerCase()
  };
}

function mapSearchIndexEntry(row: CatalogSearchIndexRow): CatalogSearchIndexEntry | null {
  const item = mapProductShellRowOrNull({
    ...row,
    hero: null,
    gallery: null,
    source_images: null,
    source_description: row.source_description ?? null
  } as MithronProductShellRow);
  if (!item) return null;

  return {
    slug: item.slug,
    name: item.name,
    tagline: item.tagline,
    price: item.price,
    badge: item.badge,
    category: item.category,
    image: item.image,
    availability: customerFacingAvailability(row.source_availability),
    searchFields: fieldsFromCatalogRow(row),
    sortOrder: row.sort_order ?? Number.MAX_SAFE_INTEGER
  };
}

async function buildCatalogSearchIndexUncached(): Promise<CatalogSearchIndexEntry[]> {
  try {
    const rows = await fetchCatalogRowsWithTags<CatalogSearchIndexRow>(
      `select=${catalogSearchIndexSelect}&${publishedCatalogFilter}&order=sort_order.asc,slug.asc&limit=${CATALOG_SEARCH_INDEX_LIMIT}`,
      ["catalog", "catalog-products", "catalog-search-index"]
    );
    const index: CatalogSearchIndexEntry[] = [];

    for (const row of rows) {
      const entry = mapSearchIndexEntry(row);
      if (entry) index.push(entry);
    }

    return index;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[catalog] failed to build in-memory search index; Supabase fallback will be used: ${message}`);
    return [];
  }
}

export const getCatalogSearchIndex = cache(async (): Promise<CatalogSearchIndexEntry[]> => {
  return readThroughCache(REDIS_CACHE_KEYS.catalogSearchIndex, 120, buildCatalogSearchIndexUncached);
});

async function enrichSearchResultAvailability(results: CatalogSearchResult[]): Promise<CatalogSearchResult[]> {
  if (!results.length) return results;

  const slugs = results.map((result) => result.slug);
  const [availabilityRows, quantities] = await Promise.all([
    fetchCatalogRows<{ slug: string; source_availability: string | null }>(
      `select=slug,source_availability&slug=${postgrestIn(slugs)}&${publishedCatalogFilter}`
    ),
    getInventoryQuantitiesBySlug(slugs, process.env, { freshness: "catalog" })
  ]);
  const availabilityBySlug = new Map(
    availabilityRows.map((row) => [row.slug, row.source_availability] as const)
  );

  return results.map((result) => {
    const inventory = quantities.get(result.slug);
    if (inventory) {
      return {
        ...result,
        availability: availabilityLabelFromQuantity(inventory.quantity)
      };
    }

    const sourceAvailability = availabilityBySlug.get(result.slug);
    return {
      ...result,
      availability: result.availability ?? customerFacingAvailability(sourceAvailability)
    };
  });
}

async function searchCatalogProductsFallback(query: string, limit: number): Promise<CatalogSearchResult[]> {
  const rows = await fetchCatalogSearchRows(query, limit);
  const results = await mapSearchRowsToCatalogResults(rows);
  return enrichSearchResultAvailability(results);
}

export const getProductShellItems = cache(async (limit = SHELL_PREVIEW_LIMIT): Promise<ProductShellItem[]> => {
  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), SHELL_PREVIEW_LIMIT);
  const rows = await fetchCatalogRows<MithronProductShellRow>(
    `select=slug,name,tagline,price,badge,badge_enabled,badge_text,badge_style,category,interests,image,hero,gallery,source_images,source_catalog_id,source_description&${publishedCatalogFilter}&order=sort_order.asc&limit=${boundedLimit}`
  );
  return mapRowsWithCatalogMedia(rows, mapProductShellRow);
});

export const getFeaturedSearchProducts = cache(async (limit = 4): Promise<CatalogSearchResult[]> => {
  const index = await getCatalogSearchIndex();
  if (index.length) return getFeaturedFromCatalogIndex(index, limit);

  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 12);
  const rows = await fetchCatalogRows<MithronProductShellRow & { source_availability?: string | null }>(
    `select=slug,name,tagline,price,badge,badge_enabled,badge_text,badge_style,category,interests,image,hero,gallery,source_images,source_catalog_id,source_description,source_availability&${publishedCatalogFilter}&order=sort_order.asc&limit=${boundedLimit}`
  );
  const results: CatalogSearchResult[] = [];
  for (const row of rows) {
    const item = mapProductShellRowOrNull(row);
    if (item) results.push(toCatalogSearchResult(item, row.source_availability));
  }
  return results;
});

export const getCartDrawerSuggestions = cache(async (): Promise<CatalogSearchResult[]> => {
  return readThroughCache(REDIS_CACHE_KEYS.catalogCartSuggestions, 60, async () => {
    const rows = await fetchCatalogRows<MithronProductShellRow & { source_availability?: string | null }>(
      `select=slug,name,tagline,price,badge,badge_enabled,badge_text,badge_style,category,interests,image,hero,gallery,source_images,source_catalog_id,source_description,source_availability&${publishedCatalogFilter}&or=(interests.cs.{agriculture},interests.cs.{components})&order=sort_order.asc&limit=12`
    );
    const items = await mapRowsWithCatalogMedia(rows, mapProductShellRow);
    return items.slice(0, 3).map((item, index) => toCatalogSearchResult(item, rows[index]?.source_availability));
  });
});

export async function getCheckoutPricingBySlugs(slugs: string[]): Promise<OrderCatalogProduct[]> {
  const normalized = [...new Set(slugs.map((slug) => slug.trim()).filter(Boolean))];
  if (!normalized.length) return [];

  const inFilter = `slug=in.(${normalized.map((slug) => encodeURIComponent(slug)).join(",")})`;
  const rows = await fetchCatalogRows<
    Pick<
      MithronProductRow,
      | "slug"
      | "name"
      | "price"
      | "compare_at"
      | "on_sale"
      | "discount_type"
      | "discount_value"
      | "category"
      | "charge_tax"
      | "tax_group"
      | "tax_rate"
      | "tax_included"
    >
  >(
    `select=${CHECKOUT_PRICING_SELECT}&${inFilter}&${publishedCatalogFilter}&limit=${normalized.length}`
  );

  return rows.map((row) => {
    const pricing = resolveCatalogPricing(row);
    return {
      slug: row.slug,
      name: row.name,
      price: pricing.salePrice,
      category: row.category,
      chargeTax: row.charge_tax ?? undefined,
      taxGroup: row.tax_group,
      taxRate: row.tax_rate !== null && row.tax_rate !== undefined ? toNumber(row.tax_rate) : null,
      taxIncluded: row.tax_included ?? undefined,
      compareAt: pricing.compareAt,
      onSale: pricing.onSale,
      discountType: pricing.discountType,
      discountValue: pricing.discountValue
    };
  });
}

export async function getCartPricingByItems(
  items: Array<{ productSlug: string; bundleId: string; quantity: number; variantId?: string }>
) {
  const slugs = [...new Set(items.map((item) => item.productSlug.trim()).filter(Boolean))].sort();
  if (!slugs.length) return [];

  // Single-flight + short Redis TTL collapses flash-sale stampede on identical carts.
  // Pricing math stays in the route; this only caches catalog product rows.
  const fingerprint = slugs.join(",");
  return withSingleFlight(REDIS_CACHE_KEYS.catalogCartPricing(fingerprint), 30, async () => {
    const inFilter = `slug=in.(${slugs.map((slug) => encodeURIComponent(slug)).join(",")})`;
    const rows = await fetchCatalogRows<
      Pick<
        MithronProductRow,
        | "slug"
        | "name"
        | "price"
        | "compare_at"
        | "on_sale"
        | "discount_type"
        | "discount_value"
        | "category"
        | "charge_tax"
        | "tax_group"
        | "tax_rate"
        | "tax_included"
        | "bundles"
        | "image"
        | "specs"
      >
    >(
      `select=${CART_PRICING_SELECT}&${inFilter}&${publishedCatalogFilter}&limit=${slugs.length}`
    );

    return rows.map((row) => {
      const pricing = resolveCatalogPricing(row);
      const bundles = row.bundles?.length
        ? row.bundles.map((bundle) => ({
            ...bundle,
            price: pricing.salePrice,
            compareAt: pricing.compareAt ?? undefined
          }))
        : [{
            id: "standard",
            name: "Standard setup",
            price: pricing.salePrice,
            compareAt: pricing.compareAt ?? undefined,
            description: "",
            includes: [] as string[]
          }];

      return {
        slug: row.slug,
        name: cleanText(row.name),
        price: row.price,
        compare_at: row.compare_at,
        on_sale: row.on_sale,
        discount_type: row.discount_type,
        discount_value: row.discount_value,
        category: row.category,
        charge_tax: row.charge_tax,
        tax_group: row.tax_group,
        tax_rate: row.tax_rate,
        tax_included: row.tax_included,
        bundles,
        image: mediaFromJson(row.image, cleanText(row.name)),
        specs: row.specs ?? null
      };
    });
  });
}

export async function getRelatedProductShellItems(slug: string, limit = 4): Promise<ProductShellItem[]> {
  const currentRow = await getProductAffinityRowBySlug(slug);
  if (!currentRow) {
    const rows = await fetchCatalogRows<MithronProductShellRow>(
      `select=slug,name,tagline,price,badge,badge_enabled,badge_text,badge_style,category,interests,image,hero,gallery,source_images,source_catalog_id,source_description&${publishedCatalogFilter}&slug=neq.${encodeURIComponent(slug)}&order=sort_order.asc&limit=${limit}`
    );
    return mapRowsWithCatalogMedia(rows, mapProductShellRow);
  }

  const categoryRows = await fetchCatalogRows<MithronProductShellRow>(
    `select=slug,name,tagline,price,badge,badge_enabled,badge_text,badge_style,category,interests,image,hero,gallery,source_images,source_catalog_id,source_description&${publishedCatalogFilter}&category=eq.${encodeURIComponent(currentRow.category)}&slug=neq.${encodeURIComponent(slug)}&order=sort_order.asc&limit=${Math.max(limit * 4, 16)}`
  );
  const currentInterests = currentRow.interests ?? [];
  const shelfInputs = categoryRows as unknown as ProductShelfInput[];
  const shelfProducts = classifyProductShelf({
    slug,
    name: "",
    tagline: "",
    category: currentRow.category,
    interests: currentInterests,
    specs: {}
  }) === "drone-care"
    ? filterDroneCareProducts(shelfInputs)
    : filterDroneWorldProducts(shelfInputs);

  const related = shelfProducts.filter((product) => (
    product.slug !== slug && (
      product.category === currentRow.category ||
      product.interests.some((interest) => currentInterests.includes(interest))
    )
  ));

  const candidateRows = (related.length ? related : shelfProducts.filter((product) => product.slug !== slug))
    .slice(0, limit) as unknown as MithronProductShellRow[];

  if (!candidateRows.length) {
    const fallbackRows = await fetchCatalogRows<MithronProductShellRow>(
      `select=slug,name,tagline,price,badge,badge_enabled,badge_text,badge_style,category,interests,image,hero,gallery,source_images,source_catalog_id,source_description&${publishedCatalogFilter}&slug=neq.${encodeURIComponent(slug)}&order=sort_order.asc&limit=${limit}`
    );
    return mapRowsWithCatalogMedia(fallbackRows, mapProductShellRow);
  }

  return mapRowsWithCatalogMedia(candidateRows, mapProductShellRow);
}

export async function getYouMayAlsoLikeShellItems(slug: string, limit = 4): Promise<ProductShellItem[]> {
  const normalized = slug.trim();
  const safeLimit = Math.max(1, Math.min(12, limit));
  return readThroughCache(
    REDIS_CACHE_KEYS.productRelated(normalized, safeLimit),
    90,
    () => loadYouMayAlsoLikeShellItemsUncached(normalized, safeLimit)
  );
}

async function loadYouMayAlsoLikeShellItemsUncached(slug: string, limit: number): Promise<ProductShellItem[]> {
  // Prefer the in-request / Redis product-row cache (same as PDP) over a second affinity select.
  const productRow = await getProductRowBySlug(slug);
  const currentRow: ProductAffinityRow | null = productRow
    ? {
        slug: productRow.slug,
        category: productRow.category,
        interests: productRow.interests,
        price: productRow.price
      }
    : await getProductAffinityRowBySlug(slug);

  if (!currentRow) {
    const rows = await fetchCatalogRows<MithronProductShellRow>(
      `select=slug,name,tagline,price,badge,badge_enabled,badge_text,badge_style,category,interests,image,hero,gallery,source_images,source_catalog_id,source_description&${publishedCatalogFilter}&slug=neq.${encodeURIComponent(slug)}&order=sort_order.asc&limit=${Math.max(limit * 4, 16)}`
    );
    const mapped = await mapRowsWithCatalogMedia(rows, mapProductShellRow);
    return mapped.slice(0, limit);
  }

  const [categoryRows, broadRows] = await Promise.all([
    fetchCatalogRows<MithronProductShellRow>(
      `select=slug,name,tagline,price,badge,badge_enabled,badge_text,badge_style,category,interests,image,hero,gallery,source_images,source_catalog_id,source_description&${publishedCatalogFilter}&category=eq.${encodeURIComponent(currentRow.category)}&slug=neq.${encodeURIComponent(slug)}&order=sort_order.asc&limit=${Math.max(limit * 4, 16)}`
    ),
    fetchCatalogRows<MithronProductShellRow>(
      `select=slug,name,tagline,price,badge,badge_enabled,badge_text,badge_style,category,interests,image,hero,gallery,source_images,source_catalog_id,source_description&${publishedCatalogFilter}&slug=neq.${encodeURIComponent(slug)}&order=sort_order.asc&limit=${Math.max(limit * 6, 24)}`
    )
  ]);

  const mergedRows = [...categoryRows, ...broadRows].filter((row, index, rows) => (
    rows.findIndex((candidate) => candidate.slug === row.slug) === index
  ));
  const candidates = await mapRowsWithCatalogMedia(mergedRows, mapProductShellRow);

  return rankYouMayAlsoLikeCandidates(
    {
      slug,
      category: currentRow.category,
      interests: currentRow.interests ?? [],
      price: Number(currentRow.price ?? 0)
    },
    candidates,
    limit
  );
}

function getCatalogConfig(useServiceRole = false) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (useServiceRole && !serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for privileged catalog reads.");
  }
  const key = useServiceRole ? serviceRoleKey! : publicKey;

  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required for the product catalog.");
  }

  return { url, key, hasServiceRoleKey: Boolean(serviceRoleKey) };
}

const catalogFetchAttempts = 3;
const catalogFetchTimeoutMs = 7_000;
const catalogFetchBudgetMs = 9_000;
const catalogBackoffBaseMs = 300;
const catalogRetryAfterCapMs = 3_000;

function isRetryableFetchError(error: unknown) {
  if (!(error instanceof Error)) return true;
  const message = error.message.toLowerCase();
  const cause = (error as Error & { cause?: { code?: string } }).cause;
  const causeCode = cause?.code ?? "";
  return (
    message.includes("fetch failed")
    || message.includes("timed out")
    || message.includes("abort")
    || causeCode === "UND_ERR_CONNECT_TIMEOUT"
    || causeCode === "UND_ERR_SOCKET"
    || causeCode === "ECONNRESET"
    || causeCode === "ETIMEDOUT"
  );
}

function isRetryableCatalogServerStatus(status: number) {
  return status === 408 || status >= 500;
}

function isCatalogTimeoutError(error: unknown) {
  return error instanceof Error && (error.name === "AbortError" || /timed out/i.test(error.message));
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffWithJitter(base: number, attempt: number) {
  return base * Math.pow(2, attempt - 1) + Math.random() * base;
}

function parseRetryAfterMs(header: string | null, maxMs = catalogRetryAfterCapMs): number | null {
  if (!header) return null;
  const asSeconds = Number(header);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return Math.min(maxMs, asSeconds * 1000);
  }
  const asDate = Date.parse(header);
  if (Number.isFinite(asDate)) {
    return Math.min(maxMs, Math.max(0, asDate - Date.now()));
  }
  return null;
}

async function fetchSupabaseRows<T>(
  table: string,
  query: string,
  useServiceRole = false,
  cacheTags: string[] = ["catalog", "catalog-products"]
): Promise<T[]> {
  const { url, key } = getCatalogConfig(useServiceRole);

  let lastError: unknown;
  let timeoutRetries = 0;
  let rateLimitRetries = 0;
  const deadlineAt = Date.now() + catalogFetchBudgetMs;

  for (let attempt = 1; attempt <= catalogFetchAttempts; attempt += 1) {
    if (Date.now() > deadlineAt) {
      lastError = new Error(`Catalog fetch budget exceeded (${catalogFetchBudgetMs}ms) for ${table}`);
      break;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), catalogFetchTimeoutMs);

    try {
      const response = await fetch(`${url}/rest/v1/${table}?${query}`, {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`
        },
        signal: controller.signal,
        next: { revalidate: 60, tags: cacheTags }
      });

      if (!response.ok) {
        const error = new Error(`Failed to load ${table} from Supabase: ${response.status} ${response.statusText}`);
        if (response.status === 429) {
          if (rateLimitRetries < 1) {
            rateLimitRetries += 1;
            lastError = error;
            const retryAfterMs = parseRetryAfterMs(response.headers.get("Retry-After"));
            await wait(retryAfterMs ?? backoffWithJitter(catalogBackoffBaseMs, attempt));
            continue;
          }
          throw error;
        }
        if (attempt < catalogFetchAttempts && isRetryableCatalogServerStatus(response.status)) {
          lastError = error;
          await wait(backoffWithJitter(catalogBackoffBaseMs, attempt));
          continue;
        }
        throw error;
      }

      return parseCatalogRows<T>(await response.text());
    } catch (error) {
      lastError = error instanceof Error && error.name === "AbortError"
        ? new Error(`Timed out loading ${table} from Supabase after ${catalogFetchTimeoutMs}ms`)
        : error;

      if (!isRetryableFetchError(lastError)) break;

      const isTimeout = isCatalogTimeoutError(lastError);
      if (isTimeout) {
        if (timeoutRetries >= 1) break;
        timeoutRetries += 1;
      } else if (attempt >= catalogFetchAttempts) {
        break;
      }

      await wait(backoffWithJitter(catalogBackoffBaseMs, attempt));
    } finally {
      clearTimeout(timeout);
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Failed to load ${table} from Supabase after ${catalogFetchAttempts} attempts: ${message}`);
}

async function fetchCatalogRows<T>(query: string): Promise<T[]> {
  return fetchSupabaseRows<T>("mithron_products", query);
}

async function fetchCatalogRowsWithTags<T>(query: string, cacheTags: string[]): Promise<T[]> {
  return fetchSupabaseRows<T>("mithron_products", query, false, cacheTags);
}

async function fetchAllCatalogRows<T>(select: string, extraFilter = ""): Promise<T[]> {
  const rows: T[] = [];
  let offset = 0;
  const filterSuffix = extraFilter ? `&${extraFilter}` : "";

  while (rows.length < CATALOG_MAX_ROWS) {
    const page = await fetchCatalogRows<T>(
      `select=${select}&${publishedCatalogFilter}${filterSuffix}&order=sort_order.asc,slug.asc&limit=${CATALOG_PAGE_SIZE}&offset=${offset}`
    );
    rows.push(...page);
    if (page.length < CATALOG_PAGE_SIZE) break;
    offset += CATALOG_PAGE_SIZE;
  }

  return rows;
}

async function fetchCatalogRowsForCategoryName(categoryName: string): Promise<MithronProductRow[]> {
  return fetchCatalogRows<MithronProductRow>(
    `select=${catalogListSelect}&${publishedCatalogFilter}&category=eq.${encodeURIComponent(categoryName)}&order=sort_order.asc,slug.asc&limit=${CATALOG_CATEGORY_MAX_ROWS}`
  );
}

async function fetchCatalogSearchRowsFallback(query: string, limit: number): Promise<CatalogSearchRow[]> {
  const normalized = query.trim();
  if (!normalized || normalized.length < MIN_SEARCH_QUERY_LENGTH) return [];

  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
  const tokens = tokenizeSearchQuery(normalized);
  const primaryToken = tokens[0] ?? normalized;
  const pattern = `"*${primaryToken.replace(/"/g, "\"\"")}*"`;

  const primaryClause = `(name.ilike.${pattern},tagline.ilike.${pattern},slug.ilike.${pattern},category.ilike.${pattern})`;
  const secondaryClause = `,badge_text.ilike.${pattern}`;
  const tertiaryClause = `,description.ilike.${pattern},source_description.ilike.${pattern},source_catalog_id.ilike.${pattern}`;

  let orClause = primaryClause;
  if (normalized.length >= SEARCH_SECONDARY_MIN_TOKEN) {
    orClause += secondaryClause;
  }
  if (normalized.length >= SEARCH_TERTIARY_MIN_TOKEN || tokens.length >= 2) {
    orClause += tertiaryClause;
  }

  const rows = await fetchCatalogRows<
    Pick<
      CatalogSearchRow,
      | "slug"
      | "name"
      | "tagline"
      | "price"
      | "badge"
      | "badge_enabled"
      | "badge_text"
      | "badge_style"
      | "category"
      | "image"
      | "hero"
      | "description"
      | "source_description"
      | "source_catalog_id"
      | "interests"
      | "anchors"
      | "specs"
      | "source_availability"
    >
  >(
    `select=slug,name,tagline,price,badge,badge_enabled,badge_text,badge_style,category,image,hero,description,source_description,source_catalog_id,interests,anchors,specs,source_availability&${publishedCatalogFilter}&or=${orClause}&order=sort_order.asc&limit=${Math.min(boundedLimit * 4, 120)}`
  );

  return rows
    .filter((row) => queryMatchesProductFields(fieldsFromCatalogRow(row), normalized))
    .slice(0, boundedLimit)
    .map((row) => ({ ...row, rank: null }));
}

async function fetchCatalogSearchRows(query: string, limit: number): Promise<CatalogSearchRow[]> {
  const { url, key } = getCatalogConfig();
  const response = await fetch(`${url}/rest/v1/rpc/search_published_products`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      p_query: query,
      p_limit: limit
    }),
    next: { revalidate: 60, tags: ["catalog", "catalog-search"] }
  });

  if (response.ok) {
    const rows = parseCatalogRows<CatalogSearchRow>(await response.text());
    if (rows.length) return rows;
    console.warn("[catalog] full-text search returned no matches; falling back to REST ilike search.");
    return fetchCatalogSearchRowsFallback(query, limit);
  }

  if (response.status === 404) {
    console.warn("[catalog] search_published_products RPC unavailable; falling back to REST ilike search.");
    return fetchCatalogSearchRowsFallback(query, limit);
  }

  throw new Error(`Failed to search catalog: ${response.status} ${response.statusText}`);
}

function toCatalogSearchResult(
  item: ProductShellItem,
  availability?: string | null
): CatalogSearchResult {
  return {
    slug: item.slug,
    name: item.name,
    tagline: item.tagline,
    price: item.price,
    badge: item.badge,
    category: item.category,
    image: item.image,
    availability: availability ? customerFacingAvailability(availability) : undefined
  };
}

async function mapSearchRowsToCatalogResults(rows: CatalogSearchRow[]): Promise<CatalogSearchResult[]> {
  if (!rows.length) return [];
  const primaryMedia = await getPrimaryProductMediaForSlugs(rows.map((row) => row.slug));
  const results: CatalogSearchResult[] = [];

  for (const row of rows) {
    const name = cleanText(row.name);
    const linkedPrimaryImage = primaryMedia.get(row.slug);
    const resolved = resolveProductImage(
      {
        image: row.image,
        hero: row.hero,
        gallery: null,
        source_images: null
      },
      name,
      linkedPrimaryImage
    );

    if (!resolved) {
      console.warn(`[catalog] skipping search result without image: ${row.slug}`);
      continue;
    }

    results.push({
      slug: row.slug,
      name,
      tagline: cleanText(row.tagline),
      price: resolveCatalogPricing(row).salePrice,
      badge: resolveStorefrontBadgeText(row),
      category: row.category,
      image: normalizeProductCardImage(enrichImageWithLinkedResponsive(resolved, linkedPrimaryImage)),
      availability: customerFacingAvailability(row.source_availability)
    });
  }

  return results;
}

async function fetchMediaAssetChunk(chunk: string[]) {
  if (!chunk.length) return [] as MediaAssetRow[];

  try {
    return await fetchSupabaseRows<MediaAssetRow>(
      "media_assets",
      `select=${MEDIA_ASSET_SELECT}&id=${encodeURIComponent(postgrestIn(chunk))}&limit=${chunk.length}`,
      true
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[catalog] media_assets batch lookup failed (${chunk.length} ids): ${message}`);
  }

  const recovered: MediaAssetRow[] = [];
  for (const id of chunk) {
    try {
      const rows = await fetchSupabaseRows<MediaAssetRow>(
        "media_assets",
        `select=${MEDIA_ASSET_SELECT}&id=eq.${encodeURIComponent(id)}&limit=1`,
        true
      );
      recovered.push(...rows);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[catalog] skipped media asset ${id}: ${message}`);
    }
  }

  return recovered;
}

async function fetchMediaAssetsById(mediaIds: string[]) {
  const uniqueIds = [...new Set(mediaIds.map((id) => id?.trim()).filter((id): id is string => Boolean(id)))];
  if (!uniqueIds.length) return new Map<string, MediaAssetRow>();

  const chunks = chunkItems(uniqueIds, MEDIA_ASSET_CHUNK_SIZE);
  const mediaRows = (await Promise.all(chunks.map((chunk) => fetchMediaAssetChunk(chunk)))).flat();
  return new Map(
    mediaRows
      .filter((row): row is MediaAssetRow & { id: string } => typeof row.id === "string" && row.id.length > 0)
      .map((row) => [row.id, normalizeMediaAssetRow(row)])
  );
}

async function fetchProductMediaLinks(query: string) {
  try {
    return await fetchSupabaseRows<ProductMediaLinkRow>("product_media_assets", query, true);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[catalog] product_media_assets lookup failed; retrying with base columns: ${message}`);
    const baseQuery = query
      .replace(/,?alt_text/g, "")
      .replace(/,?caption/g, "")
      .replace(/,?variant_id/g, "")
      .replace(/&variant_id=eq\.[^&]+/g, "");
    return fetchSupabaseRows<ProductMediaLinkRow>("product_media_assets", baseQuery, true);
  }
}

const getPrimaryProductMediaLookup = cache(async (): Promise<Map<string, MediaAsset>> => {
  const { hasServiceRoleKey } = getCatalogConfig(true);
  if (!hasServiceRoleKey) return new Map();

  try {
    const links = await fetchProductMediaLinks(
      `select=product_slug,media_asset_id,usage,is_primary,sort_order,alt_text,caption&usage=eq.primary&is_primary=eq.true&limit=${PRODUCT_MEDIA_LIMIT}`
    );
    const mediaIds = [...new Set(links.map((link) => link.media_asset_id).filter((id): id is string => Boolean(id)))];
    if (!mediaIds.length) return new Map();

    const mediaById = await fetchMediaAssetsById(mediaIds);
    const lookup = new Map<string, MediaAsset>();

    for (const link of links.sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0))) {
      if (!link.product_slug || !link.media_asset_id || lookup.has(link.product_slug)) continue;
      const media = mediaFromMediaAssetRow(mediaById.get(link.media_asset_id), link.alt_text ?? link.caption ?? link.product_slug);
      if (media) lookup.set(link.product_slug, media);
    }

    return lookup;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[catalog] primary product media lookup failed; using inline JSON image fallback: ${message}`);
    return new Map();
  }
});

async function getPrimaryProductMediaForSlugs(slugs: string[]): Promise<Map<string, MediaAsset>> {
  const uniqueSlugs = [...new Set(slugs.map((slug) => slug.trim()).filter(Boolean))];
  if (!uniqueSlugs.length) return new Map();

  const { hasServiceRoleKey } = getCatalogConfig(true);
  if (!hasServiceRoleKey) return new Map();

  try {
    const links = await fetchProductMediaLinks(
      `select=product_slug,media_asset_id,usage,is_primary,sort_order,alt_text,caption&usage=eq.primary&is_primary=eq.true&product_slug=${postgrestIn(uniqueSlugs)}&limit=${uniqueSlugs.length}`
    );
    const mediaIds = [...new Set(links.map((link) => link.media_asset_id).filter((id): id is string => Boolean(id)))];
    if (!mediaIds.length) return new Map();

    const mediaById = await fetchMediaAssetsById(mediaIds);
    const lookup = new Map<string, MediaAsset>();

    for (const link of links.sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0))) {
      if (!link.product_slug || !link.media_asset_id || lookup.has(link.product_slug)) continue;
      const media = mediaFromMediaAssetRow(mediaById.get(link.media_asset_id), link.alt_text ?? link.caption ?? link.product_slug);
      if (media) lookup.set(link.product_slug, media);
    }

    return lookup;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[catalog] scoped primary media lookup failed; using inline JSON image fallback: ${message}`);
    return new Map();
  }
}

async function getGalleryProductMediaForSlugs(slugs: string[]): Promise<Map<string, MediaAsset[]>> {
  const uniqueSlugs = [...new Set(slugs.map((slug) => slug.trim()).filter(Boolean))];
  if (!uniqueSlugs.length) return new Map();

  const { hasServiceRoleKey } = getCatalogConfig(true);
  if (!hasServiceRoleKey) return new Map();

  try {
    const links = await fetchProductMediaLinks(
      `select=product_slug,media_asset_id,usage,is_primary,sort_order,alt_text,caption&usage=eq.gallery&product_slug=${postgrestIn(uniqueSlugs)}&limit=${PRODUCT_MEDIA_LIMIT}`
    );
    return groupGalleryLinksBySlug(links);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[catalog] scoped gallery media lookup failed; gallery images will use inline JSON without responsive variants: ${message}`);
    return new Map();
  }
}

const getGalleryProductMediaLookup = cache(async (): Promise<Map<string, MediaAsset[]>> => {
  const { hasServiceRoleKey } = getCatalogConfig(true);
  if (!hasServiceRoleKey) return new Map();

  try {
    const links = await fetchProductMediaLinks(
      `select=product_slug,media_asset_id,usage,is_primary,sort_order,alt_text,caption&usage=eq.gallery&limit=${PRODUCT_MEDIA_LIMIT}`
    );
    return groupGalleryLinksBySlug(links);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[catalog] gallery media lookup failed; gallery images will use inline JSON without responsive variants: ${message}`);
    return new Map();
  }
});

async function groupGalleryLinksBySlug(links: ProductMediaLinkRow[]): Promise<Map<string, MediaAsset[]>> {
  const mediaIds = [...new Set(links.map((link) => link.media_asset_id).filter((id): id is string => Boolean(id)))];
  if (!mediaIds.length) return new Map();

  const mediaById = await fetchMediaAssetsById(mediaIds);
  const lookup = new Map<string, MediaAsset[]>();

  for (const link of links.sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0))) {
    if (!link.product_slug || !link.media_asset_id) continue;
    const media = mediaFromMediaAssetRow(mediaById.get(link.media_asset_id), link.alt_text ?? link.caption ?? link.product_slug);
    if (!media) continue;
    const existing = lookup.get(link.product_slug);
    if (existing) {
      existing.push(media);
    } else {
      lookup.set(link.product_slug, [media]);
    }
  }

  return lookup;
}

async function getCatalogCutoutMediaForSlugs(slugs: string[]): Promise<Map<string, MediaAsset>> {
  const uniqueSlugs = [...new Set(slugs.map((slug) => slug.trim()).filter(Boolean))];
  if (!uniqueSlugs.length) return new Map();

  const { hasServiceRoleKey } = getCatalogConfig(true);
  if (!hasServiceRoleKey) return new Map();

  try {
    const links = await fetchProductMediaLinks(
      `select=product_slug,media_asset_id,usage,variant_id,is_primary,sort_order,alt_text,caption&usage=eq.cms&variant_id=eq.catalog-cutout-v1&product_slug=${postgrestIn(uniqueSlugs)}&limit=${Math.max(uniqueSlugs.length * 8, 40)}`
    );
    const mediaIds = [...new Set(links.map((link) => link.media_asset_id).filter((id): id is string => Boolean(id)))];
    if (!mediaIds.length) return new Map();

    const mediaById = await fetchMediaAssetsById(mediaIds);
    const lookup = new Map<string, MediaAsset>();

    for (const link of pickBestCatalogCutoutLinks(links, mediaById)) {
      if (!link.product_slug || !link.media_asset_id || lookup.has(link.product_slug)) continue;
      const media = mediaFromMediaAssetRow(mediaById.get(link.media_asset_id), link.alt_text ?? link.caption ?? link.product_slug);
      if (media) lookup.set(link.product_slug, media);
    }

    return lookup;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[catalog] scoped catalog cutout media lookup failed; falling back to primary product images: ${message}`);
    return new Map();
  }
}

const getCatalogCutoutMediaLookup = cache(async (): Promise<Map<string, MediaAsset>> => {
  const { hasServiceRoleKey } = getCatalogConfig(true);
  if (!hasServiceRoleKey) return new Map();

  try {
    const links = await fetchProductMediaLinks(
      `select=product_slug,media_asset_id,usage,variant_id,is_primary,sort_order,alt_text,caption&usage=eq.cms&variant_id=eq.catalog-cutout-v1&limit=${PRODUCT_MEDIA_LIMIT}`
    );
    const mediaIds = [...new Set(links.map((link) => link.media_asset_id).filter((id): id is string => Boolean(id)))];
    if (!mediaIds.length) return new Map();

    const mediaById = await fetchMediaAssetsById(mediaIds);
    const lookup = new Map<string, MediaAsset>();

    for (const link of pickBestCatalogCutoutLinks(links, mediaById)) {
      if (!link.product_slug || !link.media_asset_id || lookup.has(link.product_slug)) continue;
      const media = mediaFromMediaAssetRow(mediaById.get(link.media_asset_id), link.alt_text ?? link.caption ?? link.product_slug);
      if (media) lookup.set(link.product_slug, media);
    }

    return lookup;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[catalog] catalog cutout media lookup failed; falling back to primary product images: ${message}`);
    return new Map();
  }
});

async function mapRowsWithCatalogMedia<T extends Pick<MithronProductRow, "slug">, R>(
  rows: T[],
  mapper: (row: T, media?: MediaAsset, galleryMedia?: MediaAsset[]) => R,
  options?: { scopeToRows?: boolean }
) {
  const slugs = rows.map((row) => row.slug).filter(Boolean);
  const useScopedMedia = slugs.length > 0 && (options?.scopeToRows ?? true);

  type ScopedMediaMaps = {
    primary: Array<[string, MediaAsset]>;
    cutouts: Array<[string, MediaAsset]>;
    gallery: Array<[string, MediaAsset[]]>;
  };

  let primaryMedia: Map<string, MediaAsset>;
  let catalogCutouts: Map<string, MediaAsset>;
  let galleryMedia: Map<string, MediaAsset[]>;

  if (useScopedMedia) {
    const { createHash } = await import("node:crypto");
    const hash = createHash("sha1").update([...slugs].sort().join("|")).digest("hex").slice(0, 24);
    const cached = await readThroughCache(
      REDIS_CACHE_KEYS.catalogMediaMap(hash),
      45,
      async (): Promise<ScopedMediaMaps> => {
        const [primary, cutouts, gallery] = await Promise.all([
          getPrimaryProductMediaForSlugs(slugs),
          getCatalogCutoutMediaForSlugs(slugs),
          getGalleryProductMediaForSlugs(slugs)
        ]);
        return {
          primary: [...primary.entries()],
          cutouts: [...cutouts.entries()],
          gallery: [...gallery.entries()]
        };
      }
    );
    primaryMedia = new Map(cached.primary);
    catalogCutouts = new Map(cached.cutouts);
    galleryMedia = new Map(cached.gallery);
  } else {
    [primaryMedia, catalogCutouts, galleryMedia] = await Promise.all([
      getPrimaryProductMediaLookup(),
      getCatalogCutoutMediaLookup().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[catalog] catalog cutout media lookup failed; falling back to primary product images: ${message}`);
        return new Map<string, MediaAsset>();
      }),
      getGalleryProductMediaLookup().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[catalog] gallery media lookup failed; gallery images will use inline JSON without responsive variants: ${message}`);
        return new Map<string, MediaAsset[]>();
      })
    ]);
  }

  const mapped: R[] = [];
  for (const row of rows) {
    try {
      mapped.push(
        mapper(row, catalogCutouts.get(row.slug) ?? primaryMedia.get(row.slug), galleryMedia.get(row.slug))
      );
    } catch (error) {
      // Skip broken catalog rows (e.g. demo `testing-product`) so related/PLP/ISR
      // builds do not fail the whole page when one product lacks a source image.
      if (isMissingSourceImageError(error)) {
        console.warn(`[catalog] skipping product without source image: ${row.slug}`);
        continue;
      }
      throw error;
    }
  }
  return mapped;
}

export const getHomepageProducts = cache(async (): Promise<Product[]> => {
  const rows = await fetchCatalogRows<MithronProductRow>(
    `select=${homepageProductSelect}&${publishedCatalogFilter}&order=sort_order.asc&limit=${HOMEPAGE_PRODUCT_LIMIT}`
  );

  const products = await mapRowsWithCatalogMedia(rows, mapHomepageProductRow, { scopeToRows: true });
  return products.filter((product) => Boolean(product.image?.src));
});

/** Slim published products for homepage testimonial cards (by review product_slug). */
export const getPublishedProductsBySlugs = cache(async (slugs: string[]): Promise<Product[]> => {
  const unique = [...new Set(slugs.map((slug) => slug.trim()).filter(Boolean))];
  if (!unique.length) return [];

  const rows = await fetchCatalogRows<MithronProductRow>(
    [
      `select=${homepageProductSelect}`,
      publishedCatalogFilter,
      `slug=${postgrestIn(unique)}`,
      `limit=${unique.length}`
    ].join("&")
  );

  const products = await mapRowsWithCatalogMedia(rows, mapHomepageProductRow, { scopeToRows: true });
  return products.filter((product) => Boolean(product.image?.src));
});

function mapHomepageProductRow(row: MithronProductRow, linkedPrimaryImage?: MediaAsset): Product {
  const shelfRow = {
    ...row,
    gallery: [] as MithronProductRow["gallery"],
    hotspots: [] as MithronProductRow["hotspots"],
    variants: [] as MithronProductRow["variants"],
    bundles: [] as MithronProductRow["bundles"],
    story: [] as MithronProductRow["story"],
    specs: {} as MithronProductRow["specs"],
    anchors: [] as MithronProductRow["anchors"],
    source_images: [] as MithronProductRow["source_images"]
  } satisfies MithronProductRow;
  const product = mapProductRow(shelfRow, linkedPrimaryImage);
  return {
    ...product,
    gallery: [product.image],
    variants: [],
    bundles: [],
    hotspots: [],
    story: product.story.slice(0, 1)
  };
}


/** @deprecated Prefer targeted loaders such as getProductsByCategorySlug or getFeaturedProducts. */
export const getProducts = cache(async (): Promise<Product[]> => {
  return fetchBoundedCatalogProducts(CATALOG_LEGACY_LIST_LIMIT);
});

async function fetchBoundedCatalogProducts(limit = CATALOG_LEGACY_LIST_LIMIT): Promise<Product[]> {
  const rows = await overlayLiveInventoryAvailability(
    await fetchCatalogRows<MithronProductRow>(
      `select=${catalogListSelect}&${publishedCatalogFilter}&order=sort_order.asc,slug.asc&limit=${limit}`
    )
  );
  const products = await mapRowsWithCatalogMedia(rows, mapProductRow, { scopeToRows: true });
  return dedupeProductsBySlug(products);
}

async function fetchEnterpriseMenuRowsByCategory(): Promise<Map<string, EnterpriseMenuProductRow[]>> {
  const categoryNames = catalogCategoryDefinitions
    .map((definition) => definition.categoryNames[0])
    .filter((name): name is string => Boolean(name));

  const byCategory = new Map<string, EnterpriseMenuProductRow[]>();
  if (!categoryNames.length) return byCategory;

  // Single combined query (ordered by category first, then the same sort_order/slug
  // used per-category before) instead of 7 parallel per-category requests. Rows are
  // grouped and capped to ENTERPRISE_MENU_PER_CATEGORY_LIMIT per category in JS below,
  // matching the exact per-category cap each of the 7 prior queries enforced server-side.
  const query = [
    `select=${enterpriseMenuSelect}`,
    publishedCatalogFilter,
    `category=${postgrestIn(categoryNames)}`,
    "order=category.asc,sort_order.asc,slug.asc",
    `limit=${CATALOG_CATEGORY_MAX_ROWS}`
  ].join("&");

  const rows = await fetchCatalogRows<EnterpriseMenuProductRow>(query);
  for (const row of rows) {
    const bucket = byCategory.get(row.category);
    if (bucket) {
      if (bucket.length < ENTERPRISE_MENU_PER_CATEGORY_LIMIT) bucket.push(row);
    } else {
      byCategory.set(row.category, [row]);
    }
  }
  return byCategory;
}

export const getEnterpriseMenuProducts = cache(async (): Promise<EnterpriseMenuLoadResult> => {
  try {
    const rowsByCategory = await fetchEnterpriseMenuRowsByCategory();
    const rowGroups = catalogCategoryDefinitions.map((definition) => {
      const categoryName = definition.categoryNames[0];
      return categoryName ? rowsByCategory.get(categoryName) ?? [] : [];
    });

    const seen = new Set<string>();
    const rows = rowGroups.flat().filter((row) => {
      if (!row.slug || seen.has(row.slug)) return false;
      seen.add(row.slug);
      return true;
    });

    const errors: CatalogDataError[] = [];
    const products = await mapRowsWithCatalogMedia(rows, (row, media) => mapEnterpriseMenuProduct(row, media, errors), { scopeToRows: true });
    return {
      products: products.filter((product): product is Product => product !== null),
      errors
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[catalog] getEnterpriseMenuProducts failed: ${message}`);
    return {
      products: [],
      errors: [createNavigationCatalogUnavailableError(error)]
    };
  }
});

export const getProductAffinityRowBySlug = cache(async (slug: string): Promise<ProductAffinityRow | null> => {
  const normalizedSlug = slug.trim();
  if (!normalizedSlug) return null;
  const rows = await fetchCatalogRows<ProductAffinityRow>(
    `select=slug,category,interests,price&slug=eq.${encodeURIComponent(normalizedSlug)}&${publishedCatalogFilter}&limit=1`
  );
  return rows[0] ?? null;
});

export const getCatalogShowroomProducts = cache(async (): Promise<Product[]> => {
  return readThroughCache(REDIS_CACHE_KEYS.catalogShowroom, 45, async () => {
    const categoryNames = [
      ...new Set(
        catalogCategoryDefinitions
          .filter((definition) => definition.categoryNames.length > 0)
          .flatMap((definition) => definition.categoryNames)
      )
    ];
    if (!categoryNames.length) return [];

    const rows = await overlayLiveInventoryAvailability(
      await fetchCatalogRowsWithTags<MithronProductRow>(
        `select=${catalogListSelect}&${publishedCatalogFilter}&category=${postgrestIn(categoryNames)}&order=sort_order.asc,slug.asc&limit=${CATALOG_SHOWROOM_LIMIT}`,
        ["catalog", "catalog-products", "catalog-showroom"]
      )
    );
    const products = await mapRowsWithCatalogMedia(rows, mapProductRow, { scopeToRows: true });
    return dedupeProductsBySlug(products);
  });
});

export const getProductRowBySlug = cache(async (slug: string) => {
  const normalizedSlug = slug.trim();
  if (!normalizedSlug) return null;
  // Single-flight collapses hot-PDP stampede under flash traffic (same row, same ISR window).
  return withSingleFlight(REDIS_CACHE_KEYS.catalogProductRow(normalizedSlug), 60, async () => {
    const rows = await fetchCatalogRows<MithronProductRow>(
      `select=${productSelect}&slug=eq.${encodeURIComponent(normalizedSlug)}&${publishedCatalogFilter}&limit=1`
    );
    return rows[0] ?? null;
  });
});

export type ProductCoreCacheEntry = {
  slug: string;
  name: string;
  price: number;
  tagline: string;
  badge?: string;
  category: string;
  availability?: string;
  image: MediaAsset;
};

async function buildProductCoreEntry(slug: string): Promise<ProductCoreCacheEntry | null> {
  const normalizedSlug = slug.trim();
  if (!normalizedSlug) return null;
  const rows = await fetchCatalogRows<MithronProductRow>(
    `select=${productCoreSelect}&slug=eq.${encodeURIComponent(normalizedSlug)}&${publishedCatalogFilter}&limit=1`
  );
  const row = rows[0];
  if (!row) return null;
  const item = mapProductShellRowOrNull(row);
  if (!item) return null;
  return {
    slug: item.slug,
    name: item.name,
    price: item.price,
    tagline: item.tagline,
    badge: item.badge,
    category: item.category,
    availability: customerFacingAvailability(row.source_availability),
    image: item.image
  };
}

export async function getProductCoreBySlug(slug: string): Promise<ProductCoreCacheEntry | null> {
  const normalized = slug.trim();
  if (!normalized) return null;
  return readThroughCache(REDIS_CACHE_KEYS.productCore(normalized), 90, () => buildProductCoreEntry(normalized));
}

async function mapLiveProductRow(row: MithronProductRow): Promise<Product> {
  // Storefront PDP uses catalog-fresh inventory (60s ISR tags) so product pages
  // stay statically regenerable. Checkout paths still request freshness:"checkout".
  const [liveRow] = await overlayLiveInventoryAvailability([row], { freshness: "catalog" });
  const slug = liveRow.slug;
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha1").update(slug).digest("hex").slice(0, 24);
  const cached = await readThroughCache(
    REDIS_CACHE_KEYS.catalogMediaMap(hash),
    45,
    async () => {
      const [primary, cutouts, gallery] = await Promise.all([
        getPrimaryProductMediaForSlugs([slug]),
        getCatalogCutoutMediaForSlugs([slug]).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          console.warn(`[catalog] catalog cutout media lookup failed; falling back to primary product images: ${message}`);
          return new Map<string, MediaAsset>();
        }),
        getGalleryProductMediaForSlugs([slug]).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          console.warn(`[catalog] gallery media lookup failed; gallery images will use inline JSON without responsive variants: ${message}`);
          return new Map<string, MediaAsset[]>();
        })
      ]);
      return {
        primary: [...primary.entries()] as Array<[string, MediaAsset]>,
        cutouts: [...cutouts.entries()] as Array<[string, MediaAsset]>,
        gallery: [...gallery.entries()] as Array<[string, MediaAsset[]]>
      };
    }
  );
  const primaryMedia = new Map(cached.primary);
  const catalogCutouts = new Map(cached.cutouts);
  const galleryMedia = new Map(cached.gallery);

  return mapProductRow(liveRow, catalogCutouts.get(slug) ?? primaryMedia.get(slug), galleryMedia.get(slug));
}

export const loadProductForPage = cache(async (slug: string): Promise<ProductPageLoadResult> => {
  try {
    const row = await getProductRowBySlug(slug);
    if (!row) return { status: "not_found" };

    try {
      const product = await mapLiveProductRow(row);
      // Warm product-core cache off the render critical path (do not await a second build).
      void buildProductCoreEntry(slug)
        .then((coreEntry) => {
          if (coreEntry) {
            void setCachedJson(REDIS_CACHE_KEYS.productCore(slug), coreEntry, 90).catch(() => undefined);
          }
        })
        .catch(() => undefined);
      return {
        status: "ready",
        product
      };
    } catch (error) {
      if (isMissingSourceImageError(error)) {
        const catalogError = createMissingSourceImageError(slug);
        console.warn(`[catalog] ${catalogError.message}`);
        return { status: "error", error: catalogError };
      }
      throw error;
    }
  } catch (error) {
    const catalogError = createCatalogUnavailableError(slug, error);
    console.warn(`[catalog] ${catalogError.message}`);
    return { status: "error", error: catalogError };
  }
});

export const getProductBySlug = cache(async (slug: string) => {
  const result = await loadProductForPage(slug);
  return result.status === "ready" ? result.product : undefined;
});

export async function getProductStaticSlugs() {
  try {
    const rows = await fetchAllCatalogRows<{ slug: string }>("slug");
    return rows.map((product) => product.slug).filter(Boolean);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[catalog] getProductStaticSlugs failed; product pages will render on demand: ${message}`);
    return [];
  }
}

export type ProductSitemapEntry = {
  slug: string;
  productUrl: string | null;
  updatedAt: string | null;
};

export async function getPublishedProductSitemapEntries(): Promise<ProductSitemapEntry[]> {
  const rows = await fetchAllCatalogRows<{ slug: string; product_url: string | null; updated_at: string | null }>(
    "slug,product_url,updated_at"
  );

  return rows.map((row) => ({
    slug: row.slug,
    productUrl: row.product_url,
    updatedAt: row.updated_at
  }));
}

export async function countPublishedProductsWithoutPrimaryLink(): Promise<{
  publishedCount: number;
  linkedCount: number;
  missingCount: number;
}> {
  const [productRows, links] = await Promise.all([
    fetchAllCatalogRows<{ slug: string }>("slug"),
    fetchSupabaseRows<{ product_slug: string }>(
      "product_media_assets",
      `select=product_slug&usage=eq.primary&is_primary=eq.true&limit=${PRODUCT_MEDIA_LIMIT}`,
      true
    )
  ]);

  const linkedSlugs = new Set(links.map((link) => link.product_slug).filter(Boolean));
  const publishedCount = productRows.length;
  const linkedCount = productRows.filter((row) => linkedSlugs.has(row.slug)).length;

  return {
    publishedCount,
    linkedCount,
    missingCount: Math.max(0, publishedCount - linkedCount)
  };
}

export const getFeaturedProducts = cache(async () => {
  const rows = await overlayLiveInventoryAvailability(
    await fetchCatalogRows<MithronProductRow>(
      `select=${catalogListSelect}&${publishedCatalogFilter}&order=sort_order.asc&limit=80`
    )
  );
  const products = await mapRowsWithCatalogMedia(rows, mapProductRow, { scopeToRows: true });
  return filterDroneWorldProducts(products)
    .filter((product) => product.category !== "Surveillance Drones")
    .slice(0, 24);
});

export async function getProductsByInterest(interestSlug: string) {
  const normalized = interestSlug.trim();
  if (!normalized) return [];

  const rows = await overlayLiveInventoryAvailability(
    await fetchCatalogRows<MithronProductRow>(
      `select=${catalogListSelect}&${publishedCatalogFilter}&interests=cs.{${encodeURIComponent(normalized)}}&order=sort_order.asc,slug.asc&limit=${CATALOG_INTEREST_LIMIT}`
    )
  );
  const products = await mapRowsWithCatalogMedia(rows, mapProductRow, { scopeToRows: true });
  const matched = dedupeProductsBySlug(products);
  if (normalized === "components") {
    return filterDroneCareProducts(matched);
  }
  return filterDroneWorldProducts(matched);
}

export async function searchCatalogProducts(query: string, limit = 24): Promise<CatalogSearchResult[]> {
  const normalized = query.trim();
  if (!normalized) return [];

  const boundedLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
  const cacheKey = REDIS_CACHE_KEYS.catalogSearchQuery(normalized, boundedLimit);

  return readThroughCache(cacheKey, 30, async () => {
    if (isTypesenseSearchEnabled()) {
      const typesenseResults = await searchCatalogProductsTypesense(normalized, boundedLimit);
      if (typesenseResults?.length) return typesenseResults;
    }

    // Try the (already tag-cached) in-memory index first. Only hit the Supabase RPC
    // fallback — which also performs a live inventory-availability lookup — when the
    // index can't fully answer the request, preserving today's behavior in that case.
    const index = await getCatalogSearchIndex();
    const localResults = index.length ? searchCatalogIndex(index, normalized, boundedLimit) : [];

    if (index.length && localResults.length >= boundedLimit) {
      return localResults;
    }

    const serverResults = await searchCatalogProductsFallback(normalized, boundedLimit);
    if (!index.length) {
      if (!serverResults.length) {
        console.warn("[catalog] catalog search returned no matches for query:", normalized);
      }
      return serverResults;
    }

    return mergeSearchResultsBySlug(serverResults, localResults, boundedLimit);
  });
}

export const getProductsByCategorySlug = cache(async (slug: CatalogCategorySlug): Promise<Product[]> => {
  return readThroughCache(REDIS_CACHE_KEYS.catalogCategory(slug), 45, async () => {
    const definition = getCatalogCategoryDefinition(slug);
    if (!definition.categoryNames.length) return [];

    const rows = await overlayLiveInventoryAvailability(
      await fetchCatalogRowsForCategoryName(definition.categoryNames[0]!)
    );
    const products = await mapRowsWithCatalogMedia(rows, mapProductRow, { scopeToRows: true });
    return dedupeProductsBySlug(filterProductsForCategorySlug(products, slug));
  });
});

export async function getProductsForCategorySlug(slug: string) {
  if (!isCatalogCategorySlug(slug)) return [];
  return getProductsByCategorySlug(slug);
}

export async function getGlobalProductsForCatalog() {
  return getProductsForCategorySlug("global-products");
}

export async function getProductsForCatalog(route: "agriculture" | "videoDrones" | "creativeDrones" | "accessories" | "industrial" | "mapping" | "surveillance") {
  const routeToSlug = {
    agriculture: "agri-drones",
    videoDrones: "video-drones",
    creativeDrones: "creative-drones",
    mapping: "survey-drones",
    surveillance: "surveillance-drones",
    accessories: "accessories",
    industrial: "global-products"
  } as const;

  return getProductsForCategorySlug(routeToSlug[route]);
}

