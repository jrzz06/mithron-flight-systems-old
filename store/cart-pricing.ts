"use client";

import { create } from "zustand";
import type { CartItem, PersistedCartItem } from "@/config/types";

export type CartPricingSnapshot = {
  lines: CartItem[];
  subtotal: number;
  taxTotal: number;
  total: number;
  error: string | null;
  isResolving: boolean;
  pricingChanged: boolean;
  requestKey: string | null;
};

type CartPricingResponse = {
  lines: CartItem[];
  subtotal: number;
  taxTotal: number;
  total: number;
};

const emptySnapshot = (): CartPricingSnapshot => ({
  lines: [],
  subtotal: 0,
  taxTotal: 0,
  total: 0,
  error: null,
  isResolving: false,
  pricingChanged: false,
  requestKey: null
});

function pricingKey(items: PersistedCartItem[]) {
  return JSON.stringify(items);
}

let inflight: { key: string; promise: Promise<void> } | null = null;
let previousTotal: number | null = null;

type CartPricingStore = {
  snapshot: CartPricingSnapshot;
  fetchPricing: (items: PersistedCartItem[]) => Promise<void>;
  clearPricingChanged: () => void;
  reset: () => void;
};

export const useCartPricingStore = create<CartPricingStore>((set, get) => ({
  snapshot: emptySnapshot(),
  clearPricingChanged: () => {
    set((state) => ({
      snapshot: { ...state.snapshot, pricingChanged: false }
    }));
  },
  reset: () => {
    previousTotal = null;
    set({ snapshot: emptySnapshot() });
  },
  fetchPricing: async (items) => {
    const key = pricingKey(items);
    if (!items.length) {
      previousTotal = null;
      set({ snapshot: emptySnapshot() });
      return;
    }

    const current = get().snapshot;
    if (current.requestKey === key && current.lines.length > 0 && !current.error && !current.isResolving) {
      return;
    }

    if (inflight?.key === key) {
      await inflight.promise;
      return;
    }

    const promise = (async () => {
      set((state) => ({
        snapshot: {
          ...state.snapshot,
          isResolving: true,
          error: null
        }
      }));

      try {
        const response = await fetch("/api/cart/pricing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items }),
          cache: "no-store"
        });
        const payload = (await response.json()) as CartPricingResponse & { error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to load current cart pricing.");
        }

        const pricingChanged =
          previousTotal !== null && Math.abs(previousTotal - payload.total) > 0.009;
        previousTotal = payload.total;

        set({
          snapshot: {
            lines: payload.lines,
            subtotal: payload.subtotal,
            taxTotal: payload.taxTotal,
            total: payload.total,
            error: null,
            isResolving: false,
            pricingChanged,
            requestKey: key
          }
        });
      } catch (error) {
        set((state) => ({
          snapshot: {
            ...state.snapshot,
            isResolving: false,
            error: error instanceof Error ? error.message : "Unable to load current cart pricing."
          }
        }));
      }
    })();

    inflight = { key, promise };
    try {
      await promise;
    } finally {
      if (inflight?.key === key) inflight = null;
    }
  }
}));
