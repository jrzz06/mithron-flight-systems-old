/**
 * Rewrites public Supabase Storage URLs to a media CDN hostname when configured.
 *
 * Priority:
 * 1. NEXT_PUBLIC_MEDIA_CDN_ORIGIN (Cloudflare / custom CDN)
 * 2. Same-origin `{site}/cdn-media` proxy (default on local + Vercel)
 *    Disable with NEXT_PUBLIC_MEDIA_CDN_VIA_VERCEL=0
 *
 * Custom CDN example: https://media.mithron.com/storage/v1/object/public/...
 * Edge example: /cdn-media/storage/v1/object/public/...
 *
 * Hydration note: Next/Turbopack only reliably inlines statically referenced
 * `process.env.NEXT_PUBLIC_*` keys. Rewrite matching uses the URL pattern itself
 * (not an env-origin prefix compare) so SSR and client always agree.
 */
import { CANONICAL_PRODUCTION_HOST } from "@/lib/site-url";

const PUBLIC_STORAGE_PATH = "/storage/v1/object/public/";
const SUPABASE_PUBLIC_STORAGE_RE =
  /^https?:\/\/[^/]+\.supabase\.co(\/storage\/v1\/object\/public\/.+)$/i;

// Module-scope static reads — required for client-bundle inlining.
const PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUBLIC_MEDIA_CDN_ORIGIN = process.env.NEXT_PUBLIC_MEDIA_CDN_ORIGIN;
const PUBLIC_MEDIA_CDN_VIA_VERCEL = process.env.NEXT_PUBLIC_MEDIA_CDN_VIA_VERCEL;
const PUBLIC_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;

/**
 * Next.js only inlines `NEXT_PUBLIC_*` when each key is read statically.
 * Keep both a module-scope reference (bundler) and a live static read (tests can override).
 */
export function readMediaCdnPublicEnv(): Record<string, string | undefined> {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_MEDIA_CDN_ORIGIN: process.env.NEXT_PUBLIC_MEDIA_CDN_ORIGIN ?? PUBLIC_MEDIA_CDN_ORIGIN,
    NEXT_PUBLIC_MEDIA_CDN_VIA_VERCEL: process.env.NEXT_PUBLIC_MEDIA_CDN_VIA_VERCEL ?? PUBLIC_MEDIA_CDN_VIA_VERCEL,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? PUBLIC_SITE_URL,
    // Server-only fallbacks used by getMediaCdnOrigin; harmless when undefined on the client.
    MITHRON_PRODUCTION_HOST: process.env.MITHRON_PRODUCTION_HOST,
    VERCEL: process.env.VERCEL,
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
    MITHRON_STORAGE_PROVIDER: process.env.MITHRON_STORAGE_PROVIDER,
    MITHRON_R2_PUBLIC_ORIGIN: process.env.MITHRON_R2_PUBLIC_ORIGIN
  };
}

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
  const flag = (env.NEXT_PUBLIC_MEDIA_CDN_VIA_VERCEL ?? PUBLIC_MEDIA_CDN_VIA_VERCEL)?.trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off") return false;
  if (flag === "1" || flag === "true" || flag === "on") return true;
  // Default on for local + Vercel so storefront media URLs stay 1:1 (`/cdn-media/...`).
  // Opt out explicitly with NEXT_PUBLIC_MEDIA_CDN_VIA_VERCEL=0.
  return true;
}

/**
 * Returns the CDN origin used by rewriteStorageUrlForCdn.
 * Custom CDN → bare origin. Vercel edge mode → `{siteOrigin}/cdn-media`.
 */
export function getMediaCdnOrigin(env: Record<string, string | undefined> = readMediaCdnPublicEnv()) {
  const custom = parseOrigin(env.NEXT_PUBLIC_MEDIA_CDN_ORIGIN ?? PUBLIC_MEDIA_CDN_ORIGIN);
  if (custom) return custom;

  if (!vercelMediaCdnEnabled(env)) return null;
  const siteOrigin = resolveSiteOrigin(env);
  if (!siteOrigin) return null;
  return `${siteOrigin}/cdn-media`;
}

export function getSupabaseStorageOrigin(env: Record<string, string | undefined> = readMediaCdnPublicEnv()) {
  return parseOrigin(env.NEXT_PUBLIC_SUPABASE_URL ?? PUBLIC_SUPABASE_URL);
}

