import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type { CartItem, CheckoutDraft, CheckoutStep, PersistedCartItem } from "@/config/types";
import { cartLinesMatch, cartLineKey } from "@/lib/cart-line-key";
import { stripPersistedCartItems } from "@/lib/cart-pricing";
import {
  cancelAuthenticatedCartSync,
  clearAuthenticatedCartRemote,
  queueAuthenticatedCartSync
} from "@/lib/cart/cart-server-sync";

export type CartSource = "guest" | "authenticated";

export type NewCartItem = Omit<PersistedCartItem, "quantity"> & {
  quantity?: number;
  productName?: string;
  bundleName?: string;
  image?: string;
  chargeTax?: boolean;
  taxGroup?: string;
  taxRate?: number;
  taxIncluded?: boolean;
  category?: string;
  sku?: string;
  availabilityLabel?: string;
};

export type CartDrawerMode = "confirmation" | "cart";

export type CartSlice = {
  items: PersistedCartItem[];
  checkout: CheckoutDraft;
  isCartOpen: boolean;
  hasOpenedCart: boolean;
  cartDrawerMode: CartDrawerMode;
  lastAddedLineKey: string | null;
  addItem: (item: NewCartItem) => void;
  removeItem: (productSlug: string, bundleId: string, variantId?: string) => void;
  setQuantity: (productSlug: string, bundleId: string, quantity: number, variantId?: string) => void;
  clearCart: () => void;
  setCartOpen: (open: boolean) => void;
  openCartDrawer: (mode?: CartDrawerMode) => void;
  setCartDrawerMode: (mode: CartDrawerMode) => void;
  setCheckoutStep: (step: CheckoutStep) => void;
  setPromoCode: (promoCode: string) => void;
  setCheckoutEmail: (email: string) => void;
  setCheckoutContact: (contact: Partial<Pick<CheckoutDraft, "email" | "fullName" | "phone">>) => void;
  setCheckoutRegion: (region: string) => void;
  setShippingAddressId: (addressId: string) => void;
  setBillingAddressId: (addressId: string) => void;
  setCheckoutOrderMeta: (meta: Partial<Pick<CheckoutDraft, "paymentIntentId" | "orderId">>) => void;
  itemCount: () => number;
  addItemWithQuantity: (item: NewCartItem & { quantity: number }) => void;
  addToCart: (item: NewCartItem & { quantity: number }, options?: { openMiniCart?: boolean }) => void;
};

export const LEGACY_CART_STORAGE_KEY = "mithron-aero-cart";
export const GUEST_CART_STORAGE_KEY = "mithron-aero-cart-guest";

const initialCheckout: CheckoutDraft = {
  step: "cart",
  promoCode: "",
  email: "",
  fullName: "",
  phone: "",
  region: "India"
};

function normalizeBundleId(bundleId: string | undefined) {
  const normalized = bundleId?.trim();
  return normalized || "standard";
}

function toPersistedItem(item: NewCartItem): PersistedCartItem {
  return {
    productSlug: item.productSlug,
    bundleId: normalizeBundleId(item.bundleId),
    quantity: item.quantity ?? 1,
    ...(item.variantId ? { variantId: item.variantId } : {}),
    ...(item.productName?.trim() ? { productName: item.productName.trim() } : {}),
    ...(item.bundleName?.trim() ? { bundleName: item.bundleName.trim() } : {}),
    ...(item.image?.trim() ? { image: item.image.trim() } : {})
  };
}

function mergePersistedDisplayFields(existing: PersistedCartItem, incoming: PersistedCartItem): PersistedCartItem {
  return {
    ...existing,
    quantity: incoming.quantity,
    ...(incoming.variantId ? { variantId: incoming.variantId } : {}),
    ...(incoming.productName ? { productName: incoming.productName } : {}),
    ...(incoming.bundleName ? { bundleName: incoming.bundleName } : {}),
    ...(incoming.image ? { image: incoming.image } : {})
  };
}

function afterCartItemsMutation(getState: () => CartStore) {
  const state = getState();
  if (state.cartSource !== "authenticated") return;
  queueAuthenticatedCartSync(state.items, {
    onStart: () => useCartStore.setState({ isSyncing: true }),
    onComplete: () => useCartStore.setState({ isSyncing: false })
  });
}

const guestOnlyStorage: StateStorage = {
  getItem: (name) => {
    if (typeof window === "undefined") return null;
    if (useCartStore.getState().cartSource !== "guest") return null;
    return window.localStorage.getItem(name);
  },
  setItem: (name, value) => {
    if (typeof window === "undefined") return;
    if (useCartStore.getState().cartSource !== "guest") return;
    window.localStorage.setItem(name, value);
  },
  removeItem: (name) => {
    if (typeof window === "undefined") return;
    if (useCartStore.getState().cartSource !== "guest") return;
    window.localStorage.removeItem(name);
  }
};

