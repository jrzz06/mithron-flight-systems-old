import type { Product } from "@/config/types";
import { clipProductPreviewText, sanitizeProductPreviewText } from "@/lib/product-preview-text";
import { isSpecLikeBlob, isHighlightSpecValue } from "@/lib/product-spec-text";

const HIDDEN_SPEC_KEYS = new Set(["Product ID", "Source", "Currency", "Category"]);

const HIGHLIGHT_SPEC_KEYS = [
  "Endurance",
  "Flight Time",
  "Range (LoS)",
  "Range",
  "Maximum All-Up-Weight",
  "Maximum Takeoff Weight",
  "Payload Capacity",
  "Payload",
  "Wind Resistance",
  "Maximum Speed",
  "Battery Capacity",
  "Battery",
  "Storage",
  "Warranty",
  "Operating Altitude",
  "Maximum Operating Altitude",
  "UAV Type",
  "UAV Category",
  "Dimensions",
  "Weight"
] as const;

function cleanCopy(value: string | null | undefined) {
  const clean = sanitizeProductPreviewText(value ?? "").trim();
  if (!clean || isSpecLikeBlob(clean)) return "";
  return clean;
}

/** Admin-entered specs only, in stored order — no sort, expand, or invented rows. */
export function getCustomerFacingSpecs(product: Product) {
  if (!product || typeof product !== "object" || !product.specs) return [];

  let rawEntries: Array<[string, string]> = [];
  if (Array.isArray(product.specs)) {
    rawEntries = (product.specs as Array<{ key?: string; value?: string }>)
      .filter((item) => item && typeof item === "object" && Boolean(item.key?.trim()) && Boolean(item.value?.trim()))
      .map((item) => [item.key!.trim(), item.value!.trim()]);
  } else if (typeof product.specs === "object") {
    rawEntries = Object.entries(product.specs).filter(([key, value]) => {
      if (HIDDEN_SPEC_KEYS.has(key)) return false;
      return Boolean(typeof value === "string" && value.trim());
    });
  }

  return rawEntries;
}

export function getHighlightSpecs(product: Product, limit = 6) {
  // Prefer Admin order; only rank among the already-filtered list for compact highlight chips.
  const specs = getCustomerFacingSpecs(product).filter(([, value]) => isHighlightSpecValue(value));
  const ranked = [...specs].sort(([left], [right]) => {
    const leftRank = HIGHLIGHT_SPEC_KEYS.findIndex((key) => key.toLowerCase() === left.toLowerCase());
    const rightRank = HIGHLIGHT_SPEC_KEYS.findIndex((key) => key.toLowerCase() === right.toLowerCase());
    const safeLeft = leftRank >= 0 ? leftRank : HIGHLIGHT_SPEC_KEYS.length;
    const safeRight = rightRank >= 0 ? rightRank : HIGHLIGHT_SPEC_KEYS.length;
    if (safeLeft !== safeRight) return safeLeft - safeRight;
    // Stable relative to Admin order when ranks tie / both unknown.
    return specs.findIndex(([k]) => k === left) - specs.findIndex(([k]) => k === right);
  });

  return ranked.slice(0, limit);
}

function plainDescriptionText(value: string) {
  return sanitizeProductPreviewText(value).trim();
}

/**
 * Admin `description` HTML only — pass-through for the render boundary.
 * XSS sanitize happens exactly once in EditorRenderedContent.
 */
export function getProductDescriptionHtml(product: Product): string | null {
  const description = product.description?.trim();
  return description || null;
}

export function getProductBuyBoxSummary(product: Product) {
  const tagline = cleanCopy(product.tagline);
  if (!tagline) return "";
  return clipProductPreviewText(tagline, 140);
}

export function getProductOverviewHtml(product: Product) {
  const description = product.description?.trim();
  if (!description) return null;
  if (!/<[^>]+>/.test(description)) return null;
  return description;
}

export function getProductOverviewText(product: Product) {
  const description = product.description?.trim();
  if (description && !/<[^>]+>/.test(description)) {
    return plainDescriptionText(description);
  }

  const htmlOverview = getProductOverviewHtml(product);
  if (htmlOverview) {
    return plainDescriptionText(htmlOverview.replace(/<[^>]+>/g, " "));
  }

  // Admin SEO / tagline only — never invent from source_description, story, or bundles.
  const candidates = [product.seoDescription, product.tagline]
    .map((value) => cleanCopy(value))
    .filter(Boolean);

  return candidates[0] ?? "";
}

export function getStoryChapters(product: Product, options?: { includeFallback?: boolean }) {
  const chapters = product.story
    .map((chapter) => ({
      ...chapter,
      title: cleanCopy(chapter.title) || product.name,
      body: cleanCopy(chapter.body),
      kicker: cleanCopy(chapter.kicker) || product.category
    }))
    .filter((chapter) => chapter.title || chapter.body);

  if (chapters.length) return chapters;
  // Never invent synthetic story chapters from overview/tagline.
  void options;
  return [];
}

export function getDedicatedProductStoryChapters(product: Product, options?: { includeFallback?: boolean }) {
  const dedicated = /^(features|warranty|disclaimers|downloads|applications)$/i;
  return getStoryChapters(product, options).filter((chapter) => {
    if (dedicated.test(chapter.kicker.trim())) return false;
    if (/^key features$/i.test(chapter.title.trim())) return false;
    if (/important notes/i.test(chapter.title.trim())) return false;
    return true;
  });
}

function hasRichProductDetail(product: Product) {
  return (
    getHighlightSpecs(product).length > 0
    || Boolean(getProductOverviewText(product))
    || getStoryChapters(product).length > 0
    || getCustomerFacingSpecs(product).length > 0
  );
}
