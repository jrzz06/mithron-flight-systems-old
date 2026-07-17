"use client";

import { useCallback, useRef, type RefObject } from "react";
import { StoreNav } from "@/components/navigation/store-nav";
import { useNavAnchorRef } from "@/components/navigation/nav-anchor-context";
import type { EnterpriseMenuConfig } from "@/lib/nav-menu-types";
import type { NavigationNode } from "@/config/types";

export function StoreNavWithAnchor({
  navigationItems,
  enterpriseMenuConfigs
}: {
  navigationItems: NavigationNode[];
  enterpriseMenuConfigs: EnterpriseMenuConfig[];
}) {
  const navRef = useNavAnchorRef() as RefObject<HTMLDivElement | null>;

  const preloadSearchOverlay = useCallback(() => {
    void import("@/components/overlays/search-overlay").catch((error: unknown) => {
      if (process.env.NODE_ENV !== "production") {
        console.error("Search overlay preload failed", error);
      }
    });
  }, []);

  return (
    <StoreNav
      ref={navRef}
      navigationItems={navigationItems}
      enterpriseMenuConfigs={enterpriseMenuConfigs}
      onSearchIntent={preloadSearchOverlay}
    />
  );
}
