import { assertSupabaseAdminConfig } from "@/lib/env";
import type { ProductPageReview, ProductReviewSummary, ProductReviewsPayload } from "@/lib/product-reviews/types";
import {
  createAdminRecord,
  deleteAdminRecord,
  updateAdminRecord
} from "@/services/admin-actions";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

type JsonRecord = Record<string, unknown>;
type EnvSource = Record<string, string | undefined>;

export type CustomerReviewStatus = "pending" | "published" | "rejected";

export type CustomerProductReview = {
  id: string;
  orderId: string;
  userId: string;
  productSlug: string;
  rating: number;
  title: string;
  body: string;
  customerName: string;
  imageUrls: string[];
  helpfulCount: number;
  verifiedPurchase: boolean;
  status: CustomerReviewStatus;
  isVisible: boolean;
  pinned: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ReviewSort = "recent" | "helpful" | "highest" | "lowest" | "manual";

const REVIEW_SELECT =
  "id,order_id,user_id,product_slug,rating,title,body,customer_name,image_urls,helpful_count,verified_purchase,status,is_visible,pinned,display_order,created_at,updated_at";

function headers(serviceRoleKey: string, prefer?: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {})
  };
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value.map((entry) => (typeof entry === "string" ? entry.trim() : "")).filter(Boolean);
}

function mapReview(row: JsonRecord): CustomerProductReview {
  const statusRaw = text(row.status, "pending");
  const status: CustomerReviewStatus =
    statusRaw === "published" || statusRaw === "rejected" ? statusRaw : "pending";

  return {
    id: text(row.id),
    orderId: text(row.order_id),
    userId: text(row.user_id),
    productSlug: text(row.product_slug),
    rating: Math.min(5, Math.max(1, Math.round(Number(row.rating) || 5))),
    title: text(row.title),
    body: text(row.body),
    customerName: text(row.customer_name, "Verified Customer"),
    imageUrls: asStringArray(row.image_urls).slice(0, 6),
    helpfulCount: Math.max(0, Number(row.helpful_count) || 0),
    verifiedPurchase: row.verified_purchase !== false,
    status,
    isVisible: row.is_visible !== false,
    pinned: row.pinned === true,
    displayOrder: Number(row.display_order) || 0,
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at)
  };
}

function toProductPageReview(review: CustomerProductReview, productName?: string): ProductPageReview {
  return {
    id: review.id,
    authorName: review.customerName,
    title: review.title,
    body: review.body,
    rating: review.rating,
    createdAt: review.createdAt,
    productSlug: review.productSlug,
    productName,
    helpfulCount: review.helpfulCount,
    imageUrls: review.imageUrls,
    verifiedPurchase: review.verifiedPurchase,
    source: "customer"
  };
}

function buildSummary(reviews: ProductPageReview[]): ProductReviewSummary {
  const distribution: ProductReviewSummary["distribution"] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let totalRating = 0;

  for (const review of reviews) {
    const bucket = Math.min(5, Math.max(1, review.rating)) as 1 | 2 | 3 | 4 | 5;
    distribution[bucket] += 1;
    totalRating += review.rating;
  }

  const totalReviews = reviews.length;
  const averageRating = totalReviews ? Math.round((totalRating / totalReviews) * 10) / 10 : 0;
  return { averageRating, totalReviews, distribution };
}

function sortReviews(reviews: CustomerProductReview[], sort: ReviewSort) {
  const next = [...reviews];
  switch (sort) {
    case "manual":
      return next.sort(
        (left, right) =>
          Number(right.pinned) - Number(left.pinned) ||
          left.displayOrder - right.displayOrder ||
          Date.parse(right.createdAt) - Date.parse(left.createdAt)
      );
    case "helpful":
      return next.sort(
        (left, right) =>
          Number(right.pinned) - Number(left.pinned) ||
          right.helpfulCount - left.helpfulCount ||
          Date.parse(right.createdAt) - Date.parse(left.createdAt)
      );
    case "highest":
      return next.sort(
        (left, right) =>
          Number(right.pinned) - Number(left.pinned) ||
          right.rating - left.rating ||
          Date.parse(right.createdAt) - Date.parse(left.createdAt)
      );
    case "lowest":
      return next.sort(
        (left, right) =>
          Number(right.pinned) - Number(left.pinned) ||
          left.rating - right.rating ||
          Date.parse(right.createdAt) - Date.parse(left.createdAt)
      );
    case "recent":
    default:
      return next.sort(
        (left, right) =>
          Number(right.pinned) - Number(left.pinned) ||
          Date.parse(right.createdAt) - Date.parse(left.createdAt)
      );
  }
}

