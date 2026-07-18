"use client";

import { createClient } from "@/lib/client";
import {
  cancelAuthenticatedCartSync,
  fetchAuthenticatedCartItems,
  flushAuthenticatedCartSync,
  mergeCartItemLists
} from "@/lib/cart/cart-server-sync";
import { raceWithTimeout } from "@/lib/fetch-with-timeout";
import { rehydrateBuyNowSession, useBuyNowStore } from "@/store/buy-now-session";
import { useCartPricingStore } from "@/store/cart-pricing";
import {
  clearGuestCartStorage,
  GUEST_CART_STORAGE_KEY,
  LEGACY_CART_STORAGE_KEY,
  markCartSessionPending,
  markCartSessionReady,
  rehydrateGuestCartOnly,
  resetCartSession,
  useCartStore
} from "@/store/cart";
import type { CheckoutDraft, PersistedCartItem } from "@/config/types";

/** Bound auth/session bootstrap so a hung Supabase client cannot leave cart/checkout spinning forever. */
const CART_SESSION_AUTH_TIMEOUT_MS = 8_000;

function readLegacyGuestCart(): { items: unknown[]; checkout?: unknown } | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(LEGACY_CART_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { state?: { items?: unknown[]; checkout?: unknown }; items?: unknown[]; checkout?: unknown };
    if (parsed.state) {
      return { items: parsed.state.items ?? [], checkout: parsed.state.checkout };
    }
    return { items: parsed.items ?? [], checkout: parsed.checkout };
  } catch {
    return null;
  }
}

function readGuestCartSnapshot(): { items: PersistedCartItem[]; checkout: Partial<CheckoutDraft> | null } {
  if (typeof window === "undefined") {
    return { items: [], checkout: null };
  }

  const live = useCartStore.getState();
  if (live.cartSource === "guest") {
    return {
      items: live.items,
      checkout: live.checkout ?? null
    };
  }

  const raw = window.localStorage.getItem(GUEST_CART_STORAGE_KEY);
  if (!raw) return { items: [], checkout: null };
  try {
    const parsed = JSON.parse(raw) as {
      state?: { items?: PersistedCartItem[]; checkout?: CheckoutDraft };
      items?: PersistedCartItem[];
      checkout?: CheckoutDraft;
    };
    const state = parsed.state ?? parsed;
    return {
      items: Array.isArray(state.items) ? state.items : [],
      checkout: state.checkout ?? null
    };
  } catch {
    return { items: [], checkout: null };
  }
}

function migrateLegacyGuestStorageIfNeeded() {
  if (typeof window === "undefined") return;
  if (window.localStorage.getItem(GUEST_CART_STORAGE_KEY)) return;
  const legacy = readLegacyGuestCart();
  if (!legacy) return;

  const payload = {
    state: {
      items: legacy.items ?? [],
      checkout: legacy.checkout ?? undefined
    },
    version: 4
  };

  window.localStorage.setItem(GUEST_CART_STORAGE_KEY, JSON.stringify(payload));
  window.localStorage.removeItem(LEGACY_CART_STORAGE_KEY);
}

async function loadAuthenticatedCartSession(options?: {
  mergeGuestItems?: PersistedCartItem[];
  preserveCheckout?: Partial<CheckoutDraft> | null;
}) {
  const preservedCheckout: CheckoutDraft = {
    step: "cart",
    promoCode: "",
    email: options?.preserveCheckout?.email?.trim() || "",
    fullName: options?.preserveCheckout?.fullName?.trim() || "",
    phone: options?.preserveCheckout?.phone?.trim() || "",
    region: options?.preserveCheckout?.region?.trim() || "India"
  };

  resetCartSession({
    source: "authenticated",
    items: [],
    checkout: preservedCheckout,
    isCartSessionReady: false
  });
  clearGuestCartStorage();
  useCartPricingStore.getState().reset();

  try {
    const { items: remoteItems } = await fetchAuthenticatedCartItems();
    const mergedItems = options?.mergeGuestItems?.length
      ? mergeCartItemLists(remoteItems, options.mergeGuestItems)
      : remoteItems;

    resetCartSession({
      source: "authenticated",
      items: mergedItems,
      checkout: preservedCheckout,
      isCartSessionReady: false
    });

    if (options?.mergeGuestItems?.length) {
      await flushAuthenticatedCartSync(mergedItems).catch((error) => {
        console.error("[cart] Failed to sync merged guest cart.", error);
      });
    }
  } catch (error) {
    console.error("[cart] Failed to load authenticated cart.", error);
    const fallbackItems = options?.mergeGuestItems ?? [];
    resetCartSession({
      source: "authenticated",
      items: fallbackItems,
      checkout: preservedCheckout,
      isCartSessionReady: false
    });
  }
}

