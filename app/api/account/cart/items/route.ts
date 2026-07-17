import { NextResponse } from "next/server";
import type { PersistedCartItem } from "@/config/types";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";
import { createClient } from "@/lib/server";
import { getCustomerCart, replaceCustomerCart } from "@/services/customer-cart";
import { CheckoutStockVerificationError, verifyCheckoutStockAvailability } from "@/services/checkout-stock";

type CartLineInput = {
  productSlug?: unknown;
  bundleId?: unknown;
  variantId?: unknown;
  quantity?: unknown;
  delta?: unknown;
  productName?: unknown;
  bundleName?: unknown;
  image?: unknown;
};

function parseLineIdentity(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const record = body as CartLineInput;
  const productSlug = typeof record.productSlug === "string" ? record.productSlug.trim() : "";
  const bundleId = typeof record.bundleId === "string" ? record.bundleId.trim() : "standard";
  const variantId = typeof record.variantId === "string" ? record.variantId.trim() : undefined;
  if (!productSlug || productSlug.length > 200) return null;
  if (!bundleId || bundleId.length > 120) return null;
  return { productSlug, bundleId, variantId };
}

function readQuantity(value: unknown) {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return null;
  const quantity = Math.trunc(num);
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 99) return null;
  return quantity;
}

function readDelta(value: unknown) {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return null;
  const delta = Math.trunc(num);
  if (!Number.isInteger(delta) || delta === 0 || delta < -99 || delta > 99) return null;
  return delta;
}

function applyDisplayFields<T extends PersistedCartItem>(base: T, record: CartLineInput): T {
  const productName = typeof record.productName === "string" ? record.productName.trim() : "";
  const bundleName = typeof record.bundleName === "string" ? record.bundleName.trim() : "";
  const image = typeof record.image === "string" ? record.image.trim() : "";
  return {
    ...base,
    ...(productName ? { productName } : {}),
    ...(bundleName ? { bundleName } : {}),
    ...(image ? { image } : {})
  };
}

async function requireUserId() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  return { supabase, userId };
}

async function checkIdempotency(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, key: string, operation: string) {
  // Insert key; if it already exists, treat request as a replay.
  const { error } = await supabase
    .from("customer_cart_idempotency")
    .insert({ user_id: userId, idempotency_key: key, operation })
    .select("user_id")
    .single();

  if (!error) return { replay: false };
  // Postgres unique violation -> replay
  if (typeof error.code === "string" && error.code === "23505") return { replay: true };
  throw new Error(`Unable to validate cart request: ${error.message}`);
}

