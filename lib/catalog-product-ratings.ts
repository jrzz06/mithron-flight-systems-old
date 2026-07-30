import { cache } from "react";
import { getSupabaseAdminConfig } from "@/lib/env";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

type RatingRow = {
  product_slug: string | null;
  rating: number | string | null;
};

export type CatalogProductRating = {
  average: number;
  reviewCount: number;
};

function ratingsFromRows(rows: RatingRow[]) {
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

  const ratings = new Map<string, CatalogProductRating>();
  for (const [slug, entry] of totals) {
    ratings.set(slug, {
      average: Math.round((entry.sum / entry.count) * 10) / 10,
      reviewCount: entry.count
    });
  }
  return ratings;
}

async function fetchPublishedCustomerReviewRatings(slugs: string[], url: string, serviceRoleKey: string) {
  if (!slugs.length) return [] as RatingRow[];
  const inList = `(${slugs.map((slug) => `"${slug.replace(/"/g, '\\"')}"`).join(",")})`;
  const params = new URLSearchParams({
    select: "product_slug,rating",
    product_slug: `in.${inList}`,
    status: "eq.published",
    is_visible: "eq.true",
    limit: "2000"
  });

  try {
    const response = await fetchWithTimeout(
      `${url}/rest/v1/customer_order_reviews?${params.toString()}`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`
        },
        next: { revalidate: 120, tags: ["catalog-ratings"] }
      }
    );
    if (!response.ok) return [] as RatingRow[];
    return (await response.json()) as RatingRow[];
  } catch {
    return [] as RatingRow[];
  }
}

/** Map of product slug → average rating from published, visible customer reviews only. */
export const getCatalogProductRatingMap = cache(async (slugs: string[]): Promise<Map<string, number>> => {
  const detailed = await getCatalogProductRatingDetailsMap(slugs);
  const averages = new Map<string, number>();
  for (const [slug, entry] of detailed) {
    averages.set(slug, entry.average);
  }
  return averages;
});

export const getCatalogProductRatingDetailsMap = cache(
  async (slugs: string[]): Promise<Map<string, CatalogProductRating>> => {
    const unique = Array.from(new Set(slugs.map((slug) => slug.trim()).filter(Boolean))).slice(0, 240);
    if (!unique.length) return new Map();

    const config = getSupabaseAdminConfig();
    if (!config.configured) return new Map();

    const rows = await fetchPublishedCustomerReviewRatings(unique, config.url, config.serviceRoleKey);
    return ratingsFromRows(rows);
  }
);

export async function attachCatalogProductRatings<
  T extends { slug: string; rating?: number; reviewCount?: number }
>(products: T[]): Promise<T[]> {
  if (!products.length) return products;
  try {
    const ratings = await getCatalogProductRatingDetailsMap(products.map((product) => product.slug));
    if (!ratings.size) return products;
    return products.map((product) => {
      const entry = ratings.get(product.slug);
      if (!entry || entry.average <= 0 || entry.reviewCount <= 0) return product;
      return { ...product, rating: entry.average, reviewCount: entry.reviewCount };
    });
  } catch {
    return products;
  }
}
