import { NextResponse } from "next/server";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";
import { markReviewHelpful } from "@/services/customer-product-reviews";

type RouteContext = { params: Promise<{ slug: string; reviewId: string }> };

function voterKey(request: Request) {
  const header = request.headers.get("x-review-voter");
  if (header && header.trim()) return header.trim().slice(0, 120);
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return `ip:${forwarded.split(",")[0]?.trim()}`;
  return `anon:${request.headers.get("user-agent") ?? "unknown"}`.slice(0, 120);
}

export async function POST(request: Request, context: RouteContext) {
  const { reviewId } = await context.params;
  const limit = await checkDistributedRateLimit(`review-helpful:${voterKey(request)}`, 30, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  try {
    const helpfulCount = await markReviewHelpful(reviewId, voterKey(request));
    return NextResponse.json({ ok: true, helpfulCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not mark review helpful.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
