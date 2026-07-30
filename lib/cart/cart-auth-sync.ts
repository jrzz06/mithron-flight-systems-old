"use client";

import { createClient } from "@/lib/client";
import {
  cancelAuthenticatedCartSync,
  fetchAuthenticatedCartItems,
  flushAuthenticatedCartSync,
  mergeGuestCartIntoAuthenticatedCart,
  resetAuthenticatedCartSyncState
} from "@/lib/cart/cart-server-sync";
import { cartLineKey } from "@/lib/cart-line-key";
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
const MERGE_IDEMPOTENCY_STORAGE_PREFIX = "mithron-cart-merge-id:";

function readLegacyGuestCart(): { items: unknown[]; checkout?: unknown } | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(LEGACY_CART_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as {
      state?: { items?: unknown[]; checkout?: unknown };
      items?: unknown[];
      checkout?: unknown;
    };
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

function guestSnapshotFingerprint(items: PersistedCartItem[]) {
  return items
    .map((item) => `${cartLineKey(item)}:${item.quantity}`)
    .sort()
    .join("|");
}

function resolveMergeIdempotencyKey(items: PersistedCartItem[]) {
  if (typeof window === "undefined") return crypto.randomUUID();
  const fingerprint = guestSnapshotFingerprint(items) || "empty";
  const storageKey = `${MERGE_IDEMPOTENCY_STORAGE_PREFIX}${fingerprint}`;
  try {
    const existing = window.sessionStorage.getItem(storageKey);
    if (existing) return existing;
    const next = crypto.randomUUID();
    window.sessionStorage.setItem(storageKey, next);
    return next;
  } catch {
    return crypto.randomUUID();
  }
}

function clearMergeIdempotencyKeys() {
  if (typeof window === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const key = window.sessionStorage.key(i);
      if (key?.startsWith(MERGE_IDEMPOTENCY_STORAGE_PREFIX)) keys.push(key);
    }
    for (const key of keys) window.sessionStorage.removeItem(key);
  } catch {
    // ignore
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

function buildPreservedCheckout(preserveCheckout?: Partial<CheckoutDraft> | null): CheckoutDraft {
  return {
    step: "cart",
    promoCode: "",
    email: preserveCheckout?.email?.trim() || "",
    fullName: preserveCheckout?.fullName?.trim() || "",
    phone: preserveCheckout?.phone?.trim() || "",
    region: preserveCheckout?.region?.trim() || "India"
  };
}

/**
 * Load authenticated cart, optionally merging guest lines via the atomic merge API.
 * Guest localStorage is cleared only after a successful merge/load commit.
 */
async function mergeGuestCartIntoAuthenticatedSession(options?: {
  mergeGuestItems?: PersistedCartItem[];
  preserveCheckout?: Partial<CheckoutDraft> | null;
}) {
  const preservedCheckout = buildPreservedCheckout(options?.preserveCheckout);
  const guestItems = options?.mergeGuestItems ?? [];

  cancelAuthenticatedCartSync();
  resetAuthenticatedCartSyncState();
  useCartPricingStore.getState().reset();

  // Switch to authenticated mode in memory without wiping guest storage yet.
  resetCartSession({
    source: "authenticated",
    items: [],
    checkout: preservedCheckout,
    isCartSessionReady: false
  });

  try {
    let cart: { items: PersistedCartItem[]; updatedAt: string | null };

    if (guestItems.length) {
      const idempotencyKey = resolveMergeIdempotencyKey(guestItems);
      cart = await mergeGuestCartIntoAuthenticatedCart(guestItems, idempotencyKey);
    } else {
      cart = await fetchAuthenticatedCartItems();
    }

    resetCartSession({
      source: "authenticated",
      items: cart.items,
      checkout: preservedCheckout,
      isCartSessionReady: false
    });

    // Source of truth is now the DB cart — clear guest only after success.
    clearGuestCartStorage();
    clearMergeIdempotencyKeys();
    useCartPricingStore.getState().reset();
  } catch (error) {
    console.error("[cart] Failed to merge/load authenticated cart.", error);
    // Keep guest storage intact for retry. Fall back to guest lines in memory if present.
    resetCartSession({
      source: "authenticated",
      items: guestItems,
      checkout: preservedCheckout,
      isCartSessionReady: false
    });
    throw error;
  }
}

async function loadGuestCartSession() {
  cancelAuthenticatedCartSync();
  resetAuthenticatedCartSyncState();
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

async function runAuthenticatedBootstrap() {
  const guestSnapshot = readGuestCartSnapshot();
  await mergeGuestCartIntoAuthenticatedSession({
    mergeGuestItems: guestSnapshot.items,
    preserveCheckout: guestSnapshot.checkout
  });
  await rehydrateBuyNowSession();
}

export async function initializeCartSession() {
  if (sessionInitPromise) {
    await sessionInitPromise;
    // If init finished as authenticated but guest leftovers remain, merge them now.
    const leftover = readGuestCartSnapshot();
    if (
      useCartStore.getState().cartSource === "authenticated"
      && leftover.items.length > 0
    ) {
      markCartSessionPending();
      try {
        await mergeGuestCartIntoAuthenticatedSession({
          mergeGuestItems: leftover.items,
          preserveCheckout: leftover.checkout
        });
      } catch (error) {
        console.error("[cart] Post-init guest merge failed.", error);
      } finally {
        markCartSessionReady();
      }
    }
    return;
  }

  const currentState = useCartStore.getState();
  const expectedSource = await resolveAuthCartSource();

  if (
    currentState.isCartSessionReady
    && currentState.cartSource === expectedSource
  ) {
    // Cold auth session that is "ready" but still has guest leftovers (e.g. race).
    if (expectedSource === "authenticated") {
      const leftover = readGuestCartSnapshot();
      if (leftover.items.length) {
        markCartSessionPending();
        try {
          await mergeGuestCartIntoAuthenticatedSession({
            mergeGuestItems: leftover.items,
            preserveCheckout: leftover.checkout
          });
        } catch (error) {
          console.error("[cart] Ready-state guest merge failed.", error);
        } finally {
          markCartSessionReady();
        }
      }
    }
    await rehydrateBuyNowSession();
    return;
  }

  sessionInitPromise = (async () => {
    markCartSessionPending();
    try {
      if (expectedSource === "authenticated") {
        await runAuthenticatedBootstrap();
      } else {
        await loadGuestCartSession();
        await rehydrateBuyNowSession();
      }
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
  const guestSnapshot = readGuestCartSnapshot();

  // Coalesce with in-flight init, then still merge if guest leftovers remain.
  if (sessionInitPromise) {
    await sessionInitPromise;
    const leftover = readGuestCartSnapshot();
    if (leftover.items.length === 0 && useCartStore.getState().cartSource === "authenticated") {
      return;
    }
  }

  sessionInitPromise = (async () => {
    markCartSessionPending();
    try {
      await mergeGuestCartIntoAuthenticatedSession({
        mergeGuestItems: guestSnapshot.items.length
          ? guestSnapshot.items
          : readGuestCartSnapshot().items,
        preserveCheckout: guestSnapshot.checkout ?? readGuestCartSnapshot().checkout
      });
      await rehydrateBuyNowSession();
    } catch (error) {
      console.error("[cart] Sign-in cart merge failed.", error);
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

export async function handleCartAuthSignedOut() {
  useBuyNowStore.getState().clearBuyNow();
  cancelAuthenticatedCartSync();
  resetAuthenticatedCartSyncState();
  markCartSessionPending();
  try {
    // Auth cart stays in the database only — never copy into guest storage.
    clearGuestCartStorage();
    clearMergeIdempotencyKeys();
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
