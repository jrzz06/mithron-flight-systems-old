"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { CartNavButton } from "@/components/navigation/cart-nav-button";
import { ProfileNavButton } from "@/components/navigation/profile-nav-button";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, forwardRef } from "react";
import { ChevronDown, Globe2, Menu, Search } from "lucide-react";
import { useAdaptiveNavbarTone } from "@/hooks/use-adaptive-navbar-tone";
import { useNavAnchor } from "@/hooks/use-nav-anchor";
import { normalizeStorefrontPath, resolveInitialNavbarTone } from "@/lib/navbar-ink-sampling";
import { resolveNavbarChromeMode } from "@/lib/navbar-ink-resolver";
import { NAVBAR_INK_STYLE_VARS } from "@/lib/navbar-ink-vars";
import { MithronBrandMark } from "@/components/brand/mithron-brand-mark";
import type { NavigationNode } from "@/config/types";
import type { EnterpriseMenuConfig, MegaMenuConfig } from "@/lib/nav-menu-types";
import { catalogCategoryDefinitions, ACCESSORIES_CATALOG_HREF } from "@/lib/catalog-categories";
import { isStorefrontGuestOnly } from "@/lib/storefront/guest-demo";
import { NAV_PANEL_CLOSE_MS, NAV_PANEL_OPEN_MS } from "@/store/nav-panel";
import { useUiStore } from "@/store/ui";

/** Match nav-panel hover-intent contract (60ms open / 200ms close). */
const MENU_OPEN_DELAY_MS = NAV_PANEL_OPEN_MS;
const MENU_CLOSE_DELAY_MS = NAV_PANEL_CLOSE_MS;
/** Cold-open only; category swaps while open are immediate. */
const MENU_EXIT_MS = 240;
const NAV_DESKTOP_PREFETCH_MIN_WIDTH = 1280;

function canUseHoverIntent() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

function setMegaMenuOpenAttr(open: boolean) {
  if (typeof document === "undefined") return;
  if (open) {
    document.documentElement.setAttribute("data-mega-menu-open", "");
  } else {
    document.documentElement.removeAttribute("data-mega-menu-open");
  }
}

const EnterpriseMegaMenuPanel = dynamic(
  () =>
    import("@/components/navigation/enterprise-mega-menu-panel").then(
      (mod) => mod.EnterpriseMegaMenuPanel
    ),
  { ssr: false, loading: () => null }
);

const MobileNavDrawer = dynamic(
  () =>
    import("@/components/navigation/mobile-nav-drawer").then((mod) => mod.MobileNavDrawer),
  { ssr: false, loading: () => null }
);

const NAV_LABEL_ALIASES: Record<string, string> = {
  "Our Franchise": "Global Products",
  "Global Product": "Global Products",
  "Global products": "Global Products",
  "Agriculture Drones": "Agri Drones",
  "Agricultural Drones": "Agri Drones"
};

function resolveNavigationItem(item: NavigationNode, menuByLabel: Map<string, EnterpriseMenuConfig>): NavigationNode {
  const label = NAV_LABEL_ALIASES[item.label] ?? item.label;
  const menu = menuByLabel.get(label);
  const resolved = label === item.label ? item : { ...item, label };
  if (!menu) return resolved;
  return { ...resolved, href: menu.href };
}

function shouldSkipAggressivePrefetch() {
  if (typeof navigator === "undefined") return false;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return true;
  if (typeof navigator.hardwareConcurrency === "number" && navigator.hardwareConcurrency <= 2) return true;
  return false;
}