/** Extract `/storage/v1/object/public/...` from a Supabase public storage URL. */
function matchSupabasePublicStoragePath(src: string): string | null {
  const match = src.match(SUPABASE_PUBLIC_STORAGE_RE);
  return match?.[1] ?? null;
}

export function rewriteStorageUrlForCdn(
  src: string,
  env: Record<string, string | undefined> = readMediaCdnPublicEnv()
): string {
  const trimmed = src?.trim() ?? "";
  if (!trimmed) return trimmed;

  // Pattern-match any *.supabase.co public storage URL so client bundles do not
  // need NEXT_PUBLIC_SUPABASE_URL inlined to produce the same /cdn-media path as SSR.
  const storagePath = matchSupabasePublicStoragePath(trimmed);
  if (!storagePath) {
    // Preserve previous strict behavior for non-supabase hosts when env origin is set
    // (e.g. custom self-hosted storage that still uses the public path shape).
    const storageOrigin = getSupabaseStorageOrigin(env);
    if (!storageOrigin || !trimmed.startsWith(storageOrigin) || !trimmed.includes(PUBLIC_STORAGE_PATH)) {
      return trimmed;
    }
    const path = trimmed.slice(storageOrigin.length);
    const custom = parseOrigin(env.NEXT_PUBLIC_MEDIA_CDN_ORIGIN ?? PUBLIC_MEDIA_CDN_ORIGIN);
    if (custom) return `${custom}${path}`;
    if (!vercelMediaCdnEnabled(env)) return trimmed;
    return `/cdn-media${path}`;
  }

  const custom = parseOrigin(env.NEXT_PUBLIC_MEDIA_CDN_ORIGIN ?? PUBLIC_MEDIA_CDN_ORIGIN);
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
  env: Record<string, string | undefined> = readMediaCdnPublicEnv()
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

  const custom = parseOrigin(env.NEXT_PUBLIC_MEDIA_CDN_ORIGIN ?? PUBLIC_MEDIA_CDN_ORIGIN);
  if (custom && trimmed.startsWith(custom) && trimmed.includes(PUBLIC_STORAGE_PATH)) {
    return `${storageOrigin}${trimmed.slice(custom.length)}`;
  }

  return trimmed;
}

export function isMediaCdnHostname(hostname: string, env: Record<string, string | undefined> = readMediaCdnPublicEnv()) {
  const cdnOrigin = getMediaCdnOrigin(env);
  if (!cdnOrigin) return false;
  try {
    return new URL(cdnOrigin.includes("://") ? cdnOrigin : `https://${cdnOrigin}`).hostname === hostname;
  } catch {
    return false;
  }
}

/**
 * True when `src` points at Supabase public storage — either the direct
 * `*.supabase.co` URL or a CDN-rewritten equivalent (`/cdn-media/…` or custom CDN origin).
 * Used by catalog image gates so CDN delivery does not falsely reject valid product media.
 */
export function isTrustedCatalogStorageSrc(
  src: string,
  env: Record<string, string | undefined> = readMediaCdnPublicEnv()
): boolean {
  const trimmed = src?.trim() ?? "";
  if (!trimmed || !trimmed.includes(PUBLIC_STORAGE_PATH)) return false;

  if (SUPABASE_PUBLIC_STORAGE_RE.test(trimmed)) {
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

/**
 * Stable identity for comparing product media URLs that may differ only by
 * delivery form (`/cdn-media/...` vs absolute `*.supabase.co/...`).
 * Used to prevent duplicate PDP thumbs for the same storage object.
 */
export function mediaSrcIdentityKey(
  src: string,
  env: Record<string, string | undefined> = readMediaCdnPublicEnv()
): string {
  const trimmed = src?.trim() ?? "";
  if (!trimmed) return "";

  const unwrapped = unwrapCdnStorageUrl(trimmed, env).split("?")[0].trim();
  const storageMatch = unwrapped.match(/\/storage\/v1\/object\/public\/(.+)$/i);
  if (storageMatch?.[1]) {
    return storageMatch[1].replace(/\/+/g, "/").toLowerCase();
  }

  try {
    const pathname = /^https?:\/\//i.test(unwrapped)
      ? new URL(unwrapped).pathname
      : unwrapped.startsWith("/")
        ? unwrapped
        : `/${unwrapped}`;
    const basename = pathname.split("/").filter(Boolean).pop();
    return (basename || pathname).toLowerCase();
  } catch {
    return unwrapped.toLowerCase();
  }
}
