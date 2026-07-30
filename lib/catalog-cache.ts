import { revalidatePath, revalidateTag } from "next/cache";
import { getCatalogCategoryDefinition, isCatalogCategorySlug } from "@/lib/catalog-categories";
import { invalidateCatalogRedisCaches } from "@/lib/cache-invalidation";

const BULK_CATALOG_SURFACE_TAGS = [
  "catalog-products",
  "catalog-search",
  "catalog-search-index",
  "catalog-showroom"
] as const;

export async function revalidateCatalogSurfaces(
  productSlug?: string,
  options?: { categorySlug?: string }
) {
  const normalizedProductSlug = productSlug?.trim() || undefined;
  const normalizedCategorySlug = options?.categorySlug?.trim() || undefined;

  if (normalizedProductSlug) {
    revalidateTag(`product:${normalizedProductSlug}`, "max");
    revalidatePath(`/product/${normalizedProductSlug}`);
  }

  if (normalizedCategorySlug) {
    revalidateTag(`catalog-category:${normalizedCategorySlug}`, "max");
    if (isCatalogCategorySlug(normalizedCategorySlug)) {
      const definition = getCatalogCategoryDefinition(normalizedCategorySlug);
      revalidatePath(definition.href);
      revalidatePath(definition.legacyHref);
    } else {
      revalidatePath(`/category/${normalizedCategorySlug}`);
    }
  }

  if (!normalizedProductSlug && !normalizedCategorySlug) {
    for (const tag of BULK_CATALOG_SURFACE_TAGS) {
      revalidateTag(tag, "max");
    }
    revalidatePath("/");
    revalidatePath("/products");
  }

  await invalidateCatalogRedisCaches(normalizedProductSlug, normalizedCategorySlug);
}