export const StoreNav = forwardRef(function StoreNav(
  {
    navigationItems = [],
    enterpriseMenuConfigs = [],
    onSearchIntent,
    variant = "default"
  }: {
    navigationItems?: NavigationNode[];
    enterpriseMenuConfigs?: EnterpriseMenuConfig[];
    onSearchIntent?: () => void;
    variant?: "default" | "login";
  },
  ref: React.ForwardedRef<HTMLDivElement>
) {
  const router = useRouter();
  const pathname = usePathname();
  const overlay = useUiStore((state) => state.overlay);
  const setOverlay = useUiStore((state) => state.setOverlay);
  const mobileMenuOpen = overlay === "mobile-menu";
  const searchOpen = overlay === "search";
  const navRef = useRef<HTMLDivElement>(null);
  useNavAnchor(navRef, mobileMenuOpen || searchOpen);
  const normalizedPathname = useMemo(() => normalizeStorefrontPath(pathname), [pathname]);
  const initialNavbarTone = useMemo(() => resolveInitialNavbarTone(normalizedPathname), [normalizedPathname]);
  const { tone } = useAdaptiveNavbarTone(initialNavbarTone);
  const navChrome = useMemo(() => resolveNavbarChromeMode(normalizedPathname), [normalizedPathname]);
  const navInkStyle = NAVBAR_INK_STYLE_VARS[tone];
  const megaMenus = useMemo(
    () => enterpriseMenuConfigs.filter((menu): menu is MegaMenuConfig => menu.type === "mega"),
    [enterpriseMenuConfigs]
  );
  const enterpriseMenuByLabel = useMemo(
    () => new Map(enterpriseMenuConfigs.map((menu) => [menu.label, menu])),
    [enterpriseMenuConfigs]
  );
  const enterpriseMenuByKey = useMemo(
    () => new Map(enterpriseMenuConfigs.map((menu) => [menu.key, menu])),
    [enterpriseMenuConfigs]
  );
  const displayedNavigationItems = useMemo(
    () => navigationItems.map((item) => resolveNavigationItem(item, enterpriseMenuByLabel)),
    [navigationItems, enterpriseMenuByLabel]
  );
  const [activeMenuKey, setActiveMenuKey] = useState<string | null>(null);
  const [renderedMenuKey, setRenderedMenuKey] = useState<string | null>(null);
  const [featuredByMenu, setFeaturedByMenu] = useState<Record<string, string>>({});
  const [mobileDrawerMounted, setMobileDrawerMounted] = useState(false);
  const activeMenuKeyRef = useRef<string | null>(null);
  const renderedMenuKeyRef = useRef<string | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const openTimerRef = useRef<number | null>(null);
  const prefetchDebounceRef = useRef<Map<string, number>>(new Map());

  activeMenuKeyRef.current = activeMenuKey;
  renderedMenuKeyRef.current = renderedMenuKey;
  const activeNavIndex = useMemo(() => {
    return displayedNavigationItems.findIndex((item) => {
      const menu = enterpriseMenuByLabel.get(item.label);
      const legacyHref = catalogCategoryDefinitions.find((definition) => definition.label === item.label)?.legacyHref;
      const hrefs = [item.href, menu?.href, legacyHref].filter((href): href is string => Boolean(href));
      return hrefs.some((href) => {
        if (!href.startsWith("/")) return false;
        if (href === "/") return normalizedPathname === "/";
        return normalizedPathname === href || normalizedPathname.startsWith(`${href}/`);
      });
    });
  }, [displayedNavigationItems, enterpriseMenuByLabel, normalizedPathname]);

  const prefetchRoute = useCallback((href: string) => {
    if (!href.startsWith("/")) return;
    router.prefetch(href);
  }, [router]);

  const debouncedPrefetchRoute = useCallback((href: string) => {
    if (!href.startsWith("/")) return;
    const existing = prefetchDebounceRef.current.get(href);
    if (existing) window.clearTimeout(existing);
    const timerId = window.setTimeout(() => {
      prefetchDebounceRef.current.delete(href);
      router.prefetch(href);
    }, 80);
    prefetchDebounceRef.current.set(href, timerId);
  }, [router]);

  const preloadSearchOverlay = useCallback(() => {
    onSearchIntent?.();
    void import("@/components/overlays/search-overlay").catch((error: unknown) => {
      if (process.env.NODE_ENV !== "production") {
        console.error("Search overlay preload failed", error);
      }
    });
  }, [onSearchIntent]);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const clearOpenTimer = useCallback(() => {
    if (openTimerRef.current) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
  }, []);

  const clearAllMenuTimers = useCallback(() => {
    clearCloseTimer();
    clearOpenTimer();
  }, [clearCloseTimer, clearOpenTimer]);

  const commitEnterpriseMenu = useCallback((menuKey: string) => {
    clearAllMenuTimers();
    setRenderedMenuKey(menuKey);
    setActiveMenuKey(menuKey);
  }, [clearAllMenuTimers]);

  /**
   * Desktop hover intent: 60ms open delay when closed; immediate category swap when already open.
   * Never opens while search is open. Fine-pointer / mouse only.
   */
  const scheduleEnterpriseMenuOpen = useCallback((menuKey: string) => {
    if (useUiStore.getState().overlay === "search") return;

    clearCloseTimer();

    const alreadyOpen = Boolean(activeMenuKeyRef.current || renderedMenuKeyRef.current);
    if (alreadyOpen) {
      clearOpenTimer();
      setRenderedMenuKey(menuKey);
      setActiveMenuKey(menuKey);
      return;
    }

    clearOpenTimer();
    openTimerRef.current = window.setTimeout(() => {
      openTimerRef.current = null;
      if (useUiStore.getState().overlay === "search") return;
      setRenderedMenuKey(menuKey);
      setActiveMenuKey(menuKey);
    }, MENU_OPEN_DELAY_MS);
  }, [clearCloseTimer, clearOpenTimer]);

  const scheduleEnterpriseMenuClose = useCallback(() => {
    clearAllMenuTimers();
    closeTimerRef.current = window.setTimeout(() => {
      setActiveMenuKey(null);
    }, MENU_CLOSE_DELAY_MS);
  }, [clearAllMenuTimers]);

  const closeEnterpriseMenu = useCallback(() => {
    clearAllMenuTimers();
    setActiveMenuKey(null);
  }, [clearAllMenuTimers]);

  /** Force-unmount mega immediately so search open never races an exit animation. */
  const forceCloseEnterpriseMenu = useCallback(() => {
    clearAllMenuTimers();
    setActiveMenuKey(null);
    setRenderedMenuKey(null);
    setMegaMenuOpenAttr(false);
  }, [clearAllMenuTimers]);

  /** Click toggles search. Hover opens mega menus on fine pointers only. */
  const toggleSearch = useCallback(() => {
    if (useUiStore.getState().overlay === "search") {
      setOverlay(null);
      return;
    }
    preloadSearchOverlay();
    forceCloseEnterpriseMenu();
    setOverlay("search");
  }, [forceCloseEnterpriseMenu, preloadSearchOverlay, setOverlay]);

  const setFeaturedCard = useCallback((menuKey: string, featureKey: string | undefined) => {
    if (!featureKey) return;
    setFeaturedByMenu((current) => {
      if (current[menuKey] === featureKey) return current;
      return { ...current, [menuKey]: featureKey };
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia(`(min-width: ${NAV_DESKTOP_PREFETCH_MIN_WIDTH}px)`).matches) return;
    if (shouldSkipAggressivePrefetch()) return;

    const routes = displayedNavigationItems
      .map((item) => item.href)
      .filter((href) => href.startsWith("/") && href !== normalizedPathname);
    const primaryRoute = routes[0];
    if (!primaryRoute) return;

    const runWhenIdle = (callback: () => void, timeout = 3000): number => {
      const scheduleIdle = window.requestIdleCallback;
      if (typeof scheduleIdle === "function") {
        return scheduleIdle.call(window, callback, { timeout });
      }

      return window.setTimeout(callback, timeout);
    };

    let secondaryIdleId: number | undefined;
    const primaryIdleId = runWhenIdle(() => {
      prefetchRoute(primaryRoute);
    }, 3000);
    const secondaryTimer = window.setTimeout(() => {
      secondaryIdleId = runWhenIdle(() => {
        for (const href of routes.slice(1, 4)) {
          prefetchRoute(href);
        }
      }, 3000);
    }, 2600);

    return () => {
      if (typeof secondaryIdleId === "number") {
        const cancelIdle = window.cancelIdleCallback;
        if (typeof cancelIdle === "function") {
          cancelIdle.call(window, secondaryIdleId);
        } else {
          window.clearTimeout(secondaryIdleId);
        }
      }
      const cancelIdle = window.cancelIdleCallback;
      if (typeof cancelIdle === "function") {
        cancelIdle.call(window, primaryIdleId);
      } else {
        window.clearTimeout(primaryIdleId);
      }
      window.clearTimeout(secondaryTimer);
    };
  }, [displayedNavigationItems, normalizedPathname, prefetchRoute]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia(`(min-width: ${NAV_DESKTOP_PREFETCH_MIN_WIDTH}px)`).matches) return;

    const preloadMegaPanel = () => {
      void import("@/components/navigation/enterprise-mega-menu-panel").catch((error: unknown) => {
        if (process.env.NODE_ENV !== "production") {
          console.error("Mega menu panel preload failed", error);
        }
      });
    };

    let idleId: number | undefined;
    let timerId: number | undefined;
    const scheduleIdle = window.requestIdleCallback;
    if (typeof scheduleIdle === "function") {
      idleId = scheduleIdle.call(window, preloadMegaPanel, { timeout: 2500 });
    } else {
      timerId = window.setTimeout(preloadMegaPanel, 1200);
    }

    return () => {
      if (typeof idleId === "number") {
        const cancelIdle = window.cancelIdleCallback;
        if (typeof cancelIdle === "function") {
          cancelIdle.call(window, idleId);
        }
      }
      if (typeof timerId === "number") {
        window.clearTimeout(timerId);
      }
    };
  }, []);

  useEffect(() => {
    const debounceTimers = prefetchDebounceRef.current;
    return () => {
      clearAllMenuTimers();
      setMegaMenuOpenAttr(false);
      for (const timerId of debounceTimers.values()) {
        window.clearTimeout(timerId);
      }
      debounceTimers.clear();
    };
  }, [clearAllMenuTimers]);

  useEffect(() => {
    setMegaMenuOpenAttr(Boolean(activeMenuKey || renderedMenuKey));
    return () => {
      if (!activeMenuKey && !renderedMenuKey) {
        setMegaMenuOpenAttr(false);
      }
    };
  }, [activeMenuKey, renderedMenuKey]);

  useEffect(() => {
    if (activeMenuKey || !renderedMenuKey) return;

    const hideTimer = window.setTimeout(() => {
      setRenderedMenuKey(null);
    }, MENU_EXIT_MS);

    return () => window.clearTimeout(hideTimer);
  }, [activeMenuKey, renderedMenuKey]);

  useEffect(() => {
    if (mobileMenuOpen) {
      setMobileDrawerMounted(true);
      return;
    }
    if (!mobileDrawerMounted) return;
    const hideTimer = window.setTimeout(() => {
      setMobileDrawerMounted(false);
    }, MENU_EXIT_MS);
    return () => window.clearTimeout(hideTimer);
  }, [mobileMenuOpen, mobileDrawerMounted]);

  const panelOpen = Boolean(activeMenuKey && renderedMenuKey);
  const activeCategoryKey = activeMenuKey ?? renderedMenuKey ?? megaMenus[0]?.key ?? "";

  const isLoginNav = variant === "login";

  const setNavRef = useCallback(
    (node: HTMLDivElement | null) => {
      navRef.current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    },
    [ref]
  );

  return (
    <div
      ref={setNavRef}
      className="TOP_NAVBAR adaptive-navbar relative left-0 top-0 z-[var(--z-nav)] w-full"
      data-nav-state="adaptive"
      data-nav-ink={tone}
      data-nav-chrome={navChrome}
      data-nav-variant={variant}
      style={navInkStyle}
      onMouseEnter={clearCloseTimer}
      onMouseLeave={scheduleEnterpriseMenuClose}
      onBlur={(event) => {
        const nextTarget = event.relatedTarget;
        if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
        scheduleEnterpriseMenuClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          closeEnterpriseMenu();
        }
      }}
    >
      {!isLoginNav ? (
        <div className="mithron-topbar" data-testid="mithron-topbar">
          <div className="mithron-topbar__inner">
            <nav className="mithron-topbar__links" aria-label="Mithron quick links">
              <span className="mithron-topbar__brand" aria-label="Mithron domain">
                mithron.co
              </span>
              <Link href="/products" className="mithron-topbar__link mithron-topbar__more">
                Products <ChevronDown className="size-3" aria-hidden="true" />
              </Link>
            </nav>
            <p className="mithron-topbar__announcement">
              Drone Care, spares, and training paths are available now.
              <Link href={ACCESSORIES_CATALOG_HREF} className="mithron-topbar__announcement-link">
                Explore Drone Care
              </Link>
            </p>
            <div className="mithron-topbar__locale" aria-label="Store region and currency">
              <Globe2 className="size-3.5" aria-hidden="true" />
              <span>India (English / ₹ INR)</span>
            </div>
          </div>
        </div>
      ) : null}
      <header className="adaptive-navbar__bar relative h-[var(--store-nav-bar-height,3.5rem)] font-[var(--type-ui)] md:h-[var(--store-nav-bar-height-md,58px)]">
        <div className="adaptive-navbar__inner relative z-10 mx-auto grid h-full w-full max-w-[1680px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 pl-2 pr-4 md:pl-3 md:pr-8 lg:pl-5 lg:pr-[clamp(2.5rem,6.4vw,7.5rem)]">
          <div className="flex min-w-0 items-center justify-self-start md:gap-2.5">
            <Link href="/" aria-label="Go to Mithron home" className="adaptive-navbar__brand nav-interactive inline-flex shrink-0 items-center text-current">
              <MithronBrandMark priority />
              <span className="sr-only">Mithron</span>
            </Link>
          </div>

          <div className="adaptive-navbar__nav-cluster flex min-w-0 items-center justify-center">
            <nav
              className="nav-desktop-links min-w-0 items-center justify-center whitespace-nowrap"
              aria-label="Primary storefront navigation"
            >
              {displayedNavigationItems.map((item, index) => (
                <NavLinkItem
                  key={item.label}
                  item={item}
                  index={index}
                  activeNavIndex={activeNavIndex}
                  enterpriseMenuByLabel={enterpriseMenuByLabel}
                  activeMenuKey={activeMenuKey}
                  searchOpen={searchOpen}
                  onScheduleEnterpriseMenu={scheduleEnterpriseMenuOpen}
                />
              ))}
            </nav>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-1 justify-self-end md:gap-2.5">
            {!isLoginNav ? (
              <>
                <button
                  className="adaptive-navbar__icon nav-interactive nav-interactive--subtle inline-flex size-11 items-center justify-center rounded-full text-current"
                  aria-label="Search Mithron products"
                  aria-expanded={searchOpen}
                  type="button"
                  onFocus={preloadSearchOverlay}
                  onClick={toggleSearch}
                  onPointerDown={preloadSearchOverlay}
                >
                  <Search className="size-[18px]" />
                </button>
                <CartNavButton />
                {!isStorefrontGuestOnly() ? <ProfileNavButton /> : null}
              </>
            ) : null}
            <button
              type="button"
              className="adaptive-navbar__icon adaptive-navbar__menu-toggle nav-interactive nav-interactive--subtle nav-hamburger flex size-11 items-center justify-center rounded-full text-current"
              aria-label="Open menu"
              onClick={() => setOverlay("mobile-menu")}
            >
              <Menu className="size-[18px]" />
            </button>
          </div>
        </div>
      </header>
      {renderedMenuKey && megaMenus.length ? (
        <EnterpriseMegaMenuPanel
          menus={megaMenus}
          activeCategoryKey={activeCategoryKey}
          open={panelOpen}
          featuredKey={featuredByMenu[activeCategoryKey]}
          onCategoryIntent={(categoryKey) => {
            // In-panel category hover: commit immediately (panel already open).
            if (useUiStore.getState().overlay === "search") return;
            commitEnterpriseMenu(categoryKey);
          }}
          onFeatureIntent={(featureKey) => setFeaturedCard(activeCategoryKey, featureKey)}
          onRouteIntent={debouncedPrefetchRoute}
          onClose={closeEnterpriseMenu}
        />
      ) : null}
      {mobileDrawerMounted ? (
        <MobileNavDrawer
          navigationItems={displayedNavigationItems}
          enterpriseMenuConfigs={enterpriseMenuConfigs}
          open={mobileMenuOpen}
          onClose={() => setOverlay(null)}
          onSearch={isLoginNav ? undefined : toggleSearch}
          onSearchIntent={isLoginNav ? undefined : preloadSearchOverlay}
        />
      ) : null}
    </div>
  );
});