export function createCartSlice(): CartSlice {
  const slice: CartSlice = {
    items: [],
    checkout: initialCheckout,
    isCartOpen: false,
    hasOpenedCart: false,
    cartDrawerMode: "cart" as CartDrawerMode,
    lastAddedLineKey: null,
    addItem(item) {
      const persisted = toPersistedItem({ ...item, quantity: item.quantity ?? 1 });
      const existing = slice.items.find((entry) => cartLinesMatch(entry, persisted));
      if (existing) {
        existing.quantity += 1;
        Object.assign(existing, mergePersistedDisplayFields(existing, { ...persisted, quantity: existing.quantity }));
      } else {
        slice.items.push(persisted);
      }
    },
    addItemWithQuantity(item) {
      const quantity = Math.max(1, Math.min(99, Math.trunc(item.quantity ?? 1)));
      const persisted = toPersistedItem({ ...item, quantity });
      const existing = slice.items.find((entry) => cartLinesMatch(entry, persisted));
      if (existing) {
        existing.quantity = persisted.quantity;
        Object.assign(existing, mergePersistedDisplayFields(existing, persisted));
      } else {
        slice.items.push(persisted);
      }
    },
    addToCart(item, options) {
      const quantity = Math.max(1, Math.min(99, Math.trunc(item.quantity ?? 1)));
      const persisted = toPersistedItem({ ...item, quantity });
      const lineKey = cartLineKey(persisted);
      const existing = slice.items.find((entry) => cartLinesMatch(entry, persisted));
      if (existing) {
        const nextQuantity = Math.min(99, existing.quantity + quantity);
        existing.quantity = nextQuantity;
        Object.assign(existing, mergePersistedDisplayFields(existing, { ...persisted, quantity: nextQuantity }));
      } else {
        slice.items.push(persisted);
      }
      if (options?.openMiniCart) {
        slice.isCartOpen = true;
        slice.hasOpenedCart = true;
        slice.cartDrawerMode = "confirmation";
        slice.lastAddedLineKey = lineKey;
      }
    },
    removeItem(productSlug, bundleId, variantId) {
      slice.items = slice.items.filter((entry) => {
        if (entry.productSlug !== productSlug || entry.bundleId !== bundleId) return true;
        if (variantId === undefined) return false;
        return (entry.variantId ?? "") !== variantId;
      });
    },
    setQuantity(productSlug, bundleId, quantity, variantId) {
      if (quantity <= 0) {
        slice.removeItem(productSlug, bundleId, variantId);
        return;
      }
      slice.items = slice.items.map((entry) =>
        entry.productSlug === productSlug
          && entry.bundleId === bundleId
          && (variantId === undefined || (entry.variantId ?? "") === variantId)
          ? { ...entry, quantity }
          : entry
      );
    },
    clearCart() {
      slice.items = [];
      slice.checkout = initialCheckout;
    },
    setCartOpen(open) {
      slice.isCartOpen = open;
      if (open) {
        slice.hasOpenedCart = true;
      } else {
        slice.cartDrawerMode = "cart";
        slice.lastAddedLineKey = null;
      }
    },
    openCartDrawer(mode = "cart" as CartDrawerMode) {
      slice.isCartOpen = true;
      slice.hasOpenedCart = true;
      slice.cartDrawerMode = mode;
      if (mode === "cart") {
        slice.lastAddedLineKey = null;
      }
    },
    setCartDrawerMode(mode) {
      slice.cartDrawerMode = mode;
    },
    setCheckoutStep(step) {
      slice.checkout = { ...slice.checkout, step };
    },
    setPromoCode(promoCode) {
      slice.checkout = { ...slice.checkout, promoCode };
    },
    setCheckoutEmail(email) {
      slice.checkout = { ...slice.checkout, email };
    },
    setCheckoutContact(contact) {
      slice.checkout = { ...slice.checkout, ...contact };
    },
    setCheckoutRegion(region) {
      slice.checkout = { ...slice.checkout, region };
    },
    setShippingAddressId(shippingAddressId) {
      slice.checkout = { ...slice.checkout, shippingAddressId };
    },
    setBillingAddressId(billingAddressId) {
      slice.checkout = { ...slice.checkout, billingAddressId };
    },
    setCheckoutOrderMeta(meta) {
      slice.checkout = { ...slice.checkout, ...meta };
    },
    itemCount() {
      return slice.items.reduce((sum, item) => sum + item.quantity, 0);
    }
  };

  return slice;
}

type CartStore = CartSlice & {
  cartSource: CartSource;
  isCartSessionReady: boolean;
  isSyncing: boolean;
  _hasHydrated: boolean;
  pendingLineMutations?: Record<string, boolean>;
};

