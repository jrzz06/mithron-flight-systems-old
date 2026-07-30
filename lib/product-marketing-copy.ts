import { clipProductPreviewText, sanitizeProductPreviewText } from "@/lib/product-preview-text";
import { isSpecLikeBlob } from "@/lib/product-spec-text";

type ProductMarketingInput = {
  name: string;
  category: string;
  tagline?: string | null;
  sourceDescription?: string | null;
};

function isPlaceholderMarketingCopy(value: string) {
  const normalized = value.trim();
  if (!normalized) return true;
  // Raw CMS shout-caps or leftover paren notes after sanitization.
  if (/^[A-Z0-9\s().,'%-]{12,}$/.test(normalized) && /quantit|discount|more number/i.test(normalized)) {
    return true;
  }
  if (/^\([^)]{0,80}\)$/.test(normalized)) return true;
  return false;
}

/**
 * Storefront tagline = Admin `tagline` only.
 * No category inference, no source_description fallback, no invented marketing copy.
 * Empty / placeholder / pure spec-blob → empty string (empty UI state).
 */
export function getProductMarketingTagline(input: ProductMarketingInput) {
  void input.name;
  void input.category;
  void input.sourceDescription;

  const candidate = sanitizeProductPreviewText(input.tagline ?? "").trim();
  if (!candidate || isSpecLikeBlob(candidate) || isPlaceholderMarketingCopy(candidate)) {
    return "";
  }

  return clipProductPreviewText(candidate, 120);
}
