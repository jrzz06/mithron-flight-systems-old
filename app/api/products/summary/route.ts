import { NextResponse } from "next/server";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";
import { getProductCoreBySlug } from "@/services/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const slug = url.searchParams.get("slug")?.trim() ?? "";
    if (!slug) return NextResponse.json({ error: "Missing slug." }, { status: 400 });

    const limiter = await checkDistributedRateLimit(`product-summary:${readIp(request)}`, 60, 60_000);
    if (!limiter.allowed) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

    // Slim product:core cache — avoid full PDP pipeline for summary JSON.
    const core = await getProductCoreBySlug(slug);
    if (!core) {
      return NextResponse.json({ ok: false, slug, error: "Not found." }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      slug: core.slug,
      name: core.name,
      category: core.category,
      price: core.price,
      image: core.image?.src ?? null,
      url: `/product/${core.slug}`,
      availability: core.availability ?? null
    });
  } catch (error) {
    console.error("[products/summary] failed", error);
    return NextResponse.json(
      { ok: false, error: "Product summary unavailable.", retryable: true },
      { status: 503 }
    );
  }
}