export async function POST(request: Request) {
  const { supabase, userId } = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const limit = await checkDistributedRateLimit(`account-cart-items:${userId}`, 240, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

  const idempotencyKey = request.headers.get("X-Idempotency-Key")?.trim() ?? "";
  if (!idempotencyKey) return NextResponse.json({ error: "We couldn't update your cart. Please try again." }, { status: 400 });

  const body = await request.json().catch(() => null);
  const identity = parseLineIdentity(body);
  if (!identity) return NextResponse.json({ error: "We couldn't update your cart. Please refresh and try again." }, { status: 400 });

  const delta = readDelta((body as CartLineInput | null)?.delta);
  if (delta === null) return NextResponse.json({ error: "We couldn't update your cart. Please try again." }, { status: 400 });

  const idempotency = await checkIdempotency(supabase, userId, idempotencyKey, "add");
  if (idempotency.replay) {
    const cart = await getCustomerCart(supabase);
    return NextResponse.json(cart);
  }

  try {
    const current = await getCustomerCart(supabase);
    const nextItems = [...current.items];
    const index = nextItems.findIndex(
      (line) =>
        line.productSlug === identity.productSlug
        && line.bundleId === identity.bundleId
        && (line.variantId ?? "") === (identity.variantId ?? "")
    );

    if (index >= 0) {
      const existing = nextItems[index]!;
      const nextQuantity = Math.max(1, Math.min(99, (existing.quantity ?? 1) + delta));
      nextItems[index] = applyDisplayFields({ ...existing, quantity: nextQuantity }, body as CartLineInput);
    } else {
      const nextQuantity = Math.max(1, Math.min(99, delta));
      nextItems.push(applyDisplayFields({ ...identity, quantity: nextQuantity }, body as CartLineInput));
    }

    await verifyCheckoutStockAvailability(nextItems.map((item) => ({ productSlug: item.productSlug, quantity: item.quantity })));

    const saved = await replaceCustomerCart(supabase, nextItems);
    return NextResponse.json(saved);
  } catch (error) {
    await supabase.from("customer_cart_idempotency").delete().eq("user_id", userId).eq("idempotency_key", idempotencyKey);

    if (error instanceof CheckoutStockVerificationError) {
      return NextResponse.json(
        { error: error.message, code: "cart_stock_conflict", issues: error.issues },
        { status: 409 }
      );
    }
    const message = error instanceof Error ? error.message : "Unable to update cart.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const { supabase, userId } = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const limit = await checkDistributedRateLimit(`account-cart-items:${userId}`, 240, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

  const idempotencyKey = request.headers.get("X-Idempotency-Key")?.trim() ?? "";
  if (!idempotencyKey) return NextResponse.json({ error: "We couldn't update your cart. Please try again." }, { status: 400 });

  const body = await request.json().catch(() => null);
  const identity = parseLineIdentity(body);
  if (!identity) return NextResponse.json({ error: "We couldn't update your cart. Please refresh and try again." }, { status: 400 });

  const quantity = readQuantity((body as CartLineInput | null)?.quantity);
  if (quantity === null) return NextResponse.json({ error: "Invalid quantity." }, { status: 400 });

  const idempotency = await checkIdempotency(supabase, userId, idempotencyKey, "set_quantity");
  if (idempotency.replay) {
    const cart = await getCustomerCart(supabase);
    return NextResponse.json(cart);
  }

  try {
    const current = await getCustomerCart(supabase);
    const nextItems = current.items.map((line) => {
      if (
        line.productSlug === identity.productSlug
        && line.bundleId === identity.bundleId
        && (line.variantId ?? "") === (identity.variantId ?? "")
      ) {
        return applyDisplayFields({ ...line, quantity }, body as CartLineInput);
      }
      return line;
    });

    await verifyCheckoutStockAvailability(nextItems.map((item) => ({ productSlug: item.productSlug, quantity: item.quantity })));

    const saved = await replaceCustomerCart(supabase, nextItems);
    return NextResponse.json(saved);
  } catch (error) {
    await supabase.from("customer_cart_idempotency").delete().eq("user_id", userId).eq("idempotency_key", idempotencyKey);

    if (error instanceof CheckoutStockVerificationError) {
      return NextResponse.json(
        { error: error.message, code: "cart_stock_conflict", issues: error.issues },
        { status: 409 }
      );
    }
    const message = error instanceof Error ? error.message : "Unable to update cart.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { supabase, userId } = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const limit = await checkDistributedRateLimit(`account-cart-items:${userId}`, 240, 60_000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

  const idempotencyKey = request.headers.get("X-Idempotency-Key")?.trim() ?? "";
  if (!idempotencyKey) return NextResponse.json({ error: "We couldn't update your cart. Please try again." }, { status: 400 });

  const body = await request.json().catch(() => null);
  const identity = parseLineIdentity(body);
  if (!identity) return NextResponse.json({ error: "We couldn't update your cart. Please refresh and try again." }, { status: 400 });

  const idempotency = await checkIdempotency(supabase, userId, idempotencyKey, "remove");
  if (idempotency.replay) {
    const cart = await getCustomerCart(supabase);
    return NextResponse.json(cart);
  }

  const current = await getCustomerCart(supabase);
  const nextItems = current.items.filter(
    (line) =>
      !(
        line.productSlug === identity.productSlug
        && line.bundleId === identity.bundleId
        && (line.variantId ?? "") === (identity.variantId ?? "")
      )
  );

  const saved = await replaceCustomerCart(supabase, nextItems);
  return NextResponse.json(saved);
}

