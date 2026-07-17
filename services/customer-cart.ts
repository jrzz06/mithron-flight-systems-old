import "server-only";

import type { PersistedCartItem } from "@/config/types";
import { stripPersistedCartItems } from "@/lib/cart-pricing";
import { createClient } from "@/lib/server";

type CustomerCartClient = Awaited<ReturnType<typeof createClient>>;

type CustomerCartRecord = {
  user_id: string;
  items: PersistedCartItem[];
  updated_at: string;
};

function cartLineIdentity(item: Pick<PersistedCartItem, "productSlug" | "bundleId" | "variantId">) {
  return `${item.productSlug}:${item.bundleId}:${item.variantId ?? ""}`;
}

function clampQuantity(value: number) {
  if (!Number.isFinite(value)) return 1;
  const truncated = Math.trunc(value);
  return Math.max(1, Math.min(99, truncated));
}

function canonicalizeCustomerCartItems(items: PersistedCartItem[]) {
  const merged = new Map<string, PersistedCartItem>();
  const order: string[] = [];

  for (const raw of items) {
    const key = cartLineIdentity(raw);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...raw, quantity: clampQuantity(raw.quantity) });
      order.push(key);
      continue;
    }

    const nextQuantity = clampQuantity(existing.quantity + raw.quantity);
    merged.set(key, {
      ...existing,
      ...(raw.variantId ? { variantId: raw.variantId } : {}),
      ...(raw.productName ? { productName: raw.productName } : {}),
      ...(raw.bundleName ? { bundleName: raw.bundleName } : {}),
      ...(raw.image ? { image: raw.image } : {}),
      quantity: nextQuantity
    });
  }

  return order.map((key) => merged.get(key)!).filter(Boolean);
}

async function requireAuthenticatedUserId(supabase: CustomerCartClient) {
  const { data: claimsData } = await supabase.auth.getClaims();
  const claimsUserId = typeof claimsData?.claims?.sub === "string" ? claimsData.claims.sub : null;
  if (claimsUserId) {
    return claimsUserId;
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (!userError && userData.user?.id) {
    return userData.user.id;
  }

  throw new Error("Authentication required.");
}

export function validateCustomerCartItems(value: unknown): PersistedCartItem[] {
  if (!Array.isArray(value)) {
    throw new Error("Cart items must be an array.");
  }

  if (value.length > 100) {
    throw new Error("Cart cannot contain more than 100 line items.");
  }

  const normalized = stripPersistedCartItems(value as Array<PersistedCartItem & Record<string, unknown>>);
  const canonical = canonicalizeCustomerCartItems(normalized);
  if (canonical.length > 100) {
    throw new Error("Cart cannot contain more than 100 line items.");
  }
  return canonical;
}

function parseStoredItems(value: unknown): PersistedCartItem[] {
  if (!Array.isArray(value)) return [];
  try {
    return validateCustomerCartItems(value);
  } catch {
    return [];
  }
}

export async function getCustomerCart(
  supabase: CustomerCartClient
): Promise<{ items: PersistedCartItem[]; updatedAt: string | null }> {
  const userId = await requireAuthenticatedUserId(supabase);
  const { data, error } = await supabase
    .from("customer_carts")
    .select("items, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load cart: ${error.message}`);
  }

  return {
    items: parseStoredItems(data?.items),
    updatedAt: typeof (data as CustomerCartRecord | null)?.updated_at === "string" ? (data as CustomerCartRecord).updated_at : null
  };
}

export async function replaceCustomerCart(
  supabase: CustomerCartClient,
  items: PersistedCartItem[]
): Promise<{ items: PersistedCartItem[]; updatedAt: string }> {
  const userId = await requireAuthenticatedUserId(supabase);
  const normalizedItems = validateCustomerCartItems(items);
  const updatedAt = new Date().toISOString();

  const { data, error } = await supabase
    .from("customer_carts")
    .upsert(
      {
        user_id: userId,
        items: normalizedItems,
        updated_at: updatedAt
      },
      { onConflict: "user_id" }
    )
    .select("items, updated_at")
    .single();

  if (error) {
    throw new Error(`Unable to save cart: ${error.message}`);
  }

  return {
    items: parseStoredItems(data?.items),
    updatedAt: (data as CustomerCartRecord).updated_at
  };
}

export async function clearCustomerCart(supabase: CustomerCartClient): Promise<void> {
  const userId = await requireAuthenticatedUserId(supabase);
  const { error } = await supabase.from("customer_carts").delete().eq("user_id", userId);

  if (error) {
    throw new Error(`Unable to clear cart: ${error.message}`);
  }
}
