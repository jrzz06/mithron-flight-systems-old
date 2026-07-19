import { NextResponse } from "next/server";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";
import { createClient } from "@/lib/server";
import {
  clearCustomerCart,
  getCustomerCart,
  replaceCustomerCart,
  validateCustomerCartItems
} from "@/services/customer-cart";

async function requireUserId() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  if (!userId) {
    return { supabase, userId: null as string | null };
  }
  return { supabase, userId };
}

export async function GET() {
  const { supabase, userId } = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  // Session-auth + low abuse risk: fail open so a Redis outage cannot stall cart load
  // behind a slow Postgres rate-limit fallback (client aborts at 15s).
  const limit = await checkDistributedRateLimit(`account-cart:${userId}`, 60, 60_000, "fail_open");
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  try {
    const cart = await getCustomerCart(supabase, userId);
    return NextResponse.json(cart);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load cart.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const { supabase, userId } = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const limit = await checkDistributedRateLimit(`account-cart-write:${userId}`, 120, 60_000, "fail_open");
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const expectedUpdatedAt = request.headers.get("X-Cart-Updated-At")?.trim() || null;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const body = (payload ?? {}) as { items?: unknown };
  try {
    const items = validateCustomerCartItems(body.items ?? []);
    if (expectedUpdatedAt) {
      const current = await getCustomerCart(supabase, userId);
      if (current.updatedAt && current.updatedAt !== expectedUpdatedAt) {
        return NextResponse.json(
          {
            error: "Cart was updated in another session.",
            items: current.items,
            updatedAt: current.updatedAt
          },
          { status: 409 }
        );
      }
    }
    const cart = await replaceCustomerCart(supabase, items, userId);
    return NextResponse.json(cart);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save cart.";
    const status = message.includes("must be an array") || message.includes("more than") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE() {
  const { supabase, userId } = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const limit = await checkDistributedRateLimit(`account-cart-write:${userId}`, 120, 60_000, "fail_open");
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  try {
    await clearCustomerCart(supabase, userId);
    return NextResponse.json({ items: [], updatedAt: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to clear cart.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
