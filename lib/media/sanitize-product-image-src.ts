/**
 * Normalize product image URLs before storage or next/image rendering.
 * Rejects empty, "/"-only, and other non-image placeholders that crash next/image.
 */
export function sanitizeProductImageSrc(value: string | null | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  if (trimmed === "/" || trimmed === "#" || trimmed === "null" || trimmed === "undefined") {
    return null;
  }

  if (trimmed.startsWith("/")) {
    // Relative site paths must look like real media assets, not bare "/".
    const pathname = trimmed.split("?")[0] ?? trimmed;
    if (pathname === "/" || pathname.length < 2) return null;
    return trimmed;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (!url.hostname || url.pathname === "/" && !url.search) {
        // Allow remote roots only when they clearly point at an object (storage paths).
        if (!url.pathname.includes("/storage/") && !/\.(avif|gif|jpe?g|png|webp|svg)$/i.test(url.pathname)) {
          return null;
        }
      }
      return trimmed;
    } catch {
      return null;
    }
  }

  // Blob / data URLs are preview-only and must never be persisted.
  if (/^(blob:|data:)/i.test(trimmed)) return null;

  return null;
}

export function sanitizeProductImageSrcList(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const sanitized = sanitizeProductImageSrc(value);
    if (!sanitized || seen.has(sanitized)) continue;
    seen.add(sanitized);
    result.push(sanitized);
  }
  return result;
}
