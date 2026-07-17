const WIX_STATIC_PATTERN = /wixstatic\.com/i;
const SUPABASE_STORAGE_PATTERN = /^https?:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\//i;

export function isWixStaticUrl(url: string) {
  return WIX_STATIC_PATTERN.test(url.trim());
}

export function isSupabaseProductStorageUrl(url: string) {
  return SUPABASE_STORAGE_PATTERN.test(url.trim());
}

export function isExternalHttpsMediaUrl(url: string) {
  return /^https:\/\//i.test(url.trim());
}

/** Product media fields may only reference Supabase public storage URLs. */
export function isAllowedProductMediaUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/")) return true;
  return isSupabaseProductStorageUrl(trimmed);
}

export function isBlockedExternalMediaUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (isWixStaticUrl(trimmed)) return true;
  if (isExternalHttpsMediaUrl(trimmed) && !isSupabaseProductStorageUrl(trimmed)) return true;
  return false;
}

export function assertAllowedProductMediaUrl(url: string, label = "Product media URL") {
  const trimmed = url.trim();
  if (!trimmed) return;

  if (isWixStaticUrl(trimmed)) {
    throw new Error(`${label} cannot use Wix URLs. Upload via admin or run media ingest.`);
  }

  if (isExternalHttpsMediaUrl(trimmed) && !isSupabaseProductStorageUrl(trimmed)) {
    throw new Error(`${label} must be a Supabase storage URL or a local upload path.`);
  }
}
