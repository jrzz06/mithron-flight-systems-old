"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/client";
import {
  handleCartAuthSignedIn,
  handleCartAuthSignedOut,
  initializeCartSession,
  registerAuthenticatedCartUnloadSync
} from "@/lib/cart/cart-auth-sync";
import { fetchAuthenticatedCartItems } from "@/lib/cart/cart-server-sync";
import { useCartStore } from "@/store/cart";

export function useCartAuthSync(enabled: boolean) {
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    let active = true;

    if (!initializedRef.current) {
      initializedRef.current = true;
      void initializeCartSession();
    }

    const supabase = createClient();
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "INITIAL_SESSION") return;

      if (event === "SIGNED_IN" && session?.user) {
        void handleCartAuthSignedIn();
        return;
      }

      if (event === "SIGNED_OUT") {
        void handleCartAuthSignedOut();
      }
    });

    const removeUnloadSync = registerAuthenticatedCartUnloadSync();

    const handleFocusSync = () => {
      const state = useCartStore.getState();
      if (!state.isCartSessionReady) return;
      if (state.cartSource !== "authenticated") return;
      const pendingMutations = state.pendingLineMutations ?? {};
      if (Object.values(pendingMutations).some(Boolean)) return;
      void fetchAuthenticatedCartItems()
        .then(({ items }) => {
          useCartStore.setState({ items });
        })
        .catch(() => undefined);
    };

    window.addEventListener("focus", handleFocusSync);
    document.addEventListener("visibilitychange", handleFocusSync);

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
      removeUnloadSync();
      window.removeEventListener("focus", handleFocusSync);
      document.removeEventListener("visibilitychange", handleFocusSync);
    };
  }, [enabled]);
}
