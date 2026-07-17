import { getMediaDeliveryProfile, type MediaDeliveryRole } from "@/config/media-delivery-profiles";
import type { ResponsiveMediaAsset } from "@/config/types";
import {
  createSrcSet,
  getBestVariant,
  getBestVariantUpToWidth,
  getFormatVariants,
  getVariantsUpToWidth
} from "@/lib/media/responsive-image-variants";
import { resolveStorefrontSrc } from "@/lib/media/resolve-storefront-src";

export type ResponsiveImageModelInput = {
  src: string;
  imageRole?: MediaDeliveryRole;
  preferredFormat?: "avif" | "webp" | "png";
  maxVariantWidth?: number;
  webpOnly?: boolean;
  responsive?: ResponsiveMediaAsset;
  useSourceImage?: boolean;
  fill?: boolean;
  width?: number | string;
  height?: number | string;
  sizes?: string;
};

export type ResponsiveImageModel = {
  requestedSrc: string;
  resolvedSrc: string;
  responsive: ResponsiveMediaAsset | undefined;
  avifSrcSet: string;
  webpSrcSet: string;
  pngSrcSet: string;
  optimizedSrc: string;
  primarySrc: string;
  remoteFallbackSrc?: string;
  variantFallbackSrc?: string;
  useNativeRemoteImage: boolean;
  useSourceImage: boolean;
  resolvedSizes?: string;
  width?: number | string;
  height?: number | string;
  assetId: string;
  assetStatus: string;
  assetBucket: string;
  blurPlaceholder: boolean;
  backgroundStyle: {
    "--mithron-image-placeholder": string;
    "--mithron-image-blur": string;
  };
  deliveredMaxVariantWidth: number;
  mode: "source" | "remote" | "responsive";
};

function isRemoteSrc(src: string) {
  return src.startsWith("http://") || src.startsWith("https://");
}

function resolveFormatVariants(
  responsive: ResponsiveMediaAsset | undefined,
  format: "avif" | "webp" | "png",
  maxVariantWidth: number | undefined,
  useSourceImage: boolean
) {
  if (useSourceImage || !responsive) return [];
  return maxVariantWidth
    ? getVariantsUpToWidth(responsive, format, maxVariantWidth)
    : getFormatVariants(responsive, format);
}

/** Client-safe: uses only the precomputed `responsive` payload, never the asset manifest. */
export function buildResponsiveImageModel(input: ResponsiveImageModelInput): ResponsiveImageModel {
  const useSourceImage = input.useSourceImage ?? false;
  const fill = input.fill ?? false;
  const profile = input.imageRole ? getMediaDeliveryProfile(input.imageRole) : undefined;
  const maxVariantWidth = input.maxVariantWidth ?? profile?.maxVariantWidth;
  const preferredFormat = input.preferredFormat ?? profile?.preferredFormat ?? "webp";
  const webpOnly = input.webpOnly ?? profile?.webpOnly ?? false;
  const resolvedSrc = resolveStorefrontSrc(input.src);
  const responsive = input.responsive;
  const avifVariants = webpOnly ? [] : resolveFormatVariants(responsive, "avif", maxVariantWidth, useSourceImage);
  const webpVariants = resolveFormatVariants(
    responsive,
    preferredFormat === "png" ? "png" : "webp",
    maxVariantWidth,
    useSourceImage
  );
  const bestVariant = useSourceImage
    ? undefined
    : maxVariantWidth
      ? getBestVariantUpToWidth(responsive, maxVariantWidth, preferredFormat === "png" ? "png" : "webp")
      : getBestVariant(responsive, preferredFormat === "png" ? "png" : "webp");
  const avifSrcSet = useSourceImage || webpOnly ? "" : createSrcSet(avifVariants);
  const webpSrcSet = useSourceImage ? "" : createSrcSet(webpVariants);
  const pngSrcSet = useSourceImage || webpOnly ? "" : createSrcSet(getFormatVariants(responsive, "png"));
  const hasResponsiveVariants = !useSourceImage && Boolean(avifSrcSet || webpSrcSet || pngSrcSet);
  const useNativeRemoteImage = isRemoteSrc(resolvedSrc) && !hasResponsiveVariants && !input.responsive;
  const optimizedSrc = useSourceImage ? resolvedSrc : (bestVariant?.src ?? resolvedSrc);
  const primarySrc = useSourceImage ? resolvedSrc : optimizedSrc;
  const resolvedSizes = input.sizes ?? (fill ? "100vw" : undefined);
  const deliveredMaxVariantWidth = Math.max(0, ...webpVariants.map((variant) => variant.width), ...avifVariants.map((variant) => variant.width));

  const mode = useSourceImage ? "source" : useNativeRemoteImage ? "remote" : "responsive";

  return {
    requestedSrc: input.src,
    resolvedSrc,
    responsive,
    avifSrcSet,
    webpSrcSet,
    pngSrcSet,
    optimizedSrc,
    primarySrc,
    remoteFallbackSrc: useNativeRemoteImage ? responsive?.fallbackSrc : undefined,
    variantFallbackSrc: !useNativeRemoteImage && primarySrc !== resolvedSrc ? resolvedSrc : responsive?.fallbackSrc,
    useNativeRemoteImage,
    useSourceImage,
    resolvedSizes,
    width: input.width ?? responsive?.width,
    height: input.height ?? responsive?.height,
    assetId: useSourceImage ? "source" : (responsive?.assetId ?? (useNativeRemoteImage ? "remote" : "unmapped")),
    assetStatus: useSourceImage ? "source" : (responsive?.status ?? (useNativeRemoteImage ? "missing" : "missing")),
    assetBucket: useSourceImage ? "local" : (responsive?.bucket ?? (useNativeRemoteImage ? "unmapped" : "unmapped")),
    blurPlaceholder: Boolean(responsive?.blurDataUrl),
    backgroundStyle: {
      "--mithron-image-placeholder": responsive?.dominantColor ?? "transparent",
      "--mithron-image-blur": responsive?.blurDataUrl ? `url(${responsive.blurDataUrl})` : "none"
    },
    deliveredMaxVariantWidth,
    mode
  };
}

