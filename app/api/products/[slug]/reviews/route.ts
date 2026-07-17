import { NextResponse } from "next/server";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";
import type { ReviewSort } from "@/lib/product-reviews/types";
import { getProductReviewsPayload } from "@/services/customer-product-reviews";

type RouteContext = { params: Promise<{ slug: string }> };

const sortValues: ReviewSort[] = ["recent", "helpful", "highest", "lowest"];

export async function GET(request: Request, context: RouteContext) {
  const { slug } = await context.params;
  const rateKey = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  const limit = await checkDistributedRateLimit(`product-reviews:${rateKey}`, 60, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const sortRaw = searchParams.get("sort") ?? "recent";
  const sort = sortValues.includes(sortRaw as ReviewSort) ? (sortRaw as ReviewSort) : "recent";
  const productName = searchParams.get("productName") ?? slug;

  try {
    const payload = await getProductReviewsPayload(slug, productName, { sort });
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load reviews.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
