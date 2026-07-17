import {
  decodeHtml,
  inferProductCategory,
  normalizeIdentity,
  parseMoney,
  sourceCatalogIdFromWixSlug,
  wixProductPageUrl
} from "./catalog-normalize.ts";
import { extractRichProductContent, type WixRichProductContent } from "./catalog-rich.ts";

export type WixProductSnapshot = {
  wix_product_id: string;
  wix_slug: string;
  name: string;
  price: number;
  compare_at: number | null;
  currency: string | null;
  sku: string | null;
  cost_of_goods: number | null;
  description_plain: string;
  source_url: string;
  source_catalog_id: string;
  source_fingerprint: string;
  category: string;
  media_urls: string[];
  visible: boolean;
  updated_at: string;
  rich: WixRichProductContent;
};

export type WixCatalogSnapshot = {
  version: 1;
  source: "wix-stores-api-v3" | "wix-stores-api-v1";
  site_id: string;
  extracted_at: string;
  product_count: number;
  products: WixProductSnapshot[];
};

type WixClientOptions = {
  apiKey: string;
  siteId: string;
  baseUrl?: string;
};

export const WIX_CATALOG_QUERY_FIELDS = [
  "PLAIN_DESCRIPTION",
  "DESCRIPTION",
  "MEDIA_ITEMS_INFO",
  "BREADCRUMBS_INFO",
  "INFO_SECTION",
  "INFO_SECTION_PLAIN_DESCRIPTION",
  "URL",
  "ALL_CATEGORIES_INFO",
  "DIRECT_CATEGORIES_INFO",
  "VARIANT_OPTION_CHOICE_NAMES",
  "MIN_PRICE_VARIANT",
  "CURRENCY",
  "DISCOUNT_INFO",
  "WEIGHT_MEASUREMENT_UNIT_INFO"
] as const;

function readNestedPrice(product: Record<string, unknown>) {
  const priceData = product.price as Record<string, unknown> | undefined;
  const range = priceData?.price as Record<string, unknown> | undefined;
  const discounted = parseMoney(range?.discountedPrice);
  const regular = parseMoney(range?.price);
  if (discounted !== null) {
    return {
      price: discounted,
      compare_at: regular !== null && regular > discounted ? regular : null
    };
  }

  const variant = (product.variantsInfo as { variants?: Array<Record<string, unknown>> } | undefined)?.variants?.[0];
  const variantPrice = variant?.price as Record<string, unknown> | undefined;
  const variantDiscounted = parseMoney(variantPrice?.discountedPrice);
  const variantRegular = parseMoney(variantPrice?.price);
  if (variantDiscounted !== null) {
    return {
      price: variantDiscounted,
      compare_at: variantRegular !== null && variantRegular > variantDiscounted ? variantRegular : null
    };
  }

  return { price: 0, compare_at: null };
}

function readMediaUrls(product: Record<string, unknown>) {
  const media = product.media as { items?: Array<Record<string, unknown>> } | undefined;
  const urls: string[] = [];
  for (const item of media?.items ?? []) {
    const image = item.image as Record<string, unknown> | undefined;
    const url = String(image?.url ?? item.url ?? "").trim();
    if (url) urls.push(url);
  }
  return [...new Set(urls)];
}

function readCurrency(product: Record<string, unknown>) {
  const direct = String(product.currency ?? "").trim();
  if (direct) return direct.toUpperCase();
  const priceData = product.price as { currency?: string } | undefined;
  const nested = String(priceData?.currency ?? "").trim();
  return nested ? nested.toUpperCase() : null;
}

function readCostOfGoods(product: Record<string, unknown>) {
  const variants = (product.variantsInfo as { variants?: Array<Record<string, unknown>> } | undefined)?.variants ?? [];
  for (const variant of variants) {
    const costData = variant.costAndProfitData as { itemCost?: unknown } | undefined;
    const cost = parseMoney(costData?.itemCost ?? variant.itemCost);
    if (cost !== null && cost >= 0) return cost;
  }
  return null;
}

function readSku(product: Record<string, unknown>, richSku: string) {
  const physical = product.physicalProperties as { sku?: string } | undefined;
  const sku = String(physical?.sku ?? product.sku ?? richSku ?? "").trim();
  return sku || null;
}
function readCategory(product: Record<string, unknown>, name: string) {
  const breadcrumbs = product.breadcrumbsInfo as { breadcrumbs?: Array<{ name?: string }> } | undefined;
  const names = (breadcrumbs?.breadcrumbs ?? []).map((item) => decodeHtml(item.name ?? "")).filter(Boolean);
  const leaf = names.at(-1);
  if (leaf && !/product|all/i.test(leaf)) return leaf;
  return inferProductCategory(name);
}

