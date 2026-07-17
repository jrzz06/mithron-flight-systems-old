import { revalidatePath, revalidateTag } from "next/cache";
import { catalogCategoryDefinitions } from "@/lib/catalog-categories";
import { invalidateCatalogRedisCaches } from "@/lib/cache-invalidation";

export async function revalidateCatalogSurfaces(productSlug?: string) {
  revalidateTag("catalog", "max");
  revalidateTag("catalog-products", "max");
  revalidatePath("/");
  revalidatePath("/store");
  revalidatePath("/products");
  revalidatePath("/industrial");
  for (const definition of catalogCategoryDefinitions) {
    revalidatePath(definition.href);
    revalidatePath(definition.legacyHref);
  }
  if (productSlug) {
    revalidatePath(`/product/${productSlug}`);
  }
  await invalidateCatalogRedisCaches(productSlug);
}
