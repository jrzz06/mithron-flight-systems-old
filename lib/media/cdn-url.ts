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
  const fromVercelProduction = parseOrigin(env.VERCEL_PROJECT_PRODUCTION_URL);
  if (fromVercelProduction) return fromVercelProduction;
  if (env.VERCEL === "1") {
    return parseOrigin(CANONICAL_PRODUCTION_HOST);
  }
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

  const cdnOrigin = getMediaCdnOrigin(env);
  const storageOrigin = getSupabaseStorageOrigin(env);
  if (!cdnOrigin || !storageOrigin) return trimmed;

  if (!trimmed.startsWith(storageOrigin)) return trimmed;
  if (!trimmed.includes("/storage/v1/object/public/")) return trimmed;

  // cdnOrigin may include a path prefix (e.g. https://host/cdn-media).
  try {
    const cdn = new URL(cdnOrigin.includes("://") ? cdnOrigin : `https://${cdnOrigin}`);
    const storagePath = trimmed.slice(storageOrigin.length);
    return `${cdn.origin}${cdn.pathname.replace(/\/$/, "")}${storagePath}`;
  } catch {
    return `${cdnOrigin}${trimmed.slice(storageOrigin.length)}`;
  }
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
