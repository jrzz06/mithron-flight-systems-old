import { isMediaCdnHostname } from "@/lib/media/cdn-url";

const IMAGE_EXTENSION = /\.(avif|gif|jpe?g|png|webp|svg|ico)$/i;
const LOCAL_MEDIA_PREFIX = /^\/(?:media|assets|optimized)\//;

function supabaseImageHostname(env: Record<string, string | undefined>) {
  const rawUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  if (!rawUrl) return null;
  try {
    return new URL(rawUrl).hostname;
  } catch {
    return null;
  }
}

function pathnameLooksLikeImage(pathname: string) {
  return LOCAL_MEDIA_PREFIX.test(pathname) || IMAGE_EXTENSION.test(pathname);
}

function isAllowedRemoteImageUrl(parsed: URL, env: Record<string, string | undefined>) {
  if (parsed.protocol !== "https:") return false;

  const supabaseHost = supabaseImageHostname(env);
  if (supabaseHost && parsed.hostname === supabaseHost) {
    return parsed.pathname.includes("/storage/v1/object/public/") || pathnameLooksLikeImage(parsed.pathname);
  }

  if (parsed.hostname.endsWith(".supabase.co") && parsed.pathname.includes("/storage/v1/object/public/")) {
    return true;
  }

  if (parsed.hostname === "media.gettyimages.com") {
    return true;
  }

  if (isMediaCdnHostname(parsed.hostname, env) && parsed.pathname.includes("/storage/v1/object/public/")) {
    return true;
  }

  return false;
}

export function isNextImageRenderableSrc(
  src: string,
  env: Record<string, string | undefined> = process.env
) {
  const trimmed = src.trim();
  if (!trimmed) return false;

  if (trimmed.startsWith("/")) {
    const pathname = trimmed.split("?")[0] ?? trimmed;
    if (trimmed.includes("?") && !LOCAL_MEDIA_PREFIX.test(pathname)) {
      return false;
    }
    return pathnameLooksLikeImage(pathname);
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }

  return isAllowedRemoteImageUrl(parsed, env);
}

export function resolveNextImageSrc(
  src: string | null | undefined,
  env: Record<string, string | undefined> = process.env
) {
  if (!src?.trim()) return null;
  return isNextImageRenderableSrc(src, env) ? src.trim() : null;
}
