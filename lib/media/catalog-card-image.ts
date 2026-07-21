import type { MediaAsset, Product, ResponsiveMediaAsset } from "@/config/types";
import { isCatalogCutoutAsset, resolveCatalogCutoutAsset } from "@/lib/media/catalog-cutout";
import { isTrustedCatalogStorageSrc } from "@/lib/media/cdn-url";

export type ProductCardImageSource = {
  image: Pick<MediaAsset, "src"> & {
    alt?: string;
    responsive?: ResponsiveMediaAsset;
    width?: number;
    height?: number;
  };
  hero?: Product["hero"];
  gallery?: Product["gallery"];
};

function isRemoteImageSrc(src: string) {
  return src.startsWith("http://") || src.startsWith("https://");
}

export type CatalogCardImageCandidate = {
  src: string;
  alt: string;
  responsive?: ResponsiveMediaAsset;
  useSourceImage: boolean;
};

/** Prefer the canonical Supabase object URL for catalog cards instead of generated variants that may 404. */
export function resolveCatalogCardImage(asset: Pick<MediaAsset, "src" | "alt" | "responsive"> | ProductCardImageSource["image"]) {
  const fallback = asset.responsive?.fallbackSrc?.trim() ?? "";
  const src = asset.src?.trim() ?? "";
  const alt = asset.alt?.trim() ?? "";

  if (fallback && isTrustedCatalogStorageSrc(fallback)) {
    return { src: fallback, alt };
  }

  return { src, alt };
}

function pickDelivery(
  asset: ProductCardImageSource["image"] | Pick<MediaAsset, "src" | "responsive">,
  resolvedSrc: string
): Pick<CatalogCardImageCandidate, "responsive" | "useSourceImage"> {
  if (isCatalogCutoutAsset({ src: resolvedSrc })) {
    return { useSourceImage: true, responsive: undefined };
  }

  if (isRemoteImageSrc(resolvedSrc) && !isTrustedCatalogStorageSrc(resolvedSrc)) {
    return { useSourceImage: true, responsive: undefined };
  }

  const canonical = asset.responsive?.fallbackSrc?.trim() ?? "";
  if (canonical && resolvedSrc === canonical) {
    return { useSourceImage: true, responsive: undefined };
  }

  if (asset.responsive && isTrustedCatalogStorageSrc(resolvedSrc)) {
    return { useSourceImage: false, responsive: asset.responsive };
  }

  return { useSourceImage: true, responsive: undefined };
}

function pushCatalogCandidate(
  candidates: CatalogCardImageCandidate[],
  seen: Set<string>,
  asset: ProductCardImageSource["image"] | Pick<MediaAsset, "src" | "alt" | "responsive">
) {
  const resolved = resolveCatalogCardImage(asset);
  if (!resolved.src || seen.has(resolved.src)) return;
  if (isRemoteImageSrc(resolved.src) && !isTrustedCatalogStorageSrc(resolved.src)) return;

  seen.add(resolved.src);
  candidates.push({
    src: resolved.src,
    alt: resolved.alt,
    ...pickDelivery(asset, resolved.src)
  });
}

/** Ordered image candidates for product cards: cutout first, then primary image, then hero/gallery fallbacks. */
export function buildCatalogCardImageCandidates(product: ProductCardImageSource): CatalogCardImageCandidate[] {
  const candidates: CatalogCardImageCandidate[] = [];
  const seen = new Set<string>();

  const cutout = resolveCatalogCutoutAsset(product);
  if (cutout) {
    pushCatalogCandidate(candidates, seen, cutout);
  }

  pushCatalogCandidate(candidates, seen, product.image);

  const fallbackSrc = product.image.responsive?.fallbackSrc?.trim() ?? "";
  if (fallbackSrc && !seen.has(fallbackSrc) && (!isRemoteImageSrc(fallbackSrc) || isTrustedCatalogStorageSrc(fallbackSrc))) {
    seen.add(fallbackSrc);
    candidates.push({
      src: fallbackSrc,
      alt: product.image.responsive?.fallbackAlt ?? product.image.alt ?? "",
      ...pickDelivery(product.image, fallbackSrc)
    });
  }

  if (product.hero?.src?.trim()) {
    pushCatalogCandidate(candidates, seen, product.hero);
  }

  for (const item of product.gallery ?? []) {
    pushCatalogCandidate(candidates, seen, item);
  }

  return candidates;
}
