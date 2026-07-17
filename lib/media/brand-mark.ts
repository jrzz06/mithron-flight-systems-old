import { MITHRON_WORDMARK_SRC } from "@/config/storefront-media-paths";
import { resolveStorefrontSrc } from "@/lib/media/resolve-storefront-src";

/** Canonical brand mark identifier — always use this constant, never inline the path. */
export { MITHRON_WORDMARK_SRC };

/** Runtime delivery URL (Supabase when migrated, else local canonical path). */
export function resolveBrandMarkSrc() {
  return resolveStorefrontSrc(MITHRON_WORDMARK_SRC);
}