async function fetchRows(query: string, env: EnvSource = process.env, cache?: { tags?: string[] }) {
  const config = assertSupabaseAdminConfig(env);
  const response = await fetchWithTimeout(`${config.url}/rest/v1/customer_order_reviews?${query}`, {
    headers: headers(config.serviceRoleKey),
    cache: cache ? "force-cache" : "no-store",
    ...(cache?.tags?.length ? { next: { tags: cache.tags, revalidate: 60 } } : {})
  });
  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Failed to load reviews (${response.status}).${details ? ` ${details}` : ""}`);
  }
  const rows = (await response.json()) as JsonRecord[];
  return Array.isArray(rows) ? rows.map(mapReview) : [];
}

async function fetchRowsPublic(query: string, env: EnvSource = process.env, cache?: { tags?: string[] }) {
  try {
    return await fetchRows(query, env, cache);
  } catch (error) {
    // Public product pages should never hard-fail on review reads.
    console.error("[reviews] Failed to fetch public review rows.", error);
    return [] as CustomerProductReview[];
  }
}

export async function listPublishedProductReviews(
  productSlug: string,
  options: { sort?: ReviewSort; limit?: number } = {},
  env: EnvSource = process.env
) {
  const limit = Math.max(1, Math.min(100, options.limit ?? 48));
  const rows = await fetchRowsPublic(
    [
      `select=${REVIEW_SELECT}`,
      `product_slug=eq.${encodeURIComponent(productSlug)}`,
      "status=eq.published",
      "is_visible=eq.true",
      `order=pinned.desc,display_order.asc,created_at.desc`,
      `limit=${limit}`
    ].join("&"),
    env,
    { tags: [`reviews:${productSlug}`] }
  );
  return sortReviews(rows, options.sort ?? "recent");
}

export async function getProductReviewsPayload(
  productSlug: string,
  productName: string,
  options: { sort?: ReviewSort } = {},
  env: EnvSource = process.env
): Promise<ProductReviewsPayload> {
  const reviews = (await listPublishedProductReviews(productSlug, options, env)).map((review) =>
    toProductPageReview(review, productName)
  );
  return { reviews, summary: buildSummary(reviews) };
}

export async function listFeaturedHomeReviews(
  options: { limit?: number; candidateMultiplier?: number; sortOrder?: "newest" | "rating" | "manual" } = {},
  env: EnvSource = process.env
) {
  const limit = Math.max(1, Math.min(12, options.limit ?? 3));
  // Fetch extra candidates so callers can skip reviews whose catalog products were removed.
  const candidateMultiplier = Math.max(4, Math.min(12, options.candidateMultiplier ?? 8));
  const sortOrder = options.sortOrder ?? "manual";
  const order =
    sortOrder === "rating"
      ? "pinned.desc,rating.desc,created_at.desc"
      : sortOrder === "newest"
        ? "pinned.desc,created_at.desc"
        : "pinned.desc,display_order.asc,created_at.desc";
  const rows = await fetchRowsPublic(
    [
      `select=${REVIEW_SELECT}`,
      "status=eq.published",
      "is_visible=eq.true",
      `order=${order}`,
      `limit=${limit * candidateMultiplier}`
    ].join("&"),
    env,
    { tags: ["reviews:home"] }
  );
  const mappedSort: ReviewSort =
    sortOrder === "rating" ? "highest" : sortOrder === "newest" ? "recent" : "manual";
  return sortReviews(rows, mappedSort).slice(0, limit * candidateMultiplier);
}

export async function listAdminProductReviews(
  options: { status?: string; productSlug?: string; rating?: number; q?: string } = {},
  env: EnvSource = process.env
) {
  const status = options.status ?? "all";
  const productSlug = options.productSlug ?? "";
  const rating = typeof options.rating === "number" ? String(options.rating) : "";
  const q = text(options.q).trim();
  const { readThroughCache, REDIS_CACHE_KEYS } = await import("@/lib/cache-redis");
  const { cacheControlPlaneRead } = await import("@/lib/control-plane/query-cache");

  return readThroughCache(
    REDIS_CACHE_KEYS.controlPlaneAdminReviews(status, productSlug, rating, q),
    30,
    () =>
      cacheControlPlaneRead(
        ["admin-reviews", status, productSlug, rating, q],
        () => resolveAdminProductReviews(options, env),
        { revalidate: 30, tags: ["admin-reviews", "control-plane-reviews"] }
      )
  );
}

async function resolveAdminProductReviews(
  options: { status?: string; productSlug?: string; rating?: number; q?: string } = {},
  env: EnvSource = process.env
) {
  const params = [`select=${REVIEW_SELECT}`, "order=created_at.desc", "limit=200"];
  if (options.status && options.status !== "all") {
    params.push(`status=eq.${encodeURIComponent(options.status)}`);
  }
  if (options.productSlug) {
    params.push(`product_slug=eq.${encodeURIComponent(options.productSlug)}`);
  }
  if (typeof options.rating === "number") {
    params.push(`rating=eq.${options.rating}`);
  }

  const query = text(options.q).trim();
  if (query) {
    const pattern = encodeURIComponent(`*${query}*`);
    params.push(`or=(customer_name.ilike.${pattern},title.ilike.${pattern},body.ilike.${pattern},product_slug.ilike.${pattern})`);
  }

  return fetchRows(params.join("&"), env);
}

export async function getCustomerReviewById(id: string, env: EnvSource = process.env) {
  const rows = await fetchRows(`select=${REVIEW_SELECT}&id=eq.${encodeURIComponent(id)}&limit=1`, env);
  return rows[0] ?? null;
}

export async function updateCustomerReviewByOwner(
  input: {
    id: string;
    userId: string;
    title?: string;
    body?: string;
    rating?: number;
    imageUrls?: string[];
  },
  env: EnvSource = process.env
) {
  const existing = await getCustomerReviewById(input.id, env);
  if (!existing || existing.userId !== input.userId) {
    throw new Error("Review not found.");
  }
  if (existing.status === "published") {
    throw new Error("Published reviews cannot be edited. Contact support if you need changes.");
  }

  const body = text(input.body ?? existing.body);
  if (!body) throw new Error("Review content is required.");
  const rating = input.rating ?? existing.rating;
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    throw new Error("Rating must be between 1 and 5.");
  }

  const config = assertSupabaseAdminConfig(env);
  const response = await fetchWithTimeout(
    `${config.url}/rest/v1/customer_order_reviews?id=eq.${encodeURIComponent(input.id)}&user_id=eq.${encodeURIComponent(input.userId)}`,
    {
      method: "PATCH",
      headers: headers(config.serviceRoleKey, "return=representation"),
      body: JSON.stringify({
        title: text(input.title ?? existing.title).slice(0, 160),
        body: body.slice(0, 4000),
        rating,
        image_urls: (input.imageUrls ?? existing.imageUrls).slice(0, 6),
        status: "pending",
        updated_at: new Date().toISOString()
      })
    }
  );
  if (!response.ok) throw new Error("Could not update review.");
  const [record] = (await response.json()) as JsonRecord[];
  return mapReview(record);
}

export async function deleteCustomerReviewByOwner(id: string, userId: string, env: EnvSource = process.env) {
  const existing = await getCustomerReviewById(id, env);
  if (!existing || existing.userId !== userId) {
    throw new Error("Review not found.");
  }
  if (existing.status === "published") {
    throw new Error("Published reviews cannot be deleted.");
  }

  const config = assertSupabaseAdminConfig(env);
  const response = await fetchWithTimeout(
    `${config.url}/rest/v1/customer_order_reviews?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}`,
    { method: "DELETE", headers: headers(config.serviceRoleKey) }
  );
  if (!response.ok) throw new Error("Could not delete review.");
  return true;
}

export async function moderateCustomerReview(
  input: {
    id: string;
    status?: CustomerReviewStatus;
    title?: string;
    body?: string;
    rating?: number;
    customerName?: string;
    productSlug?: string;
    isVisible?: boolean;
    pinned?: boolean;
    displayOrder?: number;
    imageUrls?: string[];
  },
  actorId: string | null,
  env: EnvSource = process.env
) {
  const existing = await getCustomerReviewById(input.id, env);
  if (!existing) throw new Error("Review not found.");

  const record = await updateAdminRecord(
    "customer_order_reviews",
    "id",
    input.id,
    {
      status: input.status ?? existing.status,
      title: text(input.title ?? existing.title).slice(0, 160),
      body: text(input.body ?? existing.body).slice(0, 4000),
      rating: input.rating ?? existing.rating,
      customer_name: text(input.customerName ?? existing.customerName).slice(0, 120) || existing.customerName,
      product_slug: text(input.productSlug ?? existing.productSlug) || existing.productSlug,
      is_visible: input.isVisible ?? existing.isVisible,
      pinned: input.pinned ?? existing.pinned,
      display_order: input.displayOrder ?? existing.displayOrder,
      image_urls: input.imageUrls ?? existing.imageUrls,
      updated_at: new Date().toISOString()
    },
    actorId,
    env
  );
  return mapReview((record as JsonRecord) ?? { ...existing, ...input });
}

/**
 * Batch-moderate reviews with a single PostgREST `id=in.(...)` update (or delete)
 * instead of N per-id round trips.
 */
export async function bulkModerateCustomerReviews(
  input: {
    ids: string[];
    action: "hide" | "show" | "pin" | "unpin" | "delete";
  },
  actorId: string | null,
  env: EnvSource = process.env
) {
  const ids = [...new Set(input.ids.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) return { updated: 0 };

  const config = assertSupabaseAdminConfig(env);
  const idFilter = ids.map((id) => encodeURIComponent(id)).join(",");

  if (input.action === "delete") {
    const response = await fetchWithTimeout(
      `${config.url}/rest/v1/customer_order_reviews?id=in.(${idFilter})`,
      {
        method: "DELETE",
        headers: headers(config.serviceRoleKey, "return=representation")
      }
    );
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Bulk review delete failed (${response.status})${body ? `: ${body.slice(0, 200)}` : ""}`);
    }
    const rows = (await response.json()) as JsonRecord[];
    void actorId;
    return { updated: rows.length };
  }

  const patch: JsonRecord = {
    updated_at: new Date().toISOString()
  };
  if (input.action === "hide") patch.is_visible = false;
  if (input.action === "show") patch.is_visible = true;
  if (input.action === "pin") {
    patch.pinned = true;
    patch.status = "published";
  }
  if (input.action === "unpin") patch.pinned = false;

  const response = await fetchWithTimeout(
    `${config.url}/rest/v1/customer_order_reviews?id=in.(${idFilter})`,
    {
      method: "PATCH",
      headers: headers(config.serviceRoleKey, "return=representation"),
      body: JSON.stringify(patch)
    }
  );
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Bulk review update failed (${response.status})${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
  const rows = (await response.json()) as JsonRecord[];
  void actorId;
  return { updated: rows.length };
}

