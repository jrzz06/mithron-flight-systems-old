import { createSrcSet, getFormatVariants, getResponsiveAssetForSrc, getBestVariant } from "@/config/generated-assets";

export function getCatalogShowcaseMedia(src: string) {
  const asset = getResponsiveAssetForSrc(src);
  const webpVariants = getFormatVariants(asset, "webp");
  const avifVariants = getFormatVariants(asset, "avif");
  if (!asset || !webpVariants.length) return null;

  const largest = getBestVariant(asset, "webp") ?? webpVariants.at(-1)!;
  const avifSrcSet = createSrcSet(avifVariants);
  const webpSrcSet = createSrcSet(webpVariants);

  return {
    src: largest.src,
    avifSrcSet,
    webpSrcSet,
    srcSet: webpSrcSet,
    width: largest.width,
    height: largest.height
  };
}
