import {
  decodeHtml,
  inferProductCategory,
  normalizeIdentity,
  parseMoney,
  sourceCatalogIdFromWixSlug,
  wixProductPageUrl
} from "./catalog-normalize.ts";
import { extractRichProductContent } from "./catalog-rich.ts";
import type { WixProductSnapshot } from "./catalog-client.ts";

const wixFitVariantPattern = /^(https?:\/\/static\.wixstatic\.com\/media\/[^?\s]+?)\/v1\/fit\/[^/]+\/file\.[a-z0-9]+(\?.*)?$/i;

function normalizeWixMediaUrl(value: string) {
  return value.trim().replace(wixFitVariantPattern, "$1$2");
}

function readV1MediaUrls(product: Record<string, unknown>) {
  const urls: string[] = [];
  const media = product.media as { items?: Array<Record<string, unknown>>; mainMedia?: Record<string, unknown> } | undefined;
  const mainImage = (media?.mainMedia as { image?: { url?: string } } | undefined)?.image?.url;
  if (mainImage) urls.push(normalizeWixMediaUrl(mainImage));
  for (const item of media?.items ?? []) {
    const image = item.image as { url?: string } | undefined;
    const url = String(image?.url ?? "").trim();
    if (url) urls.push(normalizeWixMediaUrl(url));
  }
  return [...new Set(urls)];
}

function readV1Pricing(product: Record<string, unknown>) {
  const priceData = product.priceData as Record<string, unknown> | undefined;
  const price = product.price as Record<string, unknown> | undefined;
  const regular = parseMoney(priceData?.price ?? price?.price);
  const discounted = parseMoney(priceData?.discountedPrice ?? price?.discountedPrice);
  if (discounted !== null) {
    return {
      price: discounted,
      compare_at: regular !== null && regular > discounted ? regular : null
    };
  }
  return { price: regular ?? 0, compare_at: null };
}

function mapV1ProductForRichExtraction(product: Record<string, unknown>, category: string, mediaUrls: string[]) {
  const additionalInfoSections = product.additionalInfoSections as Array<{ title?: string; description?: string }> | undefined;
  return {
    plainDescription: String(product.description ?? ""),
    description: String(product.description ?? ""),
    infoSections: (additionalInfoSections ?? []).map((section, index) => ({
      id: `v1-section-${index}`,
      uniqueName: decodeHtml(String(section.title ?? `section-${index}`)),
      title: decodeHtml(String(section.title ?? `Section ${index + 1}`)),
      plainDescription: String(section.description ?? "")
    })),
    media: {
      items: mediaUrls.map((url) => ({ image: { url } }))
    },
    breadcrumbsInfo: {
      breadcrumbs: (product.collectionIds as string[] | undefined)?.length
        ? [{ name: category }]
        : [{ name: category }]
    },
    ribbon: {
      text: (product.ribbons as Array<{ text?: string }> | undefined)?.[0]?.text ?? ""
    },
    physicalProperties: {
      sku: String(product.sku ?? ""),
      weight: Number(product.weight ?? 0) || undefined
    },
    productOptions: product.productOptions,
    variantsInfo: {
      variants: (product.variants as Array<Record<string, unknown>> | undefined) ?? []
    }
  };
}

function parseIncludedFromDescription(html: string) {
  const plain = decodeHtml(html.replace(/<[^>]+>/g, "\n"));
  return plain
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => /(?:–|-)\s*\d+\s*(unit|set|pcs|piece|parts?)/i.test(line));
}

export function normalizeWixV1Product(product: Record<string, unknown>, extractedAt: string): WixProductSnapshot | null {
  const wixSlug = String(product.slug ?? "").trim();
  const name = decodeHtml(String(product.name ?? ""));
  if (!wixSlug || !name) return null;

  const pricing = readV1Pricing(product);
  const descriptionHtml = String(product.description ?? "").trim();
  const descriptionPlain = decodeHtml(descriptionHtml.replace(/<[^>]+>/g, " "));
  const category = inferProductCategory(name);
  const mediaUrls = readV1MediaUrls(product);
  const richSource = mapV1ProductForRichExtraction(product, category, mediaUrls);
  const rich = extractRichProductContent(richSource, category, mediaUrls, { productName: name });

  const stock = product.stock as { inventoryStatus?: string } | undefined;
  void stock?.inventoryStatus;

  return {
    wix_product_id: String(product.id ?? wixSlug),
    wix_slug: wixSlug,
    name,
    price: pricing.price,
    compare_at: pricing.compare_at,
    currency: String((product.priceData as { currency?: string } | undefined)?.currency ?? "").trim().toUpperCase() || null,
    sku: String(product.sku ?? rich.sku ?? "").trim() || null,
    cost_of_goods: null,
    description_plain: descriptionPlain,
    source_url: wixProductPageUrl(wixSlug),
    source_catalog_id: sourceCatalogIdFromWixSlug(wixSlug),
    source_fingerprint: normalizeIdentity(name),
    category,
    media_urls: mediaUrls,
    visible: product.visible !== false,
    updated_at: String(product.lastUpdated ?? product.updatedDate ?? extractedAt),
    rich: {
      ...rich,
      description_html: descriptionHtml || rich.description_html,
      ribbon: rich.ribbon || decodeHtml(String((product.ribbons as Array<{ text?: string }> | undefined)?.[0]?.text ?? "")),
      included_items: [...new Set([...rich.included_items, ...parseIncludedFromDescription(descriptionHtml)])]
    }
  };
}

export async function fetchWixCatalogV1(options: {
  apiKey: string;
  siteId: string;
  baseUrl?: string;
}) {
  const baseUrl = options.baseUrl ?? "https://www.wixapis.com";
  const extractedAt = new Date().toISOString();
  const products: WixProductSnapshot[] = [];
  let offset = 0;

  while (true) {
    const response = await fetch(`${baseUrl}/stores-reader/v1/products/query`, {
      method: "POST",
      headers: {
        Authorization: options.apiKey,
        "Content-Type": "application/json",
        "wix-site-id": options.siteId
      },
      body: JSON.stringify({
        query: {
          paging: { limit: 100, offset }
        }
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Wix v1 query products failed (${response.status}): ${body.slice(0, 400)}`);
    }

    const payload = (await response.json()) as { products?: Array<Record<string, unknown>> };
    const batch = payload.products ?? [];
    for (const product of batch) {
      const normalized = normalizeWixV1Product(product, extractedAt);
      if (normalized) products.push(normalized);
    }

    if (batch.length < 100) break;
    offset += 100;
  }

  const deduped = new Map<string, WixProductSnapshot>();
  for (const product of products) {
    deduped.set(product.wix_product_id, product);
  }

  return {
    version: 1 as const,
    source: "wix-stores-api-v1" as const,
    site_id: options.siteId,
    extracted_at: extractedAt,
    product_count: deduped.size,
    products: [...deduped.values()].sort((a, b) => a.name.localeCompare(b.name))
  };
}
