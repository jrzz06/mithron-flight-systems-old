import { NextResponse } from "next/server";
import { resolveCartLines, stripPersistedCartItems, type PersistedCartItem } from "@/lib/cart-pricing";
import { summarizeCartTax } from "@/lib/product-tax";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";
import { getCartPricingByItems } from "@/services/catalog";

function parseItems(body: unknown): PersistedCartItem[] | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  if (!Array.isArray(record.items) || !record.items.length || record.items.length > 50) return null;

  const items: PersistedCartItem[] = [];
  for (const raw of record.items) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const item = raw as Record<string, unknown>;
    const productSlug = typeof item.productSlug === "string" ? item.productSlug.trim() : "";
    const bundleId = typeof item.bundleId === "string" ? item.bundleId.trim() : "standard";
    const quantity = typeof item.quantity === "number" ? item.quantity : Number(item.quantity);
    const variantId = typeof item.variantId === "string" ? item.variantId.trim() : undefined;
    if (!productSlug || productSlug.length > 200) return null;
    if (!bundleId || bundleId.length > 120) return null;
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 99) return null;
    items.push({
      productSlug,
      bundleId,
      quantity,
      ...(variantId ? { variantId } : {})
    });
  }

  return items;
}

export async function POST(request: Request) {
  const rateKey = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  const limiter = await checkDistributedRateLimit(`cart-pricing:${rateKey}`, 60, 60_000);
  if (!limiter.allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const items = parseItems(body);
  if (!items?.length) {
    return NextResponse.json({ error: "Valid cart items are required." }, { status: 400 });
  }

  try {
    const products = await getCartPricingByItems(items);
    const lines = resolveCartLines(items, products);
    const pricing = summarizeCartTax(lines);

    return NextResponse.json({
      lines,
      subtotal: pricing.subtotal,
      taxTotal: pricing.taxTotal,
      total: pricing.total
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to resolve cart pricing.";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Use POST with cart items." }, { status: 405 });
}

export { stripPersistedCartItems };
