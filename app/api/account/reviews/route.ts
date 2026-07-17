import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";
import { createClient } from "@/lib/server";
import { submitCustomerOrderReview } from "@/services/customer-order-reviews";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  if (!userId) {
    return NextResponse.json({ error: "Sign in to submit a review." }, { status: 401 });
  }

  const rateKey = userId;
  const limit = await checkDistributedRateLimit(`account-reviews:${rateKey}`, 10, 60_000);
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
  const idempotencyKey = String(formData.get("idempotencyKey") ?? request.headers.get("idempotency-key") ?? "").trim() || undefined;

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
      idempotencyKey: idempotencyKey ? `review:${userId}:${idempotencyKey}` : `review:${userId}:${orderId}:${productSlug}`
    });
    revalidateTag(`reviews:${productSlug}`, "max");
    revalidateTag("reviews:home", "max");
    revalidatePath(`/product/${productSlug}`);
    revalidatePath("/");
    return NextResponse.json({ ok: true, id: record?.id, status: record?.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Review submission failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
