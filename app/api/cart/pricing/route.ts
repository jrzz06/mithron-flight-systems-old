import { NextResponse } from "next/server";
import { resolveCartLines, stripPersistedCartItems, type PersistedCartItem } from "@/lib/cart-pricing";
import { ActionTimeoutError, raceWithTimeout } from "@/lib/fetch-with-timeout";
import { summarizeCartTax } from "@/lib/product-tax";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";
import { getCartPricingByItems } from "@/services/catalog";

/** Bound catalog pricing so a stalled PostgREST hop cannot hang checkout UI. */
const CART_PRICING_TIMEOUT_MS = 8_000;
/** Cap distinct in-flight fingerprints to bound heap under flood. */
const INFLIGHT_PRICING_MAX = 64;

type CartPricingPayload = {
  lines: ReturnType<typeof resolveCartLines>;
  subtotal: number;
  taxTotal: number;
  total: number;
};

/** In-flight coalesce: identical carts share one catalog fetch under concurrency. */
const inflightPricing = new Map<string, Promise<CartPricingPayload>>();

function rememberInflight(
  fingerprint: string,
  pending: Promise<CartPricingPayload>
): Promise<CartPricingPayload> {
  // FIFO eviction of oldest keys when at capacity (Map insertion order).
  while (inflightPricing.size >= INFLIGHT_PRICING_MAX) {
    const oldest = inflightPricing.keys().next().value;
    if (oldest === undefined) break;
    inflightPricing.delete(oldest);
  }
  inflightPricing.set(fingerprint, pending);
  return pending;
}

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

function cartPricingFingerprint(items: PersistedCartItem[]) {
  return items
    .map((item) =>
      [item.productSlug, item.bundleId, item.quantity, item.variantId ?? ""].join(":")
    )
    .sort()
    .join("|");
}

async function buildPricingPayload(items: PersistedCartItem[]): Promise<CartPricingPayload> {
  const products = await raceWithTimeout(
    getCartPricingByItems(items),
    CART_PRICING_TIMEOUT_MS,
    "Cart pricing"
  );
  const lines = resolveCartLines(items, products);
  const pricing = summarizeCartTax(lines);
  return {
    lines,
    subtotal: pricing.subtotal,
    taxTotal: pricing.taxTotal,
    total: pricing.total
  };
}

export async function POST(request: Request) {
  const rateKey = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  // Rate limit unchanged (60/min) — do not relax under load.
  const limiter = await checkDistributedRateLimit(`cart-pricing:${rateKey}`, 60, 60_000);
  if (!limiter.allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const items = parseItems(body);
  if (!items?.length) {
    return NextResponse.json({ error: "Valid cart items are required." }, { status: 400 });
  }

  const fingerprint = cartPricingFingerprint(items);

  try {
    let pending = inflightPricing.get(fingerprint);
    if (!pending) {
      pending = rememberInflight(
        fingerprint,
        buildPricingPayload(items).finally(() => {
          inflightPricing.delete(fingerprint);
        })
      );
    }
    const payload = await pending;
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof ActionTimeoutError) {
      return NextResponse.json(
        { error: "Cart pricing timed out. Please retry." },
        { status: 503 }
      );
    }
    const message = error instanceof Error ? error.message : "Unable to resolve cart pricing.";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Use POST with cart items." }, { status: 405 });
}

export { stripPersistedCartItems };
