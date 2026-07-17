"use client";

import { useEffect, type RefObject } from "react";

function updateNavAnchorBottom(navElement: HTMLElement | null) {
  const root = document.documentElement;
  const rect = navElement?.getBoundingClientRect();
  if (!rect) return;

  const barRect = navElement
    ?.querySelector<HTMLElement>(".adaptive-navbar__bar")
    ?.getBoundingClientRect();
  const anchorBottom = Math.max(rect.bottom, barRect?.bottom ?? rect.bottom);

  root.style.setProperty("--nav-anchor-bottom", `${anchorBottom}px`);
}

export function useNavAnchor(navRef: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) {
      document.documentElement.style.removeProperty("--nav-anchor-bottom");
      return;
    }

    const navElement = navRef.current;
    if (!navElement) return;

    const syncAnchor = () => updateNavAnchorBottom(navRef.current);

    syncAnchor();
    window.addEventListener("resize", syncAnchor);
    window.addEventListener("scroll", syncAnchor, { passive: true });

    const resizeObserver = new ResizeObserver(syncAnchor);
    resizeObserver.observe(navElement);

    return () => {
      window.removeEventListener("resize", syncAnchor);
      window.removeEventListener("scroll", syncAnchor);
      resizeObserver.disconnect();
      document.documentElement.style.removeProperty("--nav-anchor-bottom");
    };
  }, [active, navRef]);
}
