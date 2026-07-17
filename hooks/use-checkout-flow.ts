"use client";

import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import type { PersistedCartItem } from "@/config/types";
import { useBuyNowHasHydrated, useBuyNowItem } from "@/store/buy-now-session";
import { useCartStore } from "@/store/cart";

export type CheckoutFlow = "cart" | "buy-now";

export function resolveCheckoutFlowParam(value: string | null): CheckoutFlow {
  return value === "buy-now" ? "buy-now" : "cart";
}

export function resolveCheckoutItems(input: {
  flow: CheckoutFlow;
  buyNowItem: PersistedCartItem | null;
  cartItems: PersistedCartItem[];
}): PersistedCartItem[] {
  if (input.flow === "buy-now") {
    return input.buyNowItem ? [input.buyNowItem] : [];
  }
  return input.cartItems;
}

export function useCheckoutFlow() {
  const searchParams = useSearchParams();
  const flow = resolveCheckoutFlowParam(searchParams.get("flow"));
  const cartItems = useCartStore((state) => state.items);
  const buyNowItem = useBuyNowItem();
  const buyNowHasHydrated = useBuyNowHasHydrated();

  const checkoutItems = useMemo(
    () => resolveCheckoutItems({ flow, buyNowItem, cartItems }),
    [buyNowItem, cartItems, flow]
  );

  const isBuyNowFlow = flow === "buy-now";
  const isBuyNowSessionMissing = isBuyNowFlow && buyNowHasHydrated && !buyNowItem;

  return {
    flow,
    isBuyNowFlow,
    checkoutItems,
    buyNowItem,
    cartItems,
    buyNowHasHydrated,
    isBuyNowSessionMissing
  };
}
