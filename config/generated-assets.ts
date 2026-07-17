import "server-only";

import generatedManifest from "@/data/mithron-supabase-assets.generated.json";
import { canonicalStorefrontPath } from "@/lib/media/resolve-storefront-src";
import { heroAssets, interestAssets } from "@/config/assets";
import { storefrontMediaPaths } from "@/config/storefront-media-paths";
import type {
  HeroSlide,
  Interest,
  MediaAsset,
  MithronAssetBucket,
  Product,
  ResponsiveMediaAsset
} from "@/config/types";

export const mithronStorageBuckets = [
  "mithron-hero",
  "mithron-products",
  "mithron-interests",
  "mithron-story"
] as const satisfies readonly MithronAssetBucket[];

export const responsiveVariantWidths = [3840, 2560, 1920, 1280, 768, 480] as const;

export const mithronSourceImageHosts = ["www.mithron.co", "www.mithronsmart.com"] as const;

type AssetSeed = Omit<ResponsiveMediaAsset, "fallbackAlt" | "variants" | "status"> & {
  fallbackAlt?: string;
};

type GeneratedManifest = {
  assets?: Array<ResponsiveMediaAsset>;
};

const generatedAssets = [...((generatedManifest as GeneratedManifest).assets ?? [])];

const generatedByAssetId = new Map(generatedAssets.map((asset) => [asset.assetId, asset]));

const storyAssets = {
  precisionSpray: storefrontMediaPaths.story.precisionSpray,
  terrainRadar: storefrontMediaPaths.story.terrainRadar,
  missionPlanning: storefrontMediaPaths.story.missionPlanning,
  droneEcosystem: storefrontMediaPaths.story.droneEcosystem,
  cropHealth: storefrontMediaPaths.story.cropHealth
};

function assetIdFromPath(prefix: string, src: string) {
  return `${prefix}-${src.split("/").pop()?.replace(/\.[a-z0-9]+$/i, "") ?? "asset"}`.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
}

function createSeed(seed: AssetSeed): ResponsiveMediaAsset {
  const generated = generatedByAssetId.get(seed.assetId);
  if (generated) {
    return generated;
  }

  return {
    ...seed,
    fallbackAlt: seed.fallbackAlt ?? seed.assetId,
    status: "fallback",
    variants: {}
  };
}

const seeds: AssetSeed[] = [
  { assetId: "hero-ag10-command", bucket: "mithron-hero", assetRole: "hero", category: "hero", productSlug: "source-agri-kisan-drone-small-8-liter", generatedPromptId: "retrieved.hero.ag10-command", fallbackSrc: heroAssets.ag10Command, width: 2560, height: 1023, dominantColor: "#eef2f5" },
  { assetId: "hero-security-grid", bucket: "mithron-hero", assetRole: "hero", category: "surveillance", productSlug: "source-10l-drone-with-safety-security", generatedPromptId: "retrieved.hero.security-grid", fallbackSrc: heroAssets.securityGrid, width: 2560, height: 1280, dominantColor: "#0b1117" },
  { assetId: "hero-mapping-flight", bucket: "mithron-hero", assetRole: "hero", category: "mapping", productSlug: "source-10x-seeker-optical-zoom-cmera-survey-drone", generatedPromptId: "retrieved.hero.mapping-flight", fallbackSrc: heroAssets.mappingFlight, width: 2560, height: 1280, dominantColor: "#eef2f5" },

  { assetId: assetIdFromPath("interest", interestAssets.agriculture), bucket: "mithron-interests", assetRole: "poster", category: "agriculture", generatedPromptId: "retrieved.interest.agriculture", fallbackSrc: interestAssets.agriculture, width: 2400, height: 1500, dominantColor: "#eef2f5" },
  { assetId: assetIdFromPath("interest", interestAssets.videoDrones), bucket: "mithron-interests", assetRole: "poster", category: "video-drones", generatedPromptId: "retrieved.interest.video-drones", fallbackSrc: interestAssets.videoDrones, width: 2400, height: 1500, dominantColor: "#eef2f5" },
  { assetId: assetIdFromPath("interest", interestAssets.creativeDrones), bucket: "mithron-interests", assetRole: "poster", category: "creative-drones", generatedPromptId: "retrieved.interest.creative-drones", fallbackSrc: interestAssets.creativeDrones, width: 2400, height: 1500, dominantColor: "#f1f4f6" },
  { assetId: assetIdFromPath("interest", interestAssets.mapping), bucket: "mithron-interests", assetRole: "poster", category: "mapping", generatedPromptId: "retrieved.interest.mapping", fallbackSrc: interestAssets.mapping, width: 2400, height: 1500, dominantColor: "#eef2f5" },
  { assetId: assetIdFromPath("interest", interestAssets.smartFarming), bucket: "mithron-interests", assetRole: "poster", category: "smart-farming", generatedPromptId: "retrieved.interest.smart-farming", fallbackSrc: interestAssets.smartFarming, width: 2400, height: 1500, dominantColor: "#eef2f5" },
  { assetId: assetIdFromPath("interest", interestAssets.defenseSecurity), bucket: "mithron-interests", assetRole: "poster", category: "defense-security", generatedPromptId: "retrieved.interest.defense-security", fallbackSrc: interestAssets.defenseSecurity, width: 2400, height: 1500, dominantColor: "#0b1117" },
  { assetId: assetIdFromPath("interest", interestAssets.industrialInspection), bucket: "mithron-interests", assetRole: "poster", category: "industrial-inspection", generatedPromptId: "retrieved.interest.industrial-inspection", fallbackSrc: interestAssets.industrialInspection, width: 2400, height: 1500, dominantColor: "#0d1117" },
  { assetId: assetIdFromPath("interest", interestAssets.surveillance), bucket: "mithron-interests", assetRole: "poster", category: "surveillance", generatedPromptId: "retrieved.interest.surveillance", fallbackSrc: interestAssets.surveillance, width: 2400, height: 1500, dominantColor: "#0b1117" },
  { assetId: assetIdFromPath("interest", interestAssets.components), bucket: "mithron-interests", assetRole: "poster", category: "components", generatedPromptId: "retrieved.interest.components", fallbackSrc: interestAssets.components, width: 2400, height: 1500, dominantColor: "#f1f4f6" },

  ...Object.entries(storyAssets).map(([key, src]) => ({
    assetId: assetIdFromPath("story", src),
    bucket: "mithron-story" as const,
    assetRole: "story" as const,
    category: "story",
    generatedPromptId: `retrieved.story.${key}`,
    fallbackSrc: src,
    width: 2400,
    height: 1800,
    dominantColor: "#eef2f5"
  }))
];