export async function createCustomerReviewAdmin(
  input: {
    customerName: string;
    productSlug: string;
    productName?: string;
    body: string;
    rating?: number;
    status?: CustomerReviewStatus;
  },
  actorId: string | null,
  env: EnvSource = process.env
) {
  const customerName = text(input.customerName).slice(0, 120);
  const productSlug = text(input.productSlug);
  const body = text(input.body).slice(0, 4000);
  if (!customerName) throw new Error("Customer name is required.");
  if (!productSlug) throw new Error("Product is required.");
  if (!body) throw new Error("Description is required.");

  const externalId = `admin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();
  const record = await createAdminRecord(
    "customer_order_reviews",
    {
      product_slug: productSlug,
      product_name: text(input.productName).slice(0, 200) || null,
      rating: Math.min(5, Math.max(1, Math.round(input.rating ?? 5))),
      title: "",
      body,
      customer_name: customerName,
      image_urls: [],
      verified_purchase: false,
      status: input.status ?? "published",
      is_visible: true,
      pinned: false,
      display_order: 0,
      source: "admin",
      external_id: externalId,
      created_at: now,
      updated_at: now
    },
    actorId,
    env
  );
  return mapReview(record as JsonRecord);
}

export async function deleteCustomerReviewAdmin(id: string, actorId: string | null, env: EnvSource = process.env) {
  await deleteAdminRecord("customer_order_reviews", "id", id, actorId, env);
  return true;
}

export async function markReviewHelpful(
  reviewId: string,
  voterKey: string,
  env: EnvSource = process.env
) {
  const key = text(voterKey);
  if (!key) throw new Error("Voter key is required.");

  const review = await getCustomerReviewById(reviewId, env);
  if (!review || review.status !== "published") {
    throw new Error("Review not found.");
  }

  const config = assertSupabaseAdminConfig(env);
  const voteResponse = await fetchWithTimeout(`${config.url}/rest/v1/product_review_helpful_votes`, {
    method: "POST",
    headers: headers(config.serviceRoleKey, "return=minimal,resolution=ignore-duplicates"),
    body: JSON.stringify({ review_id: reviewId, voter_key: key })
  });

  if (!voteResponse.ok && voteResponse.status !== 409) {
    throw new Error("Could not record helpful vote.");
  }

  const countResponse = await fetchWithTimeout(
    `${config.url}/rest/v1/product_review_helpful_votes?select=id&review_id=eq.${encodeURIComponent(reviewId)}`,
    { headers: headers(config.serviceRoleKey), cache: "no-store" }
  );
  const votes = countResponse.ok ? ((await countResponse.json()) as JsonRecord[]) : [];
  const helpfulCount = Array.isArray(votes) ? votes.length : review.helpfulCount + 1;

  await fetchWithTimeout(`${config.url}/rest/v1/customer_order_reviews?id=eq.${encodeURIComponent(reviewId)}`, {
    method: "PATCH",
    headers: headers(config.serviceRoleKey, "return=minimal"),
    body: JSON.stringify({ helpful_count: helpfulCount, updated_at: new Date().toISOString() })
  });

  return helpfulCount;
}

export { toProductPageReview, buildSummary, sortReviews };
