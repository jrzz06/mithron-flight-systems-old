"use client";

import { useEffect, useMemo } from "react";
import type { CartItem, PersistedCartItem } from "@/config/types";
import {
  buildOptimisticCartLines,
  cartLinesMatchPersisted,
  mergeCartDisplayWithPricing
} from "@/lib/cart-display";
import { summarizeCartPricingBreakdown } from "@/lib/product-tax";
import { useCartStore, useCartSessionReady } from "@/store/cart";
import { useCartPricingStore } from "@/store/cart-pricing";

type UseResolvedCartOptions = {
  enabled?: boolean;
  itemsOverride?: PersistedCartItem[];
};

export function useResolvedCart(options: UseResolvedCartOptions = {}) {
  const isCartSessionReady = useCartStore((state) => state.isCartSessionReady);
  const enabled = (options.enabled ?? true) && isCartSessionReady;
  const storeItems = useCartStore((state) => state.items);
  const persistedItems = options.itemsOverride ?? storeItems;
  const snapshot = useCartPricingStore((state) => state.snapshot);
  const fetchPricing = useCartPricingStore((state) => state.fetchPricing);
  const clearPricingChanged = useCartPricingStore((state) => state.clearPricingChanged);

  useEffect(() => {
    if (!enabled) return;
    void fetchPricing(persistedItems);
  }, [enabled, fetchPricing, persistedItems]);

  const resolvedItems = snapshot.lines;
  const isResolving = enabled ? snapshot.isResolving : false;
  const error = enabled ? snapshot.error : null;
  const pricingChanged = enabled ? snapshot.pricingChanged : false;

  const hasResolvedPricing = useMemo(
    () =>
      enabled
      && resolvedItems.length > 0
      && !error
      && cartLinesMatchPersisted(persistedItems, resolvedItems),
    [enabled, persistedItems, resolvedItems, error]
  );

  const displayLines = useMemo(() => buildOptimisticCartLines(persistedItems), [persistedItems]);

  const items = useMemo(() => {
    if (!displayLines.length) return [];
    if (!resolvedItems.length) return displayLines;
    return mergeCartDisplayWithPricing(displayLines, resolvedItems);
  }, [displayLines, resolvedItems]);

  const pricing = useMemo(() => {
    const linesForPricing = items.filter((line) => line.unitPrice > 0);
    return summarizeCartPricingBreakdown(linesForPricing);
  }, [items]);
  const itemCount = useMemo(() => items.reduce((sum, item) => sum + item.quantity, 0), [items]);
  // Only pending while a fetch is in flight. A settled response with empty/mismatched
  // lines must not leave ellipsis prices forever (show optimistic display + retry instead).
  const pricesPending = persistedItems.length > 0 && !hasResolvedPricing && !error && isResolving;

  const refreshPricing = async () => {
    if (!enabled) return true;
    await fetchPricing(persistedItems);
    return !useCartPricingStore.getState().snapshot.error;
  };

  return {
    items,
    resolvedItems: hasResolvedPricing ? resolvedItems : ([] as CartItem[]),
    persistedItems,
    subtotal: pricing.itemsTotal,
    taxTotal: pricing.gstSgstTotal,
    gstSgstTotal: pricing.gstSgstTotal,
    roundingOff: pricing.roundingOff,
    grandTotal: pricing.finalAmount,
    itemCount,
    isResolving,
    pricesPending,
    hasResolvedPricing,
    pricingChanged,
    error,
    refreshPricing,
    clearPricingChanged
  };
}
