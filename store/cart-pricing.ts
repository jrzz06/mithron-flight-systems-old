"use client";

import { create } from "zustand";
import type { CartItem, PersistedCartItem } from "@/config/types";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

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
        const response = await fetchWithTimeout("/api/cart/pricing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items }),
          cache: "no-store"
        });
        const rawText = await response.text();
        let payload: (CartPricingResponse & { error?: string }) | null = null;
        try {
          payload = rawText ? (JSON.parse(rawText) as CartPricingResponse & { error?: string }) : null;
        } catch {
          throw new Error("Unable to load current cart pricing. Please retry.");
        }
        if (!response.ok) {
          throw new Error(payload?.error ?? "Unable to load current cart pricing.");
        }
        if (
          !payload
          || !Array.isArray(payload.lines)
          || typeof payload.subtotal !== "number"
          || typeof payload.taxTotal !== "number"
          || typeof payload.total !== "number"
        ) {
          throw new Error("Unable to load current cart pricing. Please retry.");
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
        const message =
          error instanceof Error && !/Unexpected token|is not valid JSON/i.test(error.message)
            ? error.message
            : "Unable to load current cart pricing. Please retry.";
        set((state) => ({
          snapshot: {
            ...state.snapshot,
            isResolving: false,
            error: message
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
