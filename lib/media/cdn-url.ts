/**
 * Rewrites public Supabase Storage URLs to a Cloudflare (or other) media CDN hostname
 * when NEXT_PUBLIC_MEDIA_CDN_ORIGIN is configured.
 *
 * Example: https://media.mithron.com/storage/v1/object/public/... proxies to Supabase origin.
 */
export function getMediaCdnOrigin(env: Record<string, string | undefined> = process.env) {
  const raw = env.NEXT_PUBLIC_MEDIA_CDN_ORIGIN?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    return url.origin;
  } catch {
    return null;
  }
}

export function getSupabaseStorageOrigin(env: Record<string, string | undefined> = process.env) {
  const raw = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
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

  return `${cdnOrigin}${trimmed.slice(storageOrigin.length)}`;
}

export function isMediaCdnHostname(hostname: string, env: Record<string, string | undefined> = process.env) {
  const cdnOrigin = getMediaCdnOrigin(env);
  if (!cdnOrigin) return false;
  try {
    return new URL(cdnOrigin).hostname === hostname;
  } catch {
    return false;
  }
}
