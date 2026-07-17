/**
 * Detect whether the request carries a Supabase Auth session cookie chunk.
 * Used by proxy.ts to skip auth round-trips on anonymous public storefront traffic.
 */
export function hasSupabaseAuthCookie(
  cookies: { name: string; value: string }[] | Iterable<{ name: string; value: string }>
) {
  for (const cookie of cookies) {
    if (/^sb-[^-]+-auth-token(?:\.\d+)?$/i.test(cookie.name) && cookie.value.trim().length > 0) {
      return true;
    }
  }
  return false;
}
