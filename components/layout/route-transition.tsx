"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ViewTransition } from "react";
import {
  PRODUCT_OPEN_TRANSITION,
  isProductPath
} from "@/lib/navigation/product-transition";
import { isOperationalShellRoute } from "@/lib/ui/shell-routes";

let hasHydratedRouteTransition = false;

function supportsViewTransitions() {
  return typeof document !== "undefined" && "startViewTransition" in document;
}

export function RouteTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [animateEntry, setAnimateEntry] = useState(false);
  const [useViewTransitions, setUseViewTransitions] = useState(false);

  useEffect(() => {
    setUseViewTransitions(supportsViewTransitions());
    if (hasHydratedRouteTransition) {
      setAnimateEntry(true);
    }
    hasHydratedRouteTransition = true;
  }, [pathname]);

  if (pathname === "/" || isOperationalShellRoute(pathname)) {
    return <>{children}</>;
  }

  // With View Transitions, skip CSS slide-up — VT handles continuity (no bottom→top flash).
  // Without VT, use a soft opacity/scale fallback (never a dramatic swipe).
  const isProduct = isProductPath(pathname);
  const useCssFallback = animateEntry && !(useViewTransitions && isProduct);

  const content = (
    <div data-route-transition={useCssFallback ? "route-entry" : "initial-paint"}>
      {children}
    </div>
  );

  if (!isProduct) {
    return content;
  }

  return (
    <ViewTransition
      enter={{
        [PRODUCT_OPEN_TRANSITION]: "product-page-enter",
        default: "none"
      }}
      exit={{
        [PRODUCT_OPEN_TRANSITION]: "product-page-exit",
        default: "none"
      }}
      default="none"
    >
      {content}
    </ViewTransition>
  );
}
