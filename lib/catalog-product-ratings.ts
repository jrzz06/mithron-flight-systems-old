import { cache } from "react";
import { getSupabaseAdminConfig } from "@/lib/env";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
type RatingRow = {
  product_slug: string | null;
  rating: number | string | null;
};

function avgFromRows(rows: RatingRow[]) {
  const totals = new Map<string, { sum: number; count: number }>();
  for (const row of rows) {
    const slug = typeof row.product_slug === "string" ? row.product_slug.trim() : "";
    const rating = Number(row.rating);
    if (!slug || !Number.isFinite(rating) || rating <= 0) continue;
    const entry = totals.get(slug) ?? { sum: 0, count: 0 };
    entry.sum += Math.min(5, Math.max(1, rating));
    entry.count += 1;
    totals.set(slug, entry);
  }

  const averages = new Map<string, number>();
  for (const [slug, entry] of totals) {
    averages.set(slug, Math.round((entry.sum / entry.count) * 10) / 10);
  }
  return averages;
}

async function fetchRatingRows(table: string, slugs: string[], url: string, serviceRoleKey: string) {
  if (!slugs.length) return [] as RatingRow[];
  const inList = `(${slugs.map((slug) => `"${slug.replace(/"/g, '\\"')}"`).join(",")})`;
  const params = new URLSearchParams({
    select: "product_slug,rating",
    product_slug: `in.${inList}`,
    limit: "2000"
  });

  try {
    const response = await fetchWithTimeout(`${url}/rest/v1/${table}?${params.toString()}`, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`
      },
      next: { revalidate: 120, tags: ["catalog-ratings"] }
    });
    if (!response.ok) return [] as RatingRow[];
    return (await response.json()) as RatingRow[];
  } catch {
    return [] as RatingRow[];
  }
}

export const getCatalogProductRatingMap = cache(async (slugs: string[]): Promise<Map<string, number>> => {
  const unique = Array.from(new Set(slugs.map((slug) => slug.trim()).filter(Boolean))).slice(0, 240);
  if (!unique.length) return new Map();

  const config = getSupabaseAdminConfig();
  if (!config.configured) return new Map();

  const [orderReviews, cmsReviews] = await Promise.all([
    fetchRatingRows("customer_order_reviews", unique, config.url, config.serviceRoleKey),
    fetchRatingRows("product_reviews", unique, config.url, config.serviceRoleKey)
  ]);

  return avgFromRows([...orderReviews, ...cmsReviews]);
});

export async function attachCatalogProductRatings<T extends { slug: string; rating?: number }>(
  products: T[]
): Promise<T[]> {
  if (!products.length) return products;
  try {
    const ratings = await getCatalogProductRatingMap(products.map((product) => product.slug));
    if (!ratings.size) return products;
    return products.map((product) => {
      const rating = ratings.get(product.slug);
      return rating && rating > 0 ? { ...product, rating } : product;
    });
  } catch {
    return products;
  }
}
