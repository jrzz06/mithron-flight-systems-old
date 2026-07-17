import type { Product } from "@/config/types";
import { clipProductPreviewText, sanitizeProductPreviewText } from "@/lib/product-preview-text";
import { prepareEditorHtmlForDisplay } from "@/lib/editor/prepare-html";
import { normalizeProductDescriptionHtml, decodeDescriptionEntities, isUnstructuredDescription, descriptionNormalizePlainText } from "@/lib/product-description-normalize";
import { isSpecLikeBlob, sortSpecEntries, expandSpecEntries, isHighlightSpecValue } from "@/lib/product-spec-text";
const HIDDEN_SPEC_KEYS = new Set(["Product ID", "Source", "Currency", "Category", "Availability"]);

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

export function getCustomerFacingSpecs(product: Product) {
  const raw = Object.entries(product.specs).filter(([key, value]) => {
    if (HIDDEN_SPEC_KEYS.has(key)) return false;
    return Boolean(value.trim());
  });

  return sortSpecEntries(expandSpecEntries(raw));
}

export function getHighlightSpecs(product: Product, limit = 6) {
  const specs = getCustomerFacingSpecs(product).filter(([, value]) => isHighlightSpecValue(value));
  const ranked = specs.sort(([left], [right]) => {
    const leftRank = HIGHLIGHT_SPEC_KEYS.findIndex((key) => key.toLowerCase() === left.toLowerCase());
    const rightRank = HIGHLIGHT_SPEC_KEYS.findIndex((key) => key.toLowerCase() === right.toLowerCase());
    const safeLeft = leftRank >= 0 ? leftRank : HIGHLIGHT_SPEC_KEYS.length;
    const safeRight = rightRank >= 0 ? rightRank : HIGHLIGHT_SPEC_KEYS.length;
    return safeLeft - safeRight;
  });

  return ranked.slice(0, limit);
}

function plainDescriptionText(value: string) {
  return sanitizeProductPreviewText(value).trim();
}

function hasHtmlTags(value: string) {
  return /<[^>]+>/.test(value);
}

function normalizeStoredDescriptionHtml(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const decoded = decodeDescriptionEntities(trimmed);
  const plain = descriptionNormalizePlainText(decoded);
  const needsStructuralNormalize =
    /&#\d+;|&#x[0-9a-f]+;/i.test(trimmed)
    || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFEFF]/.test(decoded)
    || isSpecLikeBlob(plain)
    || isUnstructuredDescription(plain, trimmed)
    || (!hasHtmlTags(trimmed) && plain.includes(":"));

  if (!needsStructuralNormalize && hasHtmlTags(trimmed)) {
    return prepareEditorHtmlForDisplay(decoded);
  }

  const normalized = normalizeProductDescriptionHtml(trimmed);
  if (!normalized) return null;
  return prepareEditorHtmlForDisplay(normalized);
}

export function getProductDescriptionHtml(product: Product): string | null {
  const description = product.description?.trim();
  if (description) {
    return normalizeStoredDescriptionHtml(description);
  }

  const sourceDescription = product.sourceDescription?.trim();
  if (sourceDescription) {
    return normalizeStoredDescriptionHtml(sourceDescription);
  }

  return null;
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
  return prepareEditorHtmlForDisplay(description);
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

  const sourceDescription = product.sourceDescription?.trim();
  if (sourceDescription) {
    return plainDescriptionText(sourceDescription);
  }

  const candidates = [
    product.seoDescription,
    product.ogDescription,
    ...product.story.map((chapter) => chapter.body),
    ...product.bundles.map((bundle) => bundle.description)
  ]
    .map((value) => cleanCopy(value))
    .filter(Boolean);

  const unique = [...new Set(candidates)];
  return unique.sort((left, right) => right.length - left.length)[0] ?? "";
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
  if (options?.includeFallback === false) return [];

  const overview = getProductOverviewText(product);
  if (!overview) return [];

  return [{
    id: "overview",
    kicker: product.category,
    title: product.name,
    body: overview,
    media: product.hero,
    align: "center" as const
  }];
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
