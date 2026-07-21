/**
 * Rewrites public Supabase Storage URLs to a media CDN hostname when configured.
 *
 * Priority:
 * 1. NEXT_PUBLIC_MEDIA_CDN_ORIGIN (Cloudflare / custom CDN)
 * 2. Vercel edge proxy at `{site}/cdn-media` when NEXT_PUBLIC_MEDIA_CDN_VIA_VERCEL=1
 *    (or auto-enabled on Vercel when no custom CDN is set)
 *
 * Custom CDN example: https://media.mithron.com/storage/v1/object/public/...
 * Vercel edge example: https://final-mithron-deploy.vercel.app/cdn-media/storage/v1/object/public/...
 */
import { CANONICAL_PRODUCTION_HOST } from "@/lib/site-url";

function parseOrigin(raw: string | undefined | null): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    return url.origin;
  } catch {
    return null;
  }
}

function resolveSiteOrigin(env: Record<string, string | undefined>): string | null {
  const fromSite = parseOrigin(env.NEXT_PUBLIC_SITE_URL);
  if (fromSite) return fromSite;
  const fromProductionHost = parseOrigin(env.MITHRON_PRODUCTION_HOST);
  if (fromProductionHost) return fromProductionHost;
  // Prefer the known production alias over VERCEL_PROJECT_PRODUCTION_URL
  // (project *.vercel.app hosts often lack a working /cdn-media rewrite).
  if (env.VERCEL === "1" || env.VERCEL_ENV) {
    return parseOrigin(CANONICAL_PRODUCTION_HOST);
  }
  const fromVercelProduction = parseOrigin(env.VERCEL_PROJECT_PRODUCTION_URL);
  if (fromVercelProduction) return fromVercelProduction;
  return null;
}

function vercelMediaCdnEnabled(env: Record<string, string | undefined>): boolean {
  const flag = env.NEXT_PUBLIC_MEDIA_CDN_VIA_VERCEL?.trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off") return false;
  if (flag === "1" || flag === "true" || flag === "on") return true;
  // Auto-enable on Vercel when no custom CDN origin is configured.
  return Boolean(env.VERCEL === "1" || env.VERCEL_ENV);
}

/**
 * Returns the CDN origin used by rewriteStorageUrlForCdn.
 * Custom CDN → bare origin. Vercel edge mode → `{siteOrigin}/cdn-media`.
 */
export function getMediaCdnOrigin(env: Record<string, string | undefined> = process.env) {
  const custom = parseOrigin(env.NEXT_PUBLIC_MEDIA_CDN_ORIGIN);
  if (custom) return custom;

  if (!vercelMediaCdnEnabled(env)) return null;
  const siteOrigin = resolveSiteOrigin(env);
  if (!siteOrigin) return null;
  return `${siteOrigin}/cdn-media`;
}

export function getSupabaseStorageOrigin(env: Record<string, string | undefined> = process.env) {
  return parseOrigin(env.NEXT_PUBLIC_SUPABASE_URL);
}

export function rewriteStorageUrlForCdn(
  src: string,
  env: Record<string, string | undefined> = process.env
): string {
  const trimmed = src?.trim() ?? "";
  if (!trimmed) return trimmed;

  const storageOrigin = getSupabaseStorageOrigin(env);
  if (!storageOrigin) return trimmed;
  if (!trimmed.startsWith(storageOrigin)) return trimmed;
  if (!trimmed.includes("/storage/v1/object/public/")) return trimmed;

  const storagePath = trimmed.slice(storageOrigin.length);
  const custom = parseOrigin(env.NEXT_PUBLIC_MEDIA_CDN_ORIGIN);
  if (custom) {
    return `${custom}${storagePath}`;
  }

  if (!vercelMediaCdnEnabled(env)) return trimmed;

  // Same-origin relative path so every Vercel host (alias, preview, project URL)
  // hits its own /cdn-media rewrite — avoids CORP blocks and stale cross-host HTML caches.
  return `/cdn-media${storagePath}`;
}

/** Reverse a /cdn-media (or absolute CDN) storage URL back to the Supabase public URL. */
export function unwrapCdnStorageUrl(
  src: string,
  env: Record<string, string | undefined> = process.env
): string {
  const trimmed = src?.trim() ?? "";
  if (!trimmed) return trimmed;

  const storageOrigin = getSupabaseStorageOrigin(env);
  if (!storageOrigin) return trimmed;

  const relativeMatch = trimmed.match(/^\/cdn-media(\/storage\/v1\/object\/public\/.+)$/i);
  if (relativeMatch) return `${storageOrigin}${relativeMatch[1]}`;

  const absoluteMatch = trimmed.match(/\/cdn-media(\/storage\/v1\/object\/public\/.+)$/i);
  if (absoluteMatch && isTrustedCatalogStorageSrc(trimmed, env)) {
    return `${storageOrigin}${absoluteMatch[1]}`;
  }

  const custom = parseOrigin(env.NEXT_PUBLIC_MEDIA_CDN_ORIGIN);
  if (custom && trimmed.startsWith(custom) && trimmed.includes(PUBLIC_STORAGE_PATH)) {
    return `${storageOrigin}${trimmed.slice(custom.length)}`;
  }

  return trimmed;
}

export function isMediaCdnHostname(hostname: string, env: Record<string, string | undefined> = process.env) {
  const cdnOrigin = getMediaCdnOrigin(env);
  if (!cdnOrigin) return false;
  try {
    return new URL(cdnOrigin.includes("://") ? cdnOrigin : `https://${cdnOrigin}`).hostname === hostname;
  } catch {
    return false;
  }
}

const PUBLIC_STORAGE_PATH = "/storage/v1/object/public/";

/**
 * True when `src` points at Supabase public storage — either the direct
 * `*.supabase.co` URL or a CDN-rewritten equivalent (`/cdn-media/…` or custom CDN origin).
 * Used by catalog image gates so CDN delivery does not falsely reject valid product media.
 */
export function isTrustedCatalogStorageSrc(
  src: string,
  env: Record<string, string | undefined> = process.env
): boolean {
  const trimmed = src?.trim() ?? "";
  if (!trimmed || !trimmed.includes(PUBLIC_STORAGE_PATH)) return false;

  if (/^https?:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\//i.test(trimmed)) {
    return true;
  }

  // Same-origin relative CDN path used by rewriteStorageUrlForCdn in Vercel mode.
  if (/^\/cdn-media\/storage\/v1\/object\/public\//i.test(trimmed)) {
    return true;
  }

  const cdnOrigin = getMediaCdnOrigin(env);
  if (cdnOrigin) {
    const normalizedCdn = cdnOrigin.replace(/\/$/, "");
    if (trimmed.startsWith(normalizedCdn)) return true;
  }

  if (/\/cdn-media\/storage\/v1\/object\/public\//i.test(trimmed)) {
    return true;
  }

  return false;
}