const seedAssetIds = new Set(seeds.map((seed) => seed.assetId));
const generatedOnlyAssets = generatedAssets.filter((asset) => !seedAssetIds.has(asset.assetId));
const responsiveAssets = [...seeds.map(createSeed), ...generatedOnlyAssets];
const responsiveByFallbackSrc = new Map(responsiveAssets.map((asset) => [asset.fallbackSrc, asset]));
const responsiveByBasename = new Map<string, ResponsiveMediaAsset>();
const responsiveByStem = new Map<string, ResponsiveMediaAsset>();

for (const asset of responsiveAssets) {
  const basename = asset.fallbackSrc.split("/").pop();
  if (basename && !responsiveByBasename.has(basename)) {
    responsiveByBasename.set(basename, asset);
  }

  const stem = basename?.replace(/\.(webp|png|jpe?g|avif)$/i, "");
  if (stem && !responsiveByStem.has(stem)) {
    responsiveByStem.set(stem, asset);
  }
}

function normalizeAssetLookupKey(src: string) {
  try {
    const url = new URL(src, "https://mithron.local");
    return url.pathname.split("/").pop() ?? src;
  } catch {
    return src.split("/").pop() ?? src;
  }
}

function assetStem(src: string) {
  return normalizeAssetLookupKey(src).replace(/\.(webp|png|jpe?g|avif)$/i, "");
}

export function getResponsiveAssetForSrc(src: string) {
  const canonical = canonicalStorefrontPath(src);

  return responsiveByFallbackSrc.get(src)
    ?? responsiveByFallbackSrc.get(canonical)
    ?? responsiveByBasename.get(normalizeAssetLookupKey(src))
    ?? responsiveByBasename.get(normalizeAssetLookupKey(canonical))
    ?? responsiveByStem.get(assetStem(src))
    ?? responsiveByStem.get(assetStem(canonical));
}

export function hasMithronSourceHost(src: string) {
  return mithronSourceImageHosts.some((host) => src.includes(host));
}

export {
  createSrcSet,
  getBestVariant,
  getBestVariantUpToWidth,
  getFormatVariants,
  getVariantsUpToWidth
} from "@/lib/media/responsive-image-variants";

export function withResponsiveMediaAsset(asset: MediaAsset): MediaAsset {
  const responsive = getResponsiveAssetForSrc(asset.src);
  return responsive ? { ...asset, responsive } : asset;
}

function hydrateMediaAsset(asset: MediaAsset | undefined) {
  if (!asset || asset.responsive) return;
  const responsive = getResponsiveAssetForSrc(asset.src);
  if (responsive) {
    asset.responsive = {
      ...responsive,
      fallbackAlt: asset.alt
    };
  }
}

export function hydrateStorefrontMediaAssets({
  slides,
  interests,
  products
}: {
  slides: HeroSlide[];
  interests: Interest[];
  products?: Product[];
}) {
  for (const slide of slides) {
    hydrateMediaAsset(slide.image);
    hydrateMediaAsset(slide.poster);
    hydrateMediaAsset(slide.video);
  }

  for (const interest of interests) {
    hydrateMediaAsset(interest.image);
  }

  for (const product of products ?? []) {
    hydrateMediaAsset(product.image);
    hydrateMediaAsset(product.hero);
    product.gallery.forEach(hydrateMediaAsset);
    product.story.forEach((chapter) => hydrateMediaAsset(chapter.media));
  }
}

export function getGeneratedAssetCoverage() {
  const generated = responsiveAssets.filter((asset) => asset.status === "generated").length;
  return {
    total: responsiveAssets.length,
    generated,
    fallback: responsiveAssets.length - generated,
    buckets: mithronStorageBuckets
  };
}
