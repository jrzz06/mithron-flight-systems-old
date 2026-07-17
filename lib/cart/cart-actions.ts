"use client";

import type { PersistedCartItem } from "@/config/types";
import { initializeCartSession } from "@/lib/cart/cart-auth-sync";
import { useCartStore } from "@/store/cart";
import { cartLineKey } from "@/lib/cart-line-key";
import { notify } from "@/lib/feedback/notify";
import { FEEDBACK_MESSAGES } from "@/lib/feedback/messages";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

type CartItemsResponse = { items?: PersistedCartItem[]; updatedAt?: string | null; error?: string };

function clampQuantity(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(99, Math.trunc(value)));
}

function lineIdentity(item: Pick<PersistedCartItem, "productSlug" | "bundleId" | "variantId">) {
  return { productSlug: item.productSlug, bundleId: item.bundleId, variantId: item.variantId };
}

async function requestJson(url: string, init: RequestInit): Promise<CartItemsResponse> {
  const response = await fetchWithTimeout(url, { ...init, cache: "no-store" });
  const payload = (await response.json().catch(() => ({}))) as CartItemsResponse;
  if (!response.ok) {
    const message = typeof payload.error === "string" ? payload.error : `Cart request failed (${response.status}).`;
    throw new Error(message);
  }
  return payload;
}

async function ensureCartSessionReady() {
  if (useCartStore.getState().isCartSessionReady) return;
  await initializeCartSession();
}

export async function addAuthenticatedCartItem(input: PersistedCartItem & { delta: number }) {
  const idempotencyKey = crypto.randomUUID();
  const payload = await requestJson("/api/account/cart/items", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Idempotency-Key": idempotencyKey },
    body: JSON.stringify({
      ...lineIdentity(input),
      delta: clampQuantity(input.delta),
      ...(input.productName ? { productName: input.productName } : {}),
      ...(input.bundleName ? { bundleName: input.bundleName } : {}),
      ...(input.image ? { image: input.image } : {})
    })
  });

  const items = Array.isArray(payload.items) ? payload.items : [];
  useCartStore.setState({ items });
  return items;
}

export async function setAuthenticatedCartQuantity(input: PersistedCartItem & { quantity: number }) {
  const idempotencyKey = crypto.randomUUID();
  const payload = await requestJson("/api/account/cart/items", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-Idempotency-Key": idempotencyKey },
    body: JSON.stringify({
      ...lineIdentity(input),
      quantity: clampQuantity(input.quantity),
      ...(input.productName ? { productName: input.productName } : {}),
      ...(input.bundleName ? { bundleName: input.bundleName } : {}),
      ...(input.image ? { image: input.image } : {})
    })
  });
  const items = Array.isArray(payload.items) ? payload.items : [];
  useCartStore.setState({ items });
  return items;
}

export async function removeAuthenticatedCartItem(input: Pick<PersistedCartItem, "productSlug" | "bundleId" | "variantId">) {
  const idempotencyKey = crypto.randomUUID();
  const payload = await requestJson("/api/account/cart/items", {
    method: "DELETE",
    headers: { "Content-Type": "application/json", "X-Idempotency-Key": idempotencyKey },
    body: JSON.stringify(lineIdentity(input))
  });
  const items = Array.isArray(payload.items) ? payload.items : [];
  useCartStore.setState({ items });
  return items;
}

export function isCartMutationPending(key: string) {
  return Boolean(useCartStore.getState().pendingLineMutations?.[key]);
}

export async function runCartLineMutation<T>(line: Pick<PersistedCartItem, "productSlug" | "bundleId" | "variantId">, fn: () => Promise<T>) {
  const key = cartLineKey(line);
  useCartStore.setState((state) => ({
    pendingLineMutations: { ...(state.pendingLineMutations ?? {}), [key]: true }
  }));
  try {
    return await fn();
  } finally {
    useCartStore.setState((state) => {
      const next = { ...(state.pendingLineMutations ?? {}) };
      delete next[key];
      return { pendingLineMutations: next };
    });
  }
}

export async function addCartLine(
  item: PersistedCartItem,
  options: { openMiniCart?: boolean } = {}
) {
  await ensureCartSessionReady();
  const state = useCartStore.getState();

  if (state.cartSource === "authenticated") {
    try {
      await runCartLineMutation(item, async () => {
        await addAuthenticatedCartItem({ ...item, delta: clampQuantity(item.quantity) });
      });
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Unable to add item to cart.", { source: "cart" });
      throw error;
    }
  } else {
    state.addToCart(item, options);
  }

  notify.success(FEEDBACK_MESSAGES.cartAdded, {
    source: "cart",
    id: `cart:add:${item.productSlug}:${item.bundleId ?? ""}:${item.variantId ?? ""}`
  });
  if (options.openMiniCart) {
    useCartStore.setState({ isCartOpen: true, hasOpenedCart: true, cartDrawerMode: "confirmation" });
  }
}

export async function setCartLineQuantity(item: PersistedCartItem, quantity: number) {
  await ensureCartSessionReady();
  const state = useCartStore.getState();
  if (state.cartSource === "authenticated") {
    const nextQuantity = clampQuantity(quantity);
    const previousItems = state.items;
    try {
      await runCartLineMutation(item, async () => {
        useCartStore.setState((current) => ({
          items: (current.items ?? []).map((entry) =>
            cartLineKey(entry) === cartLineKey(item) ? { ...entry, quantity: nextQuantity } : entry
          )
        }));
        await setAuthenticatedCartQuantity({ ...item, quantity });
      });
    } catch (error) {
      useCartStore.setState({ items: previousItems });
      notify.error(error instanceof Error ? error.message : "Unable to update cart quantity.", { source: "cart" });
      throw error;
    }
    notify.success(FEEDBACK_MESSAGES.cartQuantityUpdated, {
      source: "cart",
      id: `cart:qty:${item.productSlug}:${item.bundleId ?? ""}:${item.variantId ?? ""}:${nextQuantity}`
    });
    return;
  }
  state.setQuantity(item.productSlug, item.bundleId, quantity, item.variantId);
  notify.success(FEEDBACK_MESSAGES.cartQuantityUpdated, {
    source: "cart",
    id: `cart:qty:${item.productSlug}:${item.bundleId ?? ""}:${item.variantId ?? ""}:${clampQuantity(quantity)}`
  });
}

export async function removeCartLine(item: Pick<PersistedCartItem, "productSlug" | "bundleId" | "variantId">) {
  await ensureCartSessionReady();
  const state = useCartStore.getState();
  if (state.cartSource === "authenticated") {
    try {
      await runCartLineMutation(item, async () => {
        await removeAuthenticatedCartItem(item);
      });
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Unable to remove item from cart.", { source: "cart" });
      throw error;
    }
    notify.success(FEEDBACK_MESSAGES.cartRemoved, {
      source: "cart",
      id: `cart:remove:${item.productSlug}:${item.bundleId ?? ""}:${item.variantId ?? ""}`
    });
    return;
  }
  state.removeItem(item.productSlug, item.bundleId, item.variantId);
  notify.success(FEEDBACK_MESSAGES.cartRemoved, {
    source: "cart",
    id: `cart:remove:${item.productSlug}:${item.bundleId ?? ""}:${item.variantId ?? ""}`
  });
}

