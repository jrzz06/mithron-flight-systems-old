import { cache } from "react";
import { getSupabaseAdminConfig } from "@/lib/env";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { buildProductCategoryOptions, type ProductCategoryOption } from "@/lib/product-category-options";
import { readThroughCache, REDIS_CACHE_KEYS } from "@/lib/cache-redis";

export type { ProductCategoryOption };

/** Shared category list for admin and supplier product forms (metadata + in-use product categories). */
export const getProductCategoryOptions = cache(async (): Promise<ProductCategoryOption[]> => {
  return readThroughCache(REDIS_CACHE_KEYS.categoryOptions, 60, loadProductCategoryOptionsUncached);
});

async function loadProductCategoryOptionsUncached(): Promise<ProductCategoryOption[]> {
  const config = getSupabaseAdminConfig();
  if (!config.configured) return [];

  const headers = {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`
  };

  const [categoriesResponse, productsResponse] = await Promise.all([
    fetchWithTimeout(
      `${config.url}/rest/v1/category_metadata?select=title,route_key&order=sort_order.asc&limit=80`,
      { headers, cache: "no-store" }
    ),
    fetchWithTimeout(
      `${config.url}/rest/v1/mithron_products?select=category&limit=500`,
      { headers, cache: "no-store" }
    )
  ]);

  const categories = categoriesResponse.ok
    ? ((await categoriesResponse.json()) as Array<Record<string, unknown>>)
    : [];
  const products = productsResponse.ok
    ? ((await productsResponse.json()) as Array<Record<string, unknown>>)
    : [];

  if (!categories.length && !products.length) return [];

  return buildProductCategoryOptions(products, categories);
}

/** @deprecated Use getProductCategoryOptions */
export const getSupplierCategoryOptions = getProductCategoryOptions;
