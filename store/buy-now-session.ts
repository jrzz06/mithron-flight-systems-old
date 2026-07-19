import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type { PersistedCartItem } from "@/config/types";
import type { NewCartItem } from "@/store/cart";

export const BUY_NOW_SESSION_STORAGE_KEY = "mithron-buy-now-session";

export type BuyNowSessionItem = PersistedCartItem & {
  chargeTax?: boolean;
  taxGroup?: string;
  taxRate?: number;
  taxIncluded?: boolean;
  category?: string;
  sku?: string;
  availabilityLabel?: string;
};

type BuyNowPersistedState = {
  active: boolean;
  item: BuyNowSessionItem | null;
  updatedAt: number;
};

type BuyNowStore = BuyNowPersistedState & {
  _hasHydrated: boolean;
  startBuyNow: (item: NewCartItem & { quantity: number }) => void;
  updateBuyNowQuantity: (quantity: number) => void;
  clearBuyNow: () => void;
};

function normalizeBundleId(bundleId: string | undefined) {
  const normalized = bundleId?.trim();
  return normalized || "standard";
}

function clampQuantity(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(99, Math.trunc(value)));
}

function toBuyNowItem(item: NewCartItem & { quantity: number }): BuyNowSessionItem {
  const quantity = clampQuantity(item.quantity ?? 1);
  return {
    productSlug: item.productSlug,
    bundleId: normalizeBundleId(item.bundleId),
    quantity,
    ...(item.variantId ? { variantId: item.variantId } : {}),
    ...(item.productName?.trim() ? { productName: item.productName.trim() } : {}),
    ...(item.bundleName?.trim() ? { bundleName: item.bundleName.trim() } : {}),
    ...(item.image?.trim() ? { image: item.image.trim() } : {}),
    ...(item.chargeTax !== undefined ? { chargeTax: item.chargeTax } : {}),
    ...(item.taxGroup ? { taxGroup: item.taxGroup } : {}),
    ...(item.taxRate !== undefined ? { taxRate: item.taxRate } : {}),
    ...(item.taxIncluded !== undefined ? { taxIncluded: item.taxIncluded } : {}),
    ...(item.category ? { category: item.category } : {}),
    ...(item.sku ? { sku: item.sku } : {}),
    ...(item.availabilityLabel ? { availabilityLabel: item.availabilityLabel } : {})
  };
}

const buyNowSessionStorage: StateStorage = {
  getItem: (name) => {
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem(name);
  },
  setItem: (name, value) => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(name, value);
  },
  removeItem: (name) => {
    if (typeof window === "undefined") return;
    window.sessionStorage.removeItem(name);
  }
};

function removeBuyNowStorage() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(BUY_NOW_SESSION_STORAGE_KEY);
}

export function mergeRehydratedBuyNowState(
  persistedState: unknown,
  currentState: Pick<BuyNowStore, "active" | "item" | "updatedAt">
): Pick<BuyNowStore, "active" | "item" | "updatedAt"> {
  if (currentState.active && currentState.item) {
    return {
      active: currentState.active,
      item: currentState.item,
      updatedAt: currentState.updatedAt
    };
  }

  const persisted = (persistedState ?? {}) as Partial<BuyNowPersistedState>;
  const persistedUpdatedAt = typeof persisted.updatedAt === "number" ? persisted.updatedAt : 0;
  const currentUpdatedAt = typeof currentState.updatedAt === "number" ? currentState.updatedAt : 0;

  if (currentUpdatedAt > persistedUpdatedAt) {
    return {
      active: currentState.active,
      item: currentState.item,
      updatedAt: currentState.updatedAt
    };
  }

  if (persistedUpdatedAt > currentUpdatedAt && persisted.active && persisted.item) {
    return {
      active: persisted.active,
      item: persisted.item,
      updatedAt: persistedUpdatedAt
    };
  }

  return {
    active: persisted.active ?? currentState.active,
    item: persisted.item ?? currentState.item,
    updatedAt: Math.max(persistedUpdatedAt, currentUpdatedAt)
  };
}

export const useBuyNowStore = create<BuyNowStore>()(
  persist(
    (set, get) => ({
      active: false,
      item: null,
      updatedAt: 0,
      _hasHydrated: false,
      startBuyNow(item) {
        removeBuyNowStorage();
        const nextItem = toBuyNowItem(item);
        const updatedAt = Date.now();
        set({ active: true, item: nextItem, updatedAt });
      },
      updateBuyNowQuantity(quantity) {
        const state = get();
        if (!state.active || !state.item) return;
        const nextQuantity = clampQuantity(quantity);
        set({
          item: { ...state.item, quantity: nextQuantity },
          updatedAt: Date.now()
        });
      },
      clearBuyNow() {
        removeBuyNowStorage();
        set({ active: false, item: null, updatedAt: Date.now() });
      }
    }),
    {
      name: BUY_NOW_SESSION_STORAGE_KEY,
      storage: createJSONStorage(() => buyNowSessionStorage),
      partialize: (state) => ({
        active: state.active,
        item: state.item,
        updatedAt: state.updatedAt
      }),
      skipHydration: true,
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...mergeRehydratedBuyNowState(persistedState, currentState),
        _hasHydrated: true
      }),
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          console.error("[buy-now] Failed to rehydrate persisted buy-now state.", error);
        }
        useBuyNowStore.setState({ _hasHydrated: true });
      }
    }
  )
);

export async function rehydrateBuyNowSession() {
  await useBuyNowStore.persist.rehydrate();
}

export function waitForBuyNowPersist() {
  return new Promise<void>((resolve) => {
    queueMicrotask(() => resolve());
  });
}

export function useBuyNowItem() {
  return useBuyNowStore((state) => (state.active ? state.item : null));
}

export function useBuyNowHasHydrated() {
  return useBuyNowStore((state) => state._hasHydrated);
}
