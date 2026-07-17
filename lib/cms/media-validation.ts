import { assertSupabaseAdminConfig } from "@/lib/env";

const LOCAL_MEDIA_PATTERN = /^\/[a-zA-Z0-9/_.-]+$/;

function supabaseStorageHost(env: Record<string, string | undefined>) {
  try {
    const config = assertSupabaseAdminConfig(env);
    return new URL(config.url).hostname;
  } catch {
    const raw = env.NEXT_PUBLIC_SUPABASE_URL;
    if (!raw) return null;
    try {
      return new URL(raw).hostname;
    } catch {
      return null;
    }
  }
}

export function assertValidCmsMediaSrc(src: string, label: string, env: Record<string, string | undefined> = process.env) {
  const trimmed = src.trim();
  if (!trimmed) {
    throw new Error(`${label} is required. Choose an image from the media library or enter a valid path.`);
  }

  if (trimmed.startsWith("/")) {
    if (!LOCAL_MEDIA_PATTERN.test(trimmed)) {
      throw new Error(`${label} must be a valid site path (for example /media/...).`);
    }
    return trimmed;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`${label} must be a site path starting with / or a full HTTPS URL.`);
  }

  if (parsed.protocol !== "https:") {
    throw new Error(`${label} external URLs must use HTTPS.`);
  }

  const supabaseHost = supabaseStorageHost(env);
  const allowedHosts = new Set(
    [supabaseHost, env.NEXT_PUBLIC_SITE_URL ? new URL(env.NEXT_PUBLIC_SITE_URL).hostname : null].filter(Boolean) as string[]
  );

  if (supabaseHost && parsed.hostname === supabaseHost) {
    return trimmed;
  }

  if (parsed.hostname.endsWith(".supabase.co") && parsed.pathname.includes("/storage/v1/object/public/")) {
    return trimmed;
  }

  if (allowedHosts.has(parsed.hostname)) {
    return trimmed;
  }

  throw new Error(
    `${label} must point to Supabase Storage or a local /media path. Legacy external CDN URLs are not accepted for new CMS saves.`
  );
}

export function assertOptionalCmsMediaSrc(src: string | undefined | null, label: string, env?: Record<string, string | undefined>) {
  if (!src?.trim()) return "";
  return assertValidCmsMediaSrc(src, label, env);
}
