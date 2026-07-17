"use client";

import { useSyncExternalStore } from "react";

export const DESKTOP_PURCHASE_MEDIA_QUERY = "(min-width: 1024px)";

function subscribeDesktopPurchaseLayout(onStoreChange: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }

  const query = window.matchMedia(DESKTOP_PURCHASE_MEDIA_QUERY);
  query.addEventListener("change", onStoreChange);
  return () => query.removeEventListener("change", onStoreChange);
}

function getDesktopPurchaseLayoutSnapshot() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia(DESKTOP_PURCHASE_MEDIA_QUERY).matches;
}

export function useDesktopPurchaseLayout() {
  return useSyncExternalStore(
    subscribeDesktopPurchaseLayout,
    getDesktopPurchaseLayoutSnapshot,
    () => false
  );
}
