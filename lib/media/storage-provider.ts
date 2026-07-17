import { rewriteStorageUrlForCdn } from "@/lib/media/cdn-url";

export type StorageProviderId = "supabase" | "r2";

export function getActiveStorageProvider(
  env: Record<string, string | undefined> = process.env
): StorageProviderId {
  const provider = env.MITHRON_STORAGE_PROVIDER?.trim().toLowerCase();
  if (provider === "r2") return "r2";
  return "supabase";
}

export function resolvePublicMediaUrl(
  src: string,
  env: Record<string, string | undefined> = process.env
): string {
  const provider = getActiveStorageProvider(env);
  if (provider === "r2") {
    const r2PublicOrigin = env.MITHRON_R2_PUBLIC_ORIGIN?.trim();
    if (r2PublicOrigin && src.includes(".supabase.co/storage/v1/object/public/")) {
      try {
        const origin = new URL(r2PublicOrigin.startsWith("http") ? r2PublicOrigin : `https://${r2PublicOrigin}`).origin;
        const path = src.replace(/^https?:\/\/[^/]+/i, "");
        return `${origin}${path}`;
      } catch {
        return rewriteStorageUrlForCdn(src, env);
      }
    }
  }
  return rewriteStorageUrlForCdn(src, env);
}
