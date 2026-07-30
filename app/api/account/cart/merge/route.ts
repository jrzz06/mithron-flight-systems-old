import { NextResponse } from "next/server";
import type { PersistedCartItem } from "@/config/types";
import { mergeCartItemLists } from "@/lib/cart/merge-cart-items";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";
import { createClient } from "@/lib/server";
import {
  getCustomerCart,
  replaceCustomerCart,
  validateCustomerCartItems
} from "@/services/customer-cart";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function requireUserId() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  return { supabase, userId };
}

async function checkIdempotency(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  key: string
) {
  const { error } = await supabase
    .from("customer_cart_idempotency")
    .insert({ user_id: userId, idempotency_key: key, operation: "merge" })
    .select("user_id")
    .single();

  if (!error) return { replay: false as const };
  if (typeof error.code === "string" && error.code === "23505") return { replay: true as const };
  console.error("[account/cart/merge] idempotency check failed", error.message);
  return { replay: false as const, unavailable: true as const };
}

function parseGuestItems(body: unknown): PersistedCartItem[] | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const record = body as { items?: unknown };
  if (!Array.isArray(record.items)) return null;
  if (record.items.length > 100) return null;
  try {
    return validateCustomerCartItems(record.items);
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const { supabase, userId } = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const limit = await checkDistributedRateLimit(`account-cart-merge:${userId}`, 60, 60_000, "fail_open");
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const idempotencyKey = request.headers.get("X-Idempotency-Key")?.trim() ?? "";
  if (!idempotencyKey || !UUID_RE.test(idempotencyKey)) {
    return NextResponse.json({ error: "We couldn't merge your cart. Please try again." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const guestItems = parseGuestItems(body);
  if (!guestItems) {
    return NextResponse.json({ error: "Valid guest cart items are required." }, { status: 400 });
  }

  try {
    const idempotency = await checkIdempotency(supabase, userId, idempotencyKey);
    if ("unavailable" in idempotency && idempotency.unavailable) {
      return NextResponse.json(
        { error: "Cart temporarily unavailable. Please try again.", retryable: true },
        { status: 503 }
      );
    }

    // Replay: return committed cart without re-adding guest quantities.
    if (idempotency.replay) {
      const cart = await getCustomerCart(supabase, userId);
      return NextResponse.json(cart);
    }

    if (!guestItems.length) {
      const cart = await getCustomerCart(supabase, userId);
      return NextResponse.json(cart);
    }

    const current = await getCustomerCart(supabase, userId);
    const merged = mergeCartItemLists(current.items, guestItems);
    const cart = await replaceCustomerCart(supabase, merged, userId);
    return NextResponse.json(cart);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to merge cart.";
    const status = message.includes("must be an array") || message.includes("more than") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Use POST with guest cart items." }, { status: 405 });
}
