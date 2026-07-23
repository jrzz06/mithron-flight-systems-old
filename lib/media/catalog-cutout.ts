import type { MediaAsset } from "@/config/types";

/** Legacy cutout Storage tree — banned from storefront display. */
const LEGACY_CATALOG_CUTOUT_PATH = "/catalog-cutouts/";
/** New dual-asset pipeline cutouts — allowed as primary/cards. */
const AI_CUTOUT_PATH = "/ai-cutout/";

export type CatalogCutoutMedia = Pick<MediaAsset, "src"> & Partial<Omit<MediaAsset, "src">>;

export type CatalogCutoutSource = {
  image: CatalogCutoutMedia;
  hero?: CatalogCutoutMedia;
  gallery?: CatalogCutoutMedia[];
};

/** True only for legacy catalog-cutouts/v1 assets (not ai-cutout). */
export function isCatalogCutoutAsset(asset: Pick<MediaAsset, "src">) {
  return asset.src.includes(LEGACY_CATALOG_CUTOUT_PATH);
}

export function isAiCutoutAsset(asset: Pick<MediaAsset, "src">) {
  return asset.src.includes(AI_CUTOUT_PATH);
}

export function isAiHeroAsset(asset: Pick<MediaAsset, "src">) {
  return asset.src.includes("/ai-hero/");
}

export function productHasCatalogCutout(product: CatalogCutoutSource) {
  if (isCatalogCutoutAsset(product.image) || isAiCutoutAsset(product.image)) {
    return true;
  }

  if ((product.gallery ?? []).some((item) => isCatalogCutoutAsset(item) || isAiCutoutAsset(item))) {
    return true;
  }

  return product.hero
    ? isCatalogCutoutAsset(product.hero) || isAiCutoutAsset(product.hero)
    : false;
}

export function resolveCatalogCutoutAsset(product: CatalogCutoutSource): CatalogCutoutMedia | null {
  if (isAiCutoutAsset(product.image) || isCatalogCutoutAsset(product.image)) {
    return product.image;
  }

  const galleryCutout = (product.gallery ?? []).find(
    (item) => isAiCutoutAsset(item) || isCatalogCutoutAsset(item)
  );
  if (galleryCutout) {
    return galleryCutout;
  }

  if (product.hero && (isAiCutoutAsset(product.hero) || isCatalogCutoutAsset(product.hero))) {
    return product.hero;
  }

  return null;
}