function NavLinkItem({
  item,
  index,
  activeNavIndex,
  enterpriseMenuByLabel,
  activeMenuKey,
  searchOpen,
  onScheduleEnterpriseMenu
}: {
  item: NavigationNode;
  index: number;
  activeNavIndex: number;
  enterpriseMenuByLabel: Map<string, EnterpriseMenuConfig>;
  activeMenuKey: string | null;
  searchOpen: boolean;
  onScheduleEnterpriseMenu: (menuKey: string) => void;
}) {
  const isActive = activeNavIndex === index;
  const menu = enterpriseMenuByLabel.get(item.label);
  const isMenuActive = menu ? activeMenuKey === menu.key : false;
  const menuId = menu ? "enterprise-mega-menu" : undefined;

  return (
    <div
      className="adaptive-navbar__link-wrap shrink-0"
      onPointerEnter={(event) => {
        if (!menu || searchOpen) return;
        if (event.pointerType !== "mouse" || !canUseHoverIntent()) return;
        onScheduleEnterpriseMenu(menu.key);
      }}
    >
      <Link
        href={item.href}
        aria-current={isActive ? "page" : undefined}
        aria-haspopup={menu ? "true" : undefined}
        aria-expanded={menu ? isMenuActive : undefined}
        aria-controls={menuId}
        onPointerEnter={(event) => {
          if (!menu || searchOpen) return;
          if (event.pointerType !== "mouse" || !canUseHoverIntent()) return;
          onScheduleEnterpriseMenu(menu.key);
        }}
        className={`adaptive-navbar__link type-nav nav-interactive group relative inline-flex h-10 items-center whitespace-nowrap text-current ${isActive ? "is-active" : ""}`}
      >
        <span className="adaptive-navbar__label relative z-[1]">
          {item.label}
        </span>
        {menu ? (
          <ChevronDown
            className={`ml-1.5 size-3.5 transition-transform duration-[220ms] ease-[var(--ease-cinematic)] ${isMenuActive ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        ) : null}
        <span aria-hidden="true" className="adaptive-navbar__underline pointer-events-none absolute bottom-[3px] left-0 h-px w-full origin-center" />
      </Link>
    </div>
  );
}
