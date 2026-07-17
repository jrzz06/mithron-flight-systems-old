export type DbProductRow = {
  slug: string;
  name: string;
  tagline?: string | null;
  price?: number | null;
  compare_at?: number | null;
  on_sale?: boolean | null;
  description?: string | null;
  source_description?: string | null;
  source_catalog_id?: string | null;
  source_url?: string | null;
  source_fingerprint?: string | null;
  category?: string | null;
  workflow_status?: string | null;
  is_visible?: boolean | null;
  image?: { src?: string } | null;
  seo_title?: string | null;
  seo_description?: string | null;
  tax_group?: string | null;
  merge_status?: string | null;
  merged_into_slug?: string | null;
};

export type WixProductLike = {
  wix_product_id: string;
  wix_slug: string;
  name: string;
  price: number;
  compare_at: number | null;
  description_plain: string;
  source_url: string;
  source_catalog_id: string;
  source_fingerprint: string;
  category: string;
  media_urls: string[];
  visible: boolean;
};

export type ProductSignals = {
  slug: string;
  hasPrimaryMedia: boolean;
  hasValidImage: boolean;
  orderItemCount: number;
  warehouseStockCount: number;
  inventoryCount: number;
  seoFieldCount: number;
};

export type ScoreCanonicalInput = {
  row: DbProductRow;
  signals: ProductSignals;
  wixMatch: WixProductLike | null;
};

function isBrokenImageSrc(src: string | undefined) {
  if (!src?.trim()) return true;
  if (/placeholder|broken|data:image/i.test(src)) return true;
  if (/wixstatic\.com/i.test(src)) return true;
  return false;
}

export function scoreCanonicalCandidate(input: ScoreCanonicalInput) {
  const { row, signals, wixMatch } = input;
  let score = 0;

  if (signals.hasPrimaryMedia) score += 120;
  if (signals.hasValidImage && !isBrokenImageSrc(row.image?.src)) score += 80;
  if (row.source_catalog_id?.startsWith("mithron-")) score += 60;
  if (wixMatch) score += 40;
  if (row.slug.startsWith("source-")) score += 35;
  if (row.workflow_status === "published" && row.is_visible !== false) score += 30;
  if (row.description?.trim()) score += 20;
  if (row.source_description?.trim()) score += 15;
  if (signals.orderItemCount > 0) score += 200 + signals.orderItemCount;
  if (signals.warehouseStockCount > 0) score += 40 + signals.warehouseStockCount;
  if (signals.inventoryCount > 0) score += 25 + signals.inventoryCount;
  if (signals.seoFieldCount > 0) score += signals.seoFieldCount * 5;
  if (row.merge_status === "archived_merged") score -= 500;
  if (isBrokenImageSrc(row.image?.src)) score -= 60;

  return score;
}

export function pickCanonicalSlug(candidates: ScoreCanonicalInput[]) {
  if (!candidates.length) return null;
  const ranked = [...candidates].sort((a, b) => {
    const delta = scoreCanonicalCandidate(b) - scoreCanonicalCandidate(a);
    if (delta !== 0) return delta;
    return a.row.slug.localeCompare(b.row.slug);
  });
  return ranked[0]?.row.slug ?? null;
}

export function plainTextToDescriptionHtml(text: string | null | undefined) {
  const normalized = String(text ?? "").replace(/\r\n/g, "\n").trim();
  if (!normalized) return null;
  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (!paragraphs.length) return null;
  return paragraphs
    .map((part) => `<p>${part.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")}</p>`)
    .join("");
}

export function deriveSaleFields(price: number, compareAt: number | null) {
  const salePrice = Number(price) || 0;
  const regularPrice = compareAt ? Number(compareAt) : null;
  if (regularPrice && regularPrice > salePrice) {
    return {
      price: salePrice,
      compare_at: regularPrice,
      on_sale: true,
      discount_type: "amount" as const,
      discount_value: Math.round((regularPrice - salePrice) * 100) / 100
    };
  }
  return {
    price: salePrice,
    compare_at: null,
    on_sale: false,
    discount_type: null,
    discount_value: null
  };
}

export function buildWixPatch(row: DbProductRow, wix: WixProductLike, options: { forceDescription?: boolean }) {
  const pricing = deriveSaleFields(wix.price, wix.compare_at);
  const patch: Record<string, unknown> = {
    price: pricing.price,
    compare_at: pricing.compare_at,
    on_sale: pricing.on_sale,
    discount_type: pricing.discount_type,
    discount_value: pricing.discount_value,
    source_description: wix.description_plain || row.source_description,
    source_url: wix.source_url,
    source_catalog_id: wix.source_catalog_id,
    source_fingerprint: wix.source_fingerprint,
    updated_at: new Date().toISOString()
  };

  if (!row.source_url) patch.source_url = wix.source_url;
  if (!row.source_catalog_id) patch.source_catalog_id = wix.source_catalog_id;

  const shouldSetDescription = options.forceDescription || !row.description?.trim();
  if (shouldSetDescription && wix.description_plain.trim()) {
    patch.description = plainTextToDescriptionHtml(wix.description_plain);
    patch.tagline = wix.description_plain.slice(0, 180);
  }

  if (!row.category?.trim() || row.category === "Imported Wix Inventory") {
    patch.category = wix.category;
  }

  return patch;
}

function mergeGapFillPatch(
  canonical: DbProductRow,
  donors: DbProductRow[]
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  for (const donor of donors) {
    if (!canonical.description?.trim() && donor.description?.trim()) patch.description = donor.description;
    if (!canonical.tagline?.trim() && donor.tagline?.trim()) patch.tagline = donor.tagline;
    if (!canonical.source_description?.trim() && donor.source_description?.trim()) {
      patch.source_description = donor.source_description;
    }
    if (!canonical.seo_title?.trim() && donor.seo_title?.trim()) patch.seo_title = donor.seo_title;
    if (!canonical.seo_description?.trim() && donor.seo_description?.trim()) {
      patch.seo_description = donor.seo_description;
    }
    if (!canonical.tax_group?.trim() && donor.tax_group?.trim()) patch.tax_group = donor.tax_group;
    if (isBrokenImageSrc(canonical.image?.src) && !isBrokenImageSrc(donor.image?.src)) {
      patch.image = donor.image;
    }
  }

  if (Object.keys(patch).length) {
    patch.updated_at = new Date().toISOString();
  }

  return patch;
}
