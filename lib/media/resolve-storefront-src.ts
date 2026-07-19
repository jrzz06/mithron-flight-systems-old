/**
 * Shared by server + client image helpers. Uses the slim remote map (primary +
 * webp variants only) so client bundles do not ship storagePath / unused formats.
 * Do NOT add `import "server-only"` — client components import this module.
 */
import pathAliases from "@/config/storefront-path-aliases.json";
import { resolvePublicMediaUrl } from "@/lib/media/storage-provider";
import remoteMapData from "@/data/mithron-storefront-remote-map.slim.generated.json";
import { storefrontMediaPaths } from "@/config/storefront-media-paths";
import type { MithronAssetBucket, ResponsiveMediaAsset } from "@/config/types";

const LOCAL_PATH_ALIASES = pathAliases as Record<string, string>;

const HERO_FALLBACK_BY_ID: Record<string, string> = {
  "ag10-arrival": storefrontMediaPaths.hero.slide01,
  "mapping-flight": storefrontMediaPaths.hero.slide02,
  "drone-ecosystem": storefrontMediaPaths.hero.slide03,
  "surveillance-grid": storefrontMediaPaths.hero.slide04
};

type RemoteMapVariant = {
  width: number;
  height?: number;
  format?: string;
  src: string;
  storagePath?: string;
};

type RemoteMapEntry = {
  primarySrc: string;
  assetId?: string;
  bucket?: string;
  variants?: {
    webp?: RemoteMapVariant[];
    avif?: RemoteMapVariant[];
    png?: RemoteMapVariant[];
  };
};

type RemoteMap = {
  assets?: Record<string, RemoteMapEntry>;
};

const remoteByPath = new Map(Object.entries((remoteMapData as RemoteMap).assets ?? {}));

function stripQuery(path: string) {
  return path.split("?")[0];
}

function isSupabaseStorageSrc(src: string) {
  return /^https?:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\//i.test(src);
}

export function canonicalStorefrontPath(src: string) {
  const trimmed = stripQuery(src?.trim() ?? "");
  if (!trimmed) return "";
  const aliased = LOCAL_PATH_ALIASES[trimmed];
  if (aliased) return aliased;
  if (!trimmed.startsWith("/")) return trimmed;
  if (/\.(png|jpe?g)$/i.test(trimmed)) {
    return trimmed.replace(/\.(png|jpe?g)$/i, ".webp");
  }
  return trimmed;
}

function getRemoteMapEntry(path: string) {
  if (!path) return undefined;
  return remoteByPath.get(path) ?? remoteByPath.get(canonicalStorefrontPath(path));
}

function bestSupabaseVariant(variants: RemoteMapVariant[] | undefined, maxWidth?: number) {
  const remote = (variants ?? []).filter((variant) => isSupabaseStorageSrc(variant.src));
  if (remote.length === 0) return undefined;

  const sorted = [...remote].sort((left, right) => left.width - right.width);
  if (maxWidth) {
    const upToMax = sorted.filter((variant) => variant.width <= maxWidth);
    return upToMax.at(-1) ?? sorted[0];
  }

  return sorted.at(-1);
}

function remotePrimaryForPath(path: string) {
  const entry = getRemoteMapEntry(path);
  if (!entry) return undefined;

  if (isSupabaseStorageSrc(entry.primarySrc)) {
    return resolvePublicMediaUrl(entry.primarySrc);
  }

  const variantSrc = bestSupabaseVariant(entry.variants?.webp)?.src ?? entry.primarySrc;
  return isSupabaseStorageSrc(variantSrc) ? resolvePublicMediaUrl(variantSrc) : variantSrc;
}

export function getStorefrontResponsiveAsset(src: string): ResponsiveMediaAsset | undefined {
  const entry = getRemoteMapEntry(src);
  if (!entry?.variants?.webp?.length) return undefined;

  const webpVariants = entry.variants.webp.filter((variant) => isSupabaseStorageSrc(variant.src));
  if (webpVariants.length === 0) return undefined;

  const largest = bestSupabaseVariant(webpVariants);
  const fallbackSrc = canonicalStorefrontPath(src) || src;

  return {
    assetId: entry.assetId ?? "unmapped",
    bucket: (entry.bucket as MithronAssetBucket) ?? "mithron-story",
    assetRole: "story",
    category: "mission",
    generatedPromptId: entry.assetId ?? "unmapped",
    status: "generated",
    fallbackSrc,
    fallbackAlt: "",
    width: largest?.width ?? 0,
    height: largest?.height ?? 0,
    dominantColor: "transparent",
    variants: {
      webp: webpVariants.map((variant) => ({
        src: variant.src,
        width: variant.width,
        height: variant.height ?? 0,
        format: "webp" as const,
        storagePath: variant.storagePath ?? ""
      }))
    }
  };
}

export function resolveStorefrontSrc(src: string, options?: { heroSlideId?: string }) {
  const trimmed = src?.trim();
  if (!trimmed) {
    const fallbackPath = options?.heroSlideId ? HERO_FALLBACK_BY_ID[options.heroSlideId] ?? "" : "";
    return remotePrimaryForPath(fallbackPath) ?? fallbackPath;
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return resolvePublicMediaUrl(trimmed);
  }

  const canonical = canonicalStorefrontPath(trimmed);
  const remote = remotePrimaryForPath(canonical) ?? remotePrimaryForPath(trimmed);
  if (remote) return remote;

  if (canonical.startsWith("/")) return canonical;
  return `/${canonical.replace(/^\/+/, "")}`;
}

export function resolveHeroSlideSrc(src: string, slideId: string) {
  const canonical = HERO_FALLBACK_BY_ID[slideId] ?? canonicalStorefrontPath(src);
  return remotePrimaryForPath(canonical) ?? remotePrimaryForPath(canonicalStorefrontPath(src)) ?? resolveStorefrontSrc(src, { heroSlideId: slideId }) ?? src;
}
