import { NextResponse } from "next/server";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";
import { loadProductForPage } from "@/services/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
}

function safeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function availabilityFromSpecs(specs: Record<string, string> | undefined) {
  if (!specs) return null;
  return safeText(specs["Availability"]) || safeText(specs["Availability (source)"]) || null;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const slug = url.searchParams.get("slug")?.trim() ?? "";
    if (!slug) return NextResponse.json({ error: "Missing slug." }, { status: 400 });

    const limiter = await checkDistributedRateLimit(`product-summary:${readIp(request)}`, 60, 60_000);
    if (!limiter.allowed) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

    const loaded = await loadProductForPage(slug);
    if (loaded.status !== "ready") {
      return NextResponse.json({ ok: false, slug, error: "Not found." }, { status: 404 });
    }

    const product = loaded.product;
    return NextResponse.json({
      ok: true,
      slug: product.slug,
      name: product.name,
      category: product.category,
      price: product.price,
      image: product.image?.src ?? null,
      url: product.productUrl || `/product/${product.slug}`,
      availability: availabilityFromSpecs(product.specs)
    });
  } catch (error) {
    console.error("[products/summary] failed", error);
    return NextResponse.json(
      { ok: false, error: "Product summary unavailable.", retryable: true },
      { status: 503 }
    );
  }
}

