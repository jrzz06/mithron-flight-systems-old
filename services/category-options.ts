import { cache } from "react";
import { buildProductCategoryOptions, type ProductCategoryOption } from "@/lib/product-category-options";
import { getProductManagerSnapshot } from "@/services/admin";

export type { ProductCategoryOption };

/** Shared category list for admin and supplier product forms (metadata + in-use product categories). */
export const getProductCategoryOptions = cache(async (): Promise<ProductCategoryOption[]> => {
  const snapshot = await getProductManagerSnapshot();
  if (snapshot.status === "BLOCKED") return [];

  return buildProductCategoryOptions(snapshot.data.products, snapshot.data.categories);
});

/** @deprecated Use getProductCategoryOptions */
export const getSupplierCategoryOptions = getProductCategoryOptions;
