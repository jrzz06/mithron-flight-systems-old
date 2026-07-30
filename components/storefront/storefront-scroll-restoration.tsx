"use client";

import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect } from "react";

function useIsomorphicLayoutEffect(effect: () => void | (() => void), deps: React.DependencyList) {
  if (typeof window !== "undefined") {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useLayoutEffect(effect, deps);
  } else {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(effect, deps);
  }
}

export function StorefrontScrollRestoration() {
  const pathname = usePathname();

  // Enforce manual scroll restoration globally for the customer storefront layout
  useEffect(() => {
    if (typeof window !== "undefined" && "scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
  }, []);

  // Synchronously reset scroll coordinates to (0, 0) before DOM paint on pathname change
  useIsomorphicLayoutEffect(() => {
    if (typeof window === "undefined") return;

    // Do not override explicit in-page anchor navigation (e.g. #specs or #reviews)
    if (window.location.hash) return;

    const htmlEl = document.documentElement;
    const bodyEl = document.body;

    // Set data-instant-scroll attribute to force instant scroll behavior in CSS
    htmlEl.setAttribute("data-instant-scroll", "true");
    const previousHtmlBehavior = htmlEl.style.scrollBehavior;
    const previousBodyBehavior = bodyEl.style.scrollBehavior;

    htmlEl.style.scrollBehavior = "auto";
    bodyEl.style.scrollBehavior = "auto";

    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
    htmlEl.scrollTop = 0;
    bodyEl.scrollTop = 0;

    // Reinforce scroll position reset on next animation frame after React Suspense hydration
    const rafId = requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
      htmlEl.scrollTop = 0;
      bodyEl.scrollTop = 0;
      htmlEl.style.scrollBehavior = previousHtmlBehavior;
      bodyEl.style.scrollBehavior = previousBodyBehavior;
      htmlEl.removeAttribute("data-instant-scroll");
    });

    return () => {
      cancelAnimationFrame(rafId);
      htmlEl.style.scrollBehavior = previousHtmlBehavior;
      bodyEl.style.scrollBehavior = previousBodyBehavior;
      htmlEl.removeAttribute("data-instant-scroll");
    };
  }, [pathname]);

  return null;
}
