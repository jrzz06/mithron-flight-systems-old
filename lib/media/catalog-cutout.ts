import type { MediaAsset } from "@/config/types";

const CATALOG_CUTOUT_PATH = "/catalog-cutouts/";

export type CatalogCutoutMedia = Pick<MediaAsset, "src"> & Partial<Omit<MediaAsset, "src">>;

export type CatalogCutoutSource = {
  image: CatalogCutoutMedia;
  hero?: CatalogCutoutMedia;
  gallery?: CatalogCutoutMedia[];
};

export function isCatalogCutoutAsset(asset: Pick<MediaAsset, "src">) {
  return asset.src.includes(CATALOG_CUTOUT_PATH);
}

export function productHasCatalogCutout(product: CatalogCutoutSource) {
  if (isCatalogCutoutAsset(product.image)) {
    return true;
  }

  if ((product.gallery ?? []).some(isCatalogCutoutAsset)) {
    return true;
  }

  return product.hero ? isCatalogCutoutAsset(product.hero) : false;
}

export function resolveCatalogCutoutAsset(product: CatalogCutoutSource): CatalogCutoutMedia | null {
  if (isCatalogCutoutAsset(product.image)) {
    return product.image;
  }

  const galleryCutout = (product.gallery ?? []).find(isCatalogCutoutAsset);
  if (galleryCutout) {
    return galleryCutout;
  }

  if (product.hero && isCatalogCutoutAsset(product.hero)) {
    return product.hero;
  }

  return null;
}