export function buildImageFallbackChain(model: ResponsiveImageModel): string[] {
  const chain: string[] = [];
  const isSupabaseStorageSrc = (value: string) => /^https?:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\//i.test(value);
  const isTrustedRemoteSrc = (value: string) => /^https:\/\//i.test(value.trim());
  const pushSupabase = (value?: string | null) => {
    if (!value || chain.includes(value) || !isSupabaseStorageSrc(value)) return;
    chain.push(value);
  };
  const pushTrustedRemote = (value?: string | null) => {
    if (!value || chain.includes(value) || !isTrustedRemoteSrc(value) || isSupabaseStorageSrc(value)) return;
    chain.push(value);
  };

  pushSupabase(model.primarySrc);
  pushSupabase(model.optimizedSrc);
  pushSupabase(model.resolvedSrc);

  const skipResolvedMapFallback =
    Boolean(model.variantFallbackSrc) &&
    model.variantFallbackSrc === model.resolvedSrc &&
    model.requestedSrc !== model.resolvedSrc;

  if (model.variantFallbackSrc && !skipResolvedMapFallback) {
    pushSupabase(model.variantFallbackSrc);
  }

  pushSupabase(model.responsive?.fallbackSrc);

  if (
    model.requestedSrc &&
    model.requestedSrc !== model.primarySrc &&
    model.requestedSrc !== model.optimizedSrc &&
    model.requestedSrc !== model.variantFallbackSrc &&
    model.requestedSrc !== model.responsive?.fallbackSrc
  ) {
    pushSupabase(model.requestedSrc);
  }

  if (model.useSourceImage && model.responsive) {
    for (const variant of [
      ...(model.responsive.variants.webp ?? []),
      ...(model.responsive.variants.avif ?? []),
      ...(model.responsive.variants.png ?? [])
    ]) {
      pushSupabase(variant.src);
    }
  }

  pushTrustedRemote(model.responsive?.fallbackSrc);
  if (
    model.requestedSrc &&
    model.requestedSrc !== model.primarySrc &&
    model.requestedSrc !== model.optimizedSrc &&
    model.requestedSrc !== model.variantFallbackSrc &&
    model.requestedSrc !== model.responsive?.fallbackSrc
  ) {
    pushTrustedRemote(model.requestedSrc);
  }

  return chain;
}

export function isResponsiveVariantSrc(model: ResponsiveImageModel, src: string) {
  if (src === model.primarySrc || src === model.optimizedSrc) return true;

  const variants = [
    ...(model.responsive?.variants.webp ?? []),
    ...(model.responsive?.variants.avif ?? []),
    ...(model.responsive?.variants.png ?? [])
  ];

  return variants.some((variant) => variant.src === src);
}
