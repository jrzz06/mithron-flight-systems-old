import { canCustomerReviewOrder, REVIEW_UNAVAILABLE_MESSAGE } from "@/lib/orders/review-eligibility";
import { assertSupabaseAdminConfig } from "@/lib/env";
import { getCustomerOrder } from "@/services/customer-orders";

type JsonRecord = Record<string, unknown>;
type EnvSource = Record<string, string | undefined>;

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

export async function listCustomerReviewsForOrder(orderId: string, userId: string, env: EnvSource = process.env) {
  const config = assertSupabaseAdminConfig(env);
  const response = await fetch(
    `${config.url}/rest/v1/customer_order_reviews?select=id,product_slug,rating,body,status,created_at&order_id=eq.${encodeURIComponent(orderId)}&user_id=eq.${encodeURIComponent(userId)}`,
    { headers: headers(config.serviceRoleKey), cache: "no-store" }
  );
  if (!response.ok) return [];
  return (await response.json()) as JsonRecord[];
}

export async function listCustomerReviewsForUser(userId: string, env: EnvSource = process.env) {
  const config = assertSupabaseAdminConfig(env);
  const response = await fetch(
    `${config.url}/rest/v1/customer_order_reviews?select=id,product_slug,rating,body,status,created_at&user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=200`,
    { headers: headers(config.serviceRoleKey), cache: "no-store" }
  );
  if (!response.ok) return [];
  return (await response.json()) as JsonRecord[];
}

export async function submitCustomerOrderReview(
  input: {
    userId: string;
    productSlug: string;
    rating: number;
    title?: string;
    body: string;
    customerName?: string;
    imageUrls?: string[];
    idempotencyKey?: string;
    orderId?: string;
    productName?: string;
  },
  env: EnvSource = process.env
) {
  const body = input.body.trim();
  if (!body) throw new Error("Review text is required.");
  if (!Number.isFinite(input.rating) || input.rating < 1 || input.rating > 5) {
    throw new Error("Rating must be between 1 and 5.");
  }

  const orderId = input.orderId?.trim();
  if (!orderId) {
    throw new Error("An order is required to submit a review.");
  }

  const detail = await getCustomerOrder(input.userId, orderId, env);
  if (!detail) {
    throw new Error("Order not found.");
  }
  if (!canCustomerReviewOrder(detail.order)) {
    throw new Error(REVIEW_UNAVAILABLE_MESSAGE);
  }
  const hasProduct = detail.items.some((item) => String(item.product_slug ?? "") === input.productSlug);
  if (!hasProduct) {
    throw new Error("This product is not part of the selected order.");
  }

  const config = assertSupabaseAdminConfig(env);
  let customerName = input.customerName?.trim() ?? "";
  if (!customerName) {
    const profileResponse = await fetch(
      `${config.url}/rest/v1/profiles?select=display_name,email&id=eq.${encodeURIComponent(input.userId)}&limit=1`,
      { headers: headers(config.serviceRoleKey), cache: "no-store" }
    );
    if (profileResponse.ok) {
      const profiles = (await profileResponse.json()) as JsonRecord[];
      const profile = profiles[0];
      customerName = text(profile?.display_name) || text(profile?.email, "Verified Customer");
    }
  }
  if (!customerName) customerName = "Verified Customer";

  const payload: JsonRecord = {
    order_id: orderId,
    user_id: input.userId,
    product_slug: input.productSlug,
    ...(input.productName?.trim() ? { product_name: input.productName.trim().slice(0, 200) } : {}),
    rating: input.rating,
    title: text(input.title).slice(0, 160),
    body,
    customer_name: customerName.slice(0, 120),
    image_urls: (input.imageUrls ?? []).slice(0, 6),
    verified_purchase: true,
    status: "published",
    source: "customer",
    updated_at: new Date().toISOString()
  };
  if (input.idempotencyKey) payload.idempotency_key = input.idempotencyKey;

  const response = await fetch(`${config.url}/rest/v1/customer_order_reviews`, {
    method: "POST",
    headers: headers(config.serviceRoleKey, "return=representation,resolution=ignore-duplicates"),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    if (text.includes("23505") || response.status === 409) {
      const existing = input.orderId
        ? await listCustomerReviewsForOrder(input.orderId, input.userId, env)
        : await listCustomerReviewsForUser(input.userId, env);
      const match = existing.find((row) => String(row.product_slug) === input.productSlug);
      if (match) return match;
    }
    throw new Error(`Review submission failed: ${response.status}`);
  }

  const [record] = (await response.json()) as JsonRecord[];
  await fetch(`${config.url}/rest/v1/activity_logs`, {
    method: "POST",
    headers: headers(config.serviceRoleKey, "return=minimal"),
    body: JSON.stringify({
      actor_id: input.userId,
      action: "review.submitted",
      entity_table: "customer_order_reviews",
      entity_id: String(record?.id ?? ""),
      severity: "info",
      metadata: { order_id: input.orderId, product_slug: input.productSlug }
    })
  });
  return record;
}
