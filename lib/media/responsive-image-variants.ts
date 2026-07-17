import type { ResponsiveMediaAsset, ResponsiveMediaVariant } from "@/config/types";

export function getFormatVariants(asset: ResponsiveMediaAsset | undefined, format: "avif" | "webp" | "png") {
  return asset?.variants[format]?.slice().sort((a, b) => a.width - b.width) ?? [];
}

export function createSrcSet(variants: ResponsiveMediaVariant[]) {
  return variants.map((variant) => `${variant.src} ${variant.width}w`).join(", ");
}

export function getBestVariant(
  asset: ResponsiveMediaAsset | undefined,
  preferredFormat?: "avif" | "webp" | "png"
) {
  const formats: Array<"avif" | "webp" | "png"> = preferredFormat
    ? [preferredFormat, ...(["avif", "webp", "png"] as const).filter((format) => format !== preferredFormat)]
    : ["avif", "webp", "png"];

  for (const format of formats) {
    const variant = getFormatVariants(asset, format).at(-1);
    if (variant) return variant;
  }

  return undefined;
}

export function getVariantsUpToWidth(
  asset: ResponsiveMediaAsset | undefined,
  format: "avif" | "webp" | "png",
  maxWidth: number
) {
  const variants = getFormatVariants(asset, format);
  const capped = variants.filter((variant) => variant.width <= maxWidth);
  return capped.length > 0 ? capped : variants.slice(0, 1);
}

export function getBestVariantUpToWidth(
  asset: ResponsiveMediaAsset | undefined,
  maxWidth: number,
  preferredFormat: "avif" | "webp" | "png" = "webp"
) {
  const capped = getVariantsUpToWidth(asset, preferredFormat, maxWidth);
  if (capped.length > 0) {
    return capped.at(-1);
  }

  return getBestVariant(asset, preferredFormat);
}
