import type { Product } from "@/config/types";
import { productHasCatalogCutout } from "@/lib/media/catalog-cutout";

const LEAD_PRODUCT_COUNT = 8;
const FEATURED_PRODUCT_INDEX = 1;

export function dedupeProductsBySlug(products: Product[]): Product[] {
  const seen = new Set<string>();
  const deduped: Product[] = [];

  for (const product of products) {
    if (seen.has(product.slug)) {
      console.warn(`[catalog] duplicate product slug removed: ${product.slug}`);
      continue;
    }

    seen.add(product.slug);
    deduped.push(product);
  }

  return deduped;
}

function pickFeaturedProduct(uniqueProducts: Product[]): Product | null {
  const preferred = uniqueProducts[FEATURED_PRODUCT_INDEX];
  if (preferred && productHasCatalogCutout(preferred)) {
    return preferred;
  }

  return uniqueProducts.find(productHasCatalogCutout) ?? null;
}

export type CatalogShelfLayout = {
  featuredProduct: Product | null;
  leadProducts: Product[];
  remainingProducts: Product[];
};

export function buildCatalogShelfLayout(products: Product[]): CatalogShelfLayout {
  const uniqueProducts = dedupeProductsBySlug(products);
  const featuredProduct = pickFeaturedProduct(uniqueProducts);
  const gridProducts = featuredProduct
    ? uniqueProducts.filter((product) => product.slug !== featuredProduct.slug)
    : uniqueProducts;

  return {
    featuredProduct,
    leadProducts: gridProducts.slice(0, LEAD_PRODUCT_COUNT),
    remainingProducts: gridProducts.slice(LEAD_PRODUCT_COUNT)
  };
}
