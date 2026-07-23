import type { MediaAsset, Product, ResponsiveMediaAsset } from "@/config/types";
import { isCatalogCutoutAsset } from "@/lib/media/catalog-cutout";
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

/** Legacy cutouts banned; ai-cutout allowed for cards/primary. */
function isBannedCutoutSrc(src: string) {
  return isCatalogCutoutAsset({ src });
}

export type CatalogCardImageCandidate = {
  src: string;
  alt: string;
  responsive?: ResponsiveMediaAsset;
  useSourceImage: boolean;
};

function hasUsableResponsiveVariants(responsive?: ResponsiveMediaAsset) {
  return Boolean(responsive?.variants?.webp?.length || responsive?.variants?.avif?.length);
}

/** Prefer the canonical Supabase object URL for catalog cards instead of generated variants that may 404. */
export function resolveCatalogCardImage(asset: Pick<MediaAsset, "src" | "alt" | "responsive"> | ProductCardImageSource["image"]) {
  const fallback = asset.responsive?.fallbackSrc?.trim() ?? "";
  const src = asset.src?.trim() ?? "";
  const alt = asset.alt?.trim() ?? "";

  // Never swap a real/Wix/ai-cutout primary for a legacy cutout fallback.
  if (src && !isBannedCutoutSrc(src) && fallback && isBannedCutoutSrc(fallback)) {
    return { src, alt };
  }

  if (src && isBannedCutoutSrc(src)) {
    if (fallback && !isBannedCutoutSrc(fallback) && isTrustedCatalogStorageSrc(fallback)) {
      return { src: fallback, alt: asset.responsive?.fallbackAlt?.trim() || alt };
    }
    return { src: "", alt };
  }

  if (fallback && !isBannedCutoutSrc(fallback) && isTrustedCatalogStorageSrc(fallback)) {
    return { src: fallback, alt: asset.responsive?.fallbackAlt?.trim() || alt };
  }

  return { src, alt };
}

function pickDelivery(
  asset: ProductCardImageSource["image"] | Pick<MediaAsset, "src" | "responsive">,
  resolvedSrc: string
): Pick<CatalogCardImageCandidate, "responsive" | "useSourceImage"> {
  // Legacy catalog-cutouts stay banned from responsive delivery.
  if (isBannedCutoutSrc(resolvedSrc)) {
    return { useSourceImage: true, responsive: undefined };
  }

  if (isRemoteImageSrc(resolvedSrc) && !isTrustedCatalogStorageSrc(resolvedSrc)) {
    return { useSourceImage: true, responsive: undefined };
  }

  // When real variants exist (incl. ai-cutout after backfill), use srcset.
  if (
    asset.responsive
    && hasUsableResponsiveVariants(asset.responsive)
    && isTrustedCatalogStorageSrc(resolvedSrc)
  ) {
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
  if (isBannedCutoutSrc(resolved.src)) return;
  if (isRemoteImageSrc(resolved.src) && !isTrustedCatalogStorageSrc(resolved.src)) return;

  seen.add(resolved.src);
  candidates.push({
    src: resolved.src,
    alt: resolved.alt,
    ...pickDelivery(asset, resolved.src)
  });
}

/** Ordered image candidates: primary (incl. ai-cutout), then non-legacy hero/gallery. */
export function buildCatalogCardImageCandidates(product: ProductCardImageSource): CatalogCardImageCandidate[] {
  const candidates: CatalogCardImageCandidate[] = [];
  const seen = new Set<string>();

  if (!isBannedCutoutSrc(product.image.src ?? "")) {
    pushCatalogCandidate(candidates, seen, product.image);
  }

  const fallbackSrc = product.image.responsive?.fallbackSrc?.trim() ?? "";
  if (
    fallbackSrc
    && !seen.has(fallbackSrc)
    && !isBannedCutoutSrc(fallbackSrc)
    && (!isRemoteImageSrc(fallbackSrc) || isTrustedCatalogStorageSrc(fallbackSrc))
  ) {
    seen.add(fallbackSrc);
    candidates.push({
      src: fallbackSrc,
      alt: product.image.responsive?.fallbackAlt ?? product.image.alt ?? "",
      ...pickDelivery(product.image, fallbackSrc)
    });
  }

  // Prefer ai-cutout primary; skip marketing hero on cards when primary exists.
  if (!candidates.length && product.hero?.src?.trim() && !isBannedCutoutSrc(product.hero.src)) {
    pushCatalogCandidate(candidates, seen, product.hero);
  }

  for (const item of product.gallery ?? []) {
    if (item?.src?.trim() && !isBannedCutoutSrc(item.src) && !item.src.includes("/ai-hero/")) {
      pushCatalogCandidate(candidates, seen, item);
    }
  }

  return candidates;
}