const CART_STORAGE_VERSION = 4;

export function mergeRehydratedCartState(persistedState: unknown, currentState: CartSlice): Pick<CartSlice, "items" | "checkout"> {
  const persisted = (persistedState ?? {}) as Partial<CartSlice>;
  const persistedItems = persisted.items ?? [];
  const currentItems = currentState.items ?? [];

  const items =
    currentItems.length > 0 && persistedItems.length === 0
      ? currentItems
      : persistedItems.length > 0
        ? persistedItems
        : currentItems;

  return {
    items,
    checkout: persisted.checkout ?? currentState.checkout
  };
}

export function clearGuestCartStorage() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LEGACY_CART_STORAGE_KEY);
  window.localStorage.removeItem(GUEST_CART_STORAGE_KEY);
  if (useCartStore.getState().cartSource === "guest") {
    useCartStore.persist.clearStorage();
  }
}

export async function rehydrateGuestCartOnly() {
  if (useCartStore.getState().cartSource !== "guest") return;
  await useCartStore.persist.rehydrate();
}

export function resetCartSession(options: {
  source: CartSource;
  items?: PersistedCartItem[];
  checkout?: CheckoutDraft;
  isCartSessionReady?: boolean;
}) {
  cancelAuthenticatedCartSync();
  useCartStore.setState({
    cartSource: options.source,
    items: options.items ?? [],
    checkout: options.checkout ?? initialCheckout,
    isCartSessionReady: options.isCartSessionReady ?? useCartStore.getState().isCartSessionReady,
    isSyncing: false,
    _hasHydrated: options.isCartSessionReady ?? useCartStore.getState()._hasHydrated
  });
}

export function markCartSessionReady() {
  useCartStore.setState({
    isCartSessionReady: true,
    _hasHydrated: true
  });
}

