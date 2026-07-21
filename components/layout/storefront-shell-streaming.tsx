"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { NavAnchorProvider } from "@/components/navigation/nav-anchor-context";
import { LogoutNoticeToastBridge } from "@/components/notifications/logout-notice-toast-bridge";
import { ToastProvider } from "@/components/notifications/toast-provider";
import { SoftErrorBoundary } from "@/components/soft-error-boundary";
import { shouldSkipStorefrontChrome } from "@/lib/ui/shell-routes";
import { useCartAuthSync } from "@/hooks/use-cart-auth-sync";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { useCartStore } from "@/store/cart";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/ui";

const SearchOverlay = dynamic(() => import("@/components/overlays/search-overlay").then((mod) => mod.SearchOverlay), {
  ssr: false,
  loading: () => null
});

const CartDrawer = dynamic(() => import("@/components/overlays/cart-drawer").then((mod) => mod.CartDrawer), {
  ssr: false,
  loading: () => null
});

function loadAssistantWidget() {
  return import("@/components/assistant/mithron-assistant-widget").then((mod) => mod.MithronAssistantWidget);
}

const MithronAssistantWidget = dynamic(
  () => loadAssistantWidget().catch(() => loadAssistantWidget()),
  { ssr: false, loading: () => null }
);

type StorefrontShellStreamingLayoutProps = {
  headerChrome: ReactNode;
  footerChrome: ReactNode;
  children: ReactNode;
};

export function StorefrontShellStreamingLayout({
  headerChrome,
  footerChrome,
  children
}: StorefrontShellStreamingLayoutProps) {
  const pathname = usePathname();
  const skipsStorefrontChrome = shouldSkipStorefrontChrome(pathname);
  const isHome = pathname === "/";
  const usesStorefrontChrome = !skipsStorefrontChrome;
  const hasOpenedSearch = useUiStore((state) => state.hasOpenedSearch);
  const hasOpenedCart = useCartStore((state) => state.hasOpenedCart);
  const overlay = useUiStore((state) => state.overlay);
  const online = useOnlineStatus();
  const [searchPrewarmed, setSearchPrewarmed] = useState(false);
  const [cartPrewarmed, setCartPrewarmed] = useState(false);
  const [assistantMounted, setAssistantMounted] = useState(false);
  const isMountedRef = useRef(false);
  const navRef = useRef<HTMLDivElement>(null);
  const headerShellRef = useRef<HTMLDivElement>(null);
  const searchOpen = overlay === "search";

  useEffect(() => {
    const root = document.documentElement;
    if (overlay) {
      root.setAttribute("data-overlay-open", overlay);
    } else {
      root.removeAttribute("data-overlay-open");
    }

    return () => {
      root.removeAttribute("data-overlay-open");
    };
  }, [overlay]);

  useEffect(() => {
    // Panel measures its own bottom into --search-header-bottom (fixed sheet).
    if (!searchOpen) {
      document.documentElement.style.removeProperty("--search-header-bottom");
    }
  }, [searchOpen]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, [pathname]);

  useCartAuthSync(usesStorefrontChrome);

  const requestSearchPreload = useCallback((mountWhenReady = false) => {
    void import("@/components/overlays/search-overlay").catch((error: unknown) => {
      if (process.env.NODE_ENV !== "production") {
        console.error("Search overlay preload failed", error);
      }
    });
    if (mountWhenReady && isMountedRef.current) {
      setSearchPrewarmed(true);
    }
  }, []);

  useEffect(() => {
    if (!usesStorefrontChrome) return;

    let active = true;
    let timerId: ReturnType<typeof globalThis.setTimeout> | undefined;
    let idleId: number | undefined;
    let assistantTimerId: ReturnType<typeof globalThis.setTimeout> | undefined;

    const preloadSupportOverlays = () => {
      if (!active) return;
      void import("@/components/overlays/cart-drawer").catch((error: unknown) => {
        if (process.env.NODE_ENV !== "production") {
          console.error("Cart drawer preload failed", error);
        }
      });
    };

    // Defer assistant chunk until idle — avoids first-load JS on every storefront route.
    const mountAssistantWhenIdle = () => {
      if (!active || !isMountedRef.current) return;
      setAssistantMounted(true);
    };

    if ("requestIdleCallback" in globalThis) {
      idleId = globalThis.requestIdleCallback(preloadSupportOverlays, { timeout: 3000 });
    } else {
      timerId = globalThis.setTimeout(preloadSupportOverlays, 3000);
    }
    assistantTimerId = globalThis.setTimeout(mountAssistantWhenIdle, 4500);

    return () => {
      active = false;
      if (idleId !== undefined && "cancelIdleCallback" in globalThis) {
        globalThis.cancelIdleCallback(idleId);
      }
      if (timerId) {
        globalThis.clearTimeout(timerId);
      }
      if (assistantTimerId) {
        globalThis.clearTimeout(assistantTimerId);
      }
    };
  }, [usesStorefrontChrome, requestSearchPreload]);

  if (skipsStorefrontChrome) {
    return (
      <>
        {children}
        <Suspense fallback={null}>
          <LogoutNoticeToastBridge />
        </Suspense>
        <ToastProvider theme="storefront" desktopPosition="top-center" />
      </>
    );
  }

  return (
    <NavAnchorProvider navRef={navRef}>
      <div data-storefront className="storefront-root">
        <div
          ref={headerShellRef}
          className={cn("storefront-header-shell", searchOpen && "is-search-open")}
        >
          {headerChrome}
          {searchPrewarmed || hasOpenedSearch ? (
            <SoftErrorBoundary label="Search">
              <SearchOverlay />
            </SoftErrorBoundary>
          ) : null}
        </div>
        <main
          id="g-main"
          data-testid={isHome ? "home-page-canvas" : undefined}
          data-homepage-contract={isHome ? "NAV_HERO_CAROUSEL_COMPOSITE" : undefined}
          className={cn(isHome && "home-page-canvas")}
        >
          {!online ? (
            <div
              className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-950"
              role="status"
              data-storefront-offline-banner
            >
              You appear to be offline. Some actions are paused until your connection returns.
            </div>
          ) : null}
          {children}
        </main>
        {isHome ? null : footerChrome}
        {cartPrewarmed || hasOpenedCart ? (
          <SoftErrorBoundary label="Cart drawer">
            <CartDrawer />
          </SoftErrorBoundary>
        ) : null}
        {assistantMounted ? (
          <SoftErrorBoundary label="Assistant">
            <MithronAssistantWidget />
          </SoftErrorBoundary>
        ) : null}
        <Suspense fallback={null}>
          <LogoutNoticeToastBridge />
        </Suspense>
        <ToastProvider theme="storefront" desktopPosition="top-center" />
      </div>
    </NavAnchorProvider>
  );
}
