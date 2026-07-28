/**
 * Canonical storefront product paths are always `/product/{slug}`.
 * Legacy Wix `product-page` and absolute foreign URLs must never leak into SEO.
 */

export function productPathFromSlug(slug: string): string {
  const clean = String(slug ?? "")
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/^product\//i, "")
    .replace(/^product-page\//i, "");
  if (!clean) return "/product";
  return `/product/${clean}`;
}

/** Extract a product slug from a legacy or absolute product URL when possible. */
export function extractProductSlugFromUrl(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  try {
    const asUrl = /^https?:\/\//i.test(raw) ? new URL(raw) : new URL(raw.startsWith("/") ? raw : `/${raw}`, "https://example.invalid");
    const match = asUrl.pathname.match(/^\/(?:product|product-page)\/([^/]+)\/?$/i);
    if (match?.[1]) return decodeURIComponent(match[1]);
  } catch {
    /* ignore */
  }

  const relative = raw.match(/^(?:\/)?(?:product|product-page)\/([^/?#]+)/i);
  return relative?.[1] ? decodeURIComponent(relative[1]) : null;
}

/**
 * Resolve the canonical relative product path.
 * Prefer the authoritative slug; fall back to parsing a stored product_url.
 */
export function resolveCanonicalProductPath(options: {
  slug?: string | null;
  productUrl?: string | null;
}): string {
  const slug = String(options.slug ?? "").trim();
  if (slug) return productPathFromSlug(slug);

  const fromUrl = extractProductSlugFromUrl(options.productUrl);
  if (fromUrl) return productPathFromSlug(fromUrl);

  return "/products";
}

/** True when a stored product_url is legacy/foreign and should be rewritten. */
export function isLegacyOrForeignProductUrl(productUrl: string | null | undefined): boolean {
  const raw = String(productUrl ?? "").trim();
  if (!raw) return true;
  if (/^https?:\/\//i.test(raw)) return true;
  if (raw.includes("product-page")) return true;
  return !raw.startsWith("/product/");
}
