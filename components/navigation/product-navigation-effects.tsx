"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect } from "react";
import {
  clearProductNavScrollLock,
  commitProductDestinationScroll,
  isProductPath
} from "@/lib/navigation/product-transition";

const SCROLL_LOCK_MS = 320;

/**
 * Storefront scroll policy for product navigations:
 * - Never restore previous page scroll
 * - Always open PDP at scrollTop = 0 (instant, not smooth)
 * - Never animate the browser's native scroll into the details page
 */
export function ProductNavigationEffects() {
  const pathname = usePathname();

  useEffect(() => {
    try {
      window.history.scrollRestoration = "manual";
    } catch {
      /* ignore */
    }
  }, []);

  useLayoutEffect(() => {
    if (!isProductPath(pathname)) {
      clearProductNavScrollLock();
      return;
    }

    commitProductDestinationScroll();
    const timer = window.setTimeout(() => {
      clearProductNavScrollLock();
    }, SCROLL_LOCK_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [pathname]);

  return null;
}
