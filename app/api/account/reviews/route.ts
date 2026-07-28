import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";
import { createClient } from "@/lib/server";
import { submitCustomerOrderReview } from "@/services/customer-order-reviews";
import { getCustomerReviewById, updateCustomerReviewByOwner } from "@/services/customer-product-reviews";

async function requireReviewUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  return userId;
}

export async function POST(request: Request) {
  const userId = await requireReviewUser();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to submit a review." }, { status: 401 });
  }

  const limit = await checkDistributedRateLimit(`account-reviews:${userId}`, 10, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const formData = await request.formData();
  const productSlug = String(formData.get("productSlug") ?? "").trim();
  const rating = Number(formData.get("rating"));
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const productName = String(formData.get("productName") ?? "").trim();
  const orderId = String(formData.get("orderId") ?? "").trim();
  const idempotencyKey =
    String(formData.get("idempotencyKey") ?? request.headers.get("idempotency-key") ?? "").trim() || undefined;

  if (!productSlug) {
    return NextResponse.json({ error: "productSlug is required." }, { status: 400 });
  }
  if (!orderId) {
    return NextResponse.json({ error: "orderId is required." }, { status: 400 });
  }

  try {
    const record = await submitCustomerOrderReview({
      userId,
      productSlug,
      rating,
      title,
      body,
      productName: productName || undefined,
      orderId: orderId || undefined,
      idempotencyKey: idempotencyKey
        ? `review:${userId}:${idempotencyKey}`
        : `review:${userId}:${orderId}:${productSlug}`
    });
    revalidateTag(`reviews:${productSlug}`, "max");
    revalidateTag("reviews:home", "max");
    revalidateTag("catalog-ratings", "max");
    revalidatePath(`/product/${productSlug}`);
    revalidatePath("/");
    return NextResponse.json({ ok: true, id: record?.id, status: record?.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Review submission failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const userId = await requireReviewUser();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to update a review." }, { status: 401 });
  }

  const limit = await checkDistributedRateLimit(`account-reviews:${userId}`, 10, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  let reviewId = "";
  let rating: number | undefined;
  let title: string | undefined;
  let body: string | undefined;

  if (contentType.includes("application/json")) {
    const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    reviewId = typeof payload.reviewId === "string" ? payload.reviewId.trim() : "";
    if (payload.rating != null) rating = Number(payload.rating);
    if (typeof payload.title === "string") title = payload.title.trim();
    if (typeof payload.body === "string") body = payload.body.trim();
  } else {
    const formData = await request.formData();
    reviewId = String(formData.get("reviewId") ?? "").trim();
    const ratingRaw = formData.get("rating");
    if (ratingRaw != null && String(ratingRaw).trim()) rating = Number(ratingRaw);
    const titleRaw = formData.get("title");
    if (titleRaw != null) title = String(titleRaw).trim();
    const bodyRaw = formData.get("body");
    if (bodyRaw != null) body = String(bodyRaw).trim();
  }

  if (!reviewId) {
    return NextResponse.json({ error: "reviewId is required." }, { status: 400 });
  }

  try {
    const existing = await getCustomerReviewById(reviewId);
    if (!existing || existing.userId !== userId) {
      return NextResponse.json({ error: "Review not found." }, { status: 404 });
    }

    const record = await updateCustomerReviewByOwner({
      id: reviewId,
      userId,
      rating,
      title,
      body
    });

    const productSlug = record.productSlug || existing.productSlug;
    revalidateTag(`reviews:${productSlug}`, "max");
    revalidateTag("reviews:home", "max");
    revalidateTag("catalog-ratings", "max");
    revalidatePath(`/product/${productSlug}`);
    revalidatePath("/");
    return NextResponse.json({
      ok: true,
      id: record.id,
      status: record.status,
      productSlug
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Review update failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