async function loadGuestCartSession() {
  cancelAuthenticatedCartSync();
  useCartPricingStore.getState().reset();
  resetCartSession({
    source: "guest",
    items: [],
    isCartSessionReady: false
  });

  migrateLegacyGuestStorageIfNeeded();
  await rehydrateGuestCartOnly();
  useCartStore.setState({ cartSource: "guest" });
}

let sessionInitPromise: Promise<void> | null = null;

async function resolveAuthCartSource() {
  try {
    const supabase = createClient();
    const { data } = await raceWithTimeout(
      supabase.auth.getSession(),
      CART_SESSION_AUTH_TIMEOUT_MS,
      "Cart auth session"
    );
    return Boolean(data.session?.user) ? ("authenticated" as const) : ("guest" as const);
  } catch (error) {
    console.warn("[cart] Auth session lookup timed out; defaulting to guest cart.", error);
    return "guest" as const;
  }
}

export async function initializeCartSession() {
  if (sessionInitPromise) {
    await sessionInitPromise;
    return;
  }

  const currentState = useCartStore.getState();
  const expectedSource = await resolveAuthCartSource();

  if (
    currentState.isCartSessionReady
    && currentState.cartSource === expectedSource
  ) {
    await rehydrateBuyNowSession();
    return;
  }

  sessionInitPromise = (async () => {
    markCartSessionPending();
    try {
      if (expectedSource === "authenticated") {
        await loadAuthenticatedCartSession();
      } else {
        await loadGuestCartSession();
      }
      await rehydrateBuyNowSession();
    } catch (error) {
      console.error("[cart] Cart session init failed; marking ready with guest fallback.", error);
      try {
        await loadGuestCartSession();
        await rehydrateBuyNowSession();
      } catch (fallbackError) {
        console.error("[cart] Guest cart fallback also failed.", fallbackError);
      }
    } finally {
      markCartSessionReady();
    }
  })();

  try {
    await sessionInitPromise;
  } finally {
    sessionInitPromise = null;
  }
}

export async function handleCartAuthSignedIn() {
  markCartSessionPending();
  try {
    const guestSnapshot = readGuestCartSnapshot();
    await loadAuthenticatedCartSession({
      mergeGuestItems: guestSnapshot.items,
      preserveCheckout: guestSnapshot.checkout
    });
    await rehydrateBuyNowSession();
  } finally {
    markCartSessionReady();
  }
}

export async function handleCartAuthSignedOut() {
  useBuyNowStore.getState().clearBuyNow();
  markCartSessionPending();
  try {
    clearGuestCartStorage();
    await loadGuestCartSession();
  } finally {
    markCartSessionReady();
  }
}

export function registerAuthenticatedCartUnloadSync() {
  if (typeof window === "undefined") return () => {};

  const handleBeforeUnload = () => {
    const state = useCartStore.getState();
    if (state.cartSource !== "authenticated") return;
    cancelAuthenticatedCartSync();
    void flushAuthenticatedCartSync(state.items);
  };

  window.addEventListener("beforeunload", handleBeforeUnload);
  return () => window.removeEventListener("beforeunload", handleBeforeUnload);
}