export function normalizeWixProduct(product: Record<string, unknown>, extractedAt: string): WixProductSnapshot | null {
  const wixSlug = String(product.slug ?? "").trim();
  const name = decodeHtml(String(product.name ?? ""));
  if (!wixSlug || !name) return null;

  const pricing = readNestedPrice(product);
  const descriptionPlain = decodeHtml(
    String(product.plainDescription ?? product.descriptionPlain ?? stripRichDescription(product.description) ?? "")
  );
  const category = readCategory(product, name);
  const mediaUrls = readMediaUrls(product);
  const pageUrl = String((product.url as { url?: string } | undefined)?.url ?? "").trim() || wixProductPageUrl(wixSlug);
  const rich = extractRichProductContent(product, category, mediaUrls, { productName: name });

  return {
    wix_product_id: String(product.id ?? product._id ?? wixSlug),
    wix_slug: wixSlug,
    name,
    price: pricing.price,
    compare_at: pricing.compare_at,
    currency: readCurrency(product),
    sku: readSku(product, rich.sku),
    cost_of_goods: readCostOfGoods(product),
    description_plain: descriptionPlain || stripRichDescription(product.description),
    source_url: pageUrl,
    source_catalog_id: sourceCatalogIdFromWixSlug(wixSlug),
    source_fingerprint: normalizeIdentity(name),
    category: rich.categories[0] ?? category,
    media_urls: rich.media_urls.length ? rich.media_urls : mediaUrls,
    visible: product.visible !== false,
    updated_at: String(product.updatedDate ?? product.lastUpdated ?? extractedAt),
    rich
  };
}

function stripRichDescription(value: unknown) {
  if (typeof value === "string") return decodeHtml(value);
  if (!value || typeof value !== "object") return "";
  const nodes = (value as { nodes?: Array<Record<string, unknown>> }).nodes ?? [];
  const parts: string[] = [];
  for (const node of nodes) {
    const text = node.textData as { text?: string } | undefined;
    if (text?.text) parts.push(text.text);
    if (Array.isArray(node.nodes)) {
      for (const child of node.nodes) {
        const childText = (child as { textData?: { text?: string } }).textData?.text;
        if (childText) parts.push(childText);
      }
    }
  }
  return decodeHtml(parts.join(" "));
}

export async function fetchWixCatalog(options: WixClientOptions): Promise<WixCatalogSnapshot> {
  const { fetchWixCatalogV1 } = await import("./catalog-v1.ts");
  const baseUrl = options.baseUrl ?? "https://www.wixapis.com";
  const extractedAt = new Date().toISOString();

  try {
    return await fetchWixCatalogV3(options, baseUrl, extractedAt);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/CATALOG_V1_SITE_CALLING_CATALOG_V3_API|catalog version/i.test(message)) {
      throw error;
    }
    return fetchWixCatalogV1(options);
  }
}

async function fetchWixCatalogV3(options: WixClientOptions, baseUrl: string, extractedAt: string): Promise<WixCatalogSnapshot> {
  const products: WixProductSnapshot[] = [];
  let cursor: string | undefined;

  do {
    const response = await fetch(`${baseUrl}/stores/v3/products/query`, {
      method: "POST",
      headers: {
        Authorization: options.apiKey,
        "Content-Type": "application/json",
        "wix-site-id": options.siteId
      },
      body: JSON.stringify({
        query: {
          cursorPaging: { limit: 100, cursor }
        },
        fields: [...WIX_CATALOG_QUERY_FIELDS]
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Wix query products failed (${response.status}): ${body.slice(0, 400)}`);
    }

    const payload = (await response.json()) as {
      products?: Array<Record<string, unknown>>;
      pagingMetadata?: { cursors?: { next?: string } };
    };

    for (const product of payload.products ?? []) {
      const normalized = normalizeWixProduct(product, extractedAt);
      if (normalized) products.push(normalized);
    }

    cursor = payload.pagingMetadata?.cursors?.next || undefined;
  } while (cursor);

  const deduped = new Map<string, WixProductSnapshot>();
  for (const product of products) {
    deduped.set(product.wix_product_id, product);
  }

  return {
    version: 1,
    source: "wix-stores-api-v3",
    site_id: options.siteId,
    extracted_at: extractedAt,
    product_count: deduped.size,
    products: [...deduped.values()].sort((a, b) => a.name.localeCompare(b.name))
  };
}

export function loadWixClientFromEnv(env: NodeJS.ProcessEnv = process.env) {
  const apiKey = env.WIX_STUDIO_API_KEY?.trim();
  const siteId = env.WIX_SITE_ID?.trim();
  if (!apiKey) throw new Error("WIX_STUDIO_API_KEY is required.");
  if (!siteId) throw new Error("WIX_SITE_ID is required.");
  return { apiKey, siteId };
}