export function markCartSessionPending() {
  useCartStore.setState({
    isCartSessionReady: false,
    _hasHydrated: false
  });
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      checkout: initialCheckout,
      isCartOpen: false,
      hasOpenedCart: false,
      cartDrawerMode: "cart" as CartDrawerMode,
      lastAddedLineKey: null,
      cartSource: "guest",
      isCartSessionReady: false,
      isSyncing: false,
      _hasHydrated: false,
      pendingLineMutations: {},
      addItem(item) {
        const persisted = toPersistedItem({ ...item, quantity: 1 });
        set((state) => {
          const existing = state.items.find((entry) => cartLinesMatch(entry, persisted));
          if (existing) {
            return {
              items: state.items.map((entry) =>
                cartLinesMatch(entry, persisted)
                  ? mergePersistedDisplayFields(entry, { ...persisted, quantity: entry.quantity + 1 })
                  : entry
              )
            };
          }
          return { items: [...state.items, persisted] };
        });
        afterCartItemsMutation(get);
      },
      addItemWithQuantity(item) {
        const quantity = Math.max(1, Math.min(99, Math.trunc(item.quantity ?? 1)));
        const persisted = toPersistedItem({ ...item, quantity });
        set((state) => {
          const existing = state.items.find((entry) => cartLinesMatch(entry, persisted));
          if (existing) {
            return {
              items: state.items.map((entry) =>
                cartLinesMatch(entry, persisted) ? mergePersistedDisplayFields(entry, persisted) : entry
              )
            };
          }
          return { items: [...state.items, persisted] };
        });
        afterCartItemsMutation(get);
      },
      addToCart(item, options) {
        const quantity = Math.max(1, Math.min(99, Math.trunc(item.quantity ?? 1)));
        const persisted = toPersistedItem({ ...item, quantity });
        const lineKey = cartLineKey(persisted);
        set((state) => {
          const existing = state.items.find((entry) => cartLinesMatch(entry, persisted));
          const items = existing
            ? state.items.map((entry) =>
                cartLinesMatch(entry, persisted)
                  ? mergePersistedDisplayFields(entry, {
                      ...persisted,
                      quantity: Math.min(99, entry.quantity + quantity)
                    })
                  : entry
              )
            : [...state.items, persisted];

          return {
            items,
            ...(options?.openMiniCart
              ? {
                  isCartOpen: true,
                  hasOpenedCart: true,
                  cartDrawerMode: "confirmation" as CartDrawerMode,
                  lastAddedLineKey: lineKey
                }
              : {})
          };
        });
        afterCartItemsMutation(get);
      },
      removeItem(productSlug, bundleId, variantId) {
        set((state) => ({
          items: state.items.filter((entry) => {
            if (entry.productSlug !== productSlug || entry.bundleId !== bundleId) return true;
            if (variantId === undefined) return false;
            return (entry.variantId ?? "") !== variantId;
          })
        }));
        afterCartItemsMutation(get);
      },
      setQuantity(productSlug, bundleId, quantity, variantId) {
        if (quantity <= 0) {
          get().removeItem(productSlug, bundleId, variantId);
          return;
        }
        set((state) => ({
          items: state.items.map((entry) =>
            entry.productSlug === productSlug
              && entry.bundleId === bundleId
              && (variantId === undefined || (entry.variantId ?? "") === variantId)
              ? { ...entry, quantity }
              : entry
          )
        }));
        afterCartItemsMutation(get);
      },
      clearCart() {
        const source = get().cartSource;
        set({ items: [], checkout: initialCheckout, pendingLineMutations: {} });
        if (source === "authenticated") {
          cancelAuthenticatedCartSync();
          void clearAuthenticatedCartRemote();
        }
      },
      setCartOpen(open) {
        set((state) => ({
          isCartOpen: open,
          hasOpenedCart: state.hasOpenedCart || open,
          ...(open ? {} : { cartDrawerMode: "cart" as CartDrawerMode, lastAddedLineKey: null })
        }));
      },
      openCartDrawer(mode: CartDrawerMode = "cart") {
        set((state) => ({
          isCartOpen: true,
          hasOpenedCart: true,
          cartDrawerMode: mode,
          lastAddedLineKey: mode === "confirmation" ? state.lastAddedLineKey : null
        }));
      },
      setCartDrawerMode(mode) {
        set({ cartDrawerMode: mode });
      },
      setCheckoutStep(step) {
        set((state) => ({ checkout: { ...state.checkout, step } }));
      },
      setPromoCode(promoCode) {
        set((state) => ({ checkout: { ...state.checkout, promoCode } }));
      },
      setCheckoutEmail(email) {
        set((state) => ({ checkout: { ...state.checkout, email } }));
      },
      setCheckoutContact(contact) {
        set((state) => ({ checkout: { ...state.checkout, ...contact } }));
      },
      setCheckoutRegion(region) {
        set((state) => ({ checkout: { ...state.checkout, region } }));
      },
      setShippingAddressId(shippingAddressId) {
        set((state) => ({ checkout: { ...state.checkout, shippingAddressId } }));
      },
      setBillingAddressId(billingAddressId) {
        set((state) => ({ checkout: { ...state.checkout, billingAddressId } }));
      },
      setCheckoutOrderMeta(meta) {
        set((state) => ({ checkout: { ...state.checkout, ...meta } }));
      },
      itemCount() {
        return get().items.reduce((sum, item) => sum + item.quantity, 0);
      }
    }),
    {
      name: GUEST_CART_STORAGE_KEY,
      version: CART_STORAGE_VERSION,
      storage: createJSONStorage(() => guestOnlyStorage),
      migrate: (persistedState, version) => {
        const state = (persistedState ?? {}) as { items?: Array<PersistedCartItem & Record<string, unknown>>; checkout?: CheckoutDraft };
        if (version < CART_STORAGE_VERSION) {
          return {
            ...state,
            items: stripPersistedCartItems(state.items ?? [])
          };
        }
        return persistedState as CartStore;
      },
      partialize: (state) => {
        if (state.cartSource === "authenticated") {
          return { items: [], checkout: initialCheckout };
        }
        return {
          items: state.items.map((item) => ({
            productSlug: item.productSlug,
            bundleId: item.bundleId,
            quantity: item.quantity,
            ...(item.variantId ? { variantId: item.variantId } : {}),
            ...(item.productName ? { productName: item.productName } : {}),
            ...(item.bundleName ? { bundleName: item.bundleName } : {}),
            ...(item.image ? { image: item.image } : {})
          })),
          checkout: state.checkout
        };
      },
      skipHydration: true,
      merge: (persistedState, currentState) => {
        const store = currentState as CartStore;
        if (store.cartSource === "authenticated") {
          return {
            ...currentState,
            _hasHydrated: true
          };
        }

        return {
          ...currentState,
          ...mergeRehydratedCartState(persistedState, currentState),
          _hasHydrated: true
        };
      },
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          console.error("[cart] Failed to rehydrate persisted cart state.", error);
        }
        if (useCartStore.getState().cartSource === "guest") {
          useCartStore.setState({ _hasHydrated: true });
        }
      }
    }
  )
);

export type { CartItem };

export function useCartItemCount() {
  const isReady = useCartStore((state) => state.isCartSessionReady);
  const count = useCartStore((state) => state.items.reduce((sum, item) => sum + item.quantity, 0));
  return isReady ? count : 0;
}

export function useCartHasHydrated() {
  return useCartStore((state) => state._hasHydrated);
}

export function useCartSessionReady() {
  return useCartStore((state) => state.isCartSessionReady);
}
