import { CmsValidationError } from "@/services/cms-crud";
import { resolveDroneCareStorefrontHref } from "@/lib/catalog-categories";

const BLOCKED_SCHEME_PATTERN = /^\s*(javascript:|data:|vbscript:|file:)/i;
const RELATIVE_HREF_PATTERN = /^\/(?!\/)/;
const SAFE_RELATIVE_HREF_PATTERN = /^\/[a-zA-Z0-9/_.?#&=%\-]*$/;

export function assertValidCmsHref(href: string, label: string): string {
  const trimmed = href.trim();
  if (!trimmed) {
    throw new CmsValidationError(`${label} href is required.`);
  }

  if (BLOCKED_SCHEME_PATTERN.test(trimmed)) {
    throw new CmsValidationError(`${label} href uses a blocked URL scheme.`);
  }

  if (trimmed.startsWith("//")) {
    throw new CmsValidationError(`${label} href must not be protocol-relative.`);
  }

  if (RELATIVE_HREF_PATTERN.test(trimmed)) {
    if (!SAFE_RELATIVE_HREF_PATTERN.test(trimmed)) {
      throw new CmsValidationError(`${label} href contains invalid characters.`);
    }
    return trimmed;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new CmsValidationError(`${label} href must be a relative path or a valid HTTP(S) URL.`);
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new CmsValidationError(`${label} external href must use HTTP or HTTPS.`);
  }

  return trimmed;
}

export function sanitizePublicCmsHref(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value.trim()) return fallback;

  try {
    return resolveDroneCareStorefrontHref(assertValidCmsHref(value, "Link"), fallback);
  } catch {
    return fallback;
  }
}
