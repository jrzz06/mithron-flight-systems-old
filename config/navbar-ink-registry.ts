import { catalogCategoryDefinitions } from "@/lib/catalog-category-taxonomy";

export type NavbarInkTone = "light" | "dark";

export const FLUSH_HERO_LIGHT_NAV_ROUTES = [
  "/agriculture",
  "/video-drones",
  "/creative-drones",
  "/mapping",
  "/surveillance",
  "/accessories",
  "/industrial"
] as const;

const FLUSH_HERO_LIGHT_NAV_ROUTE_SET = new Set<string>(FLUSH_HERO_LIGHT_NAV_ROUTES);

export function normalizeStorefrontPath(pathname: string | null) {
  if (!pathname) return "/";
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

/** First homepage carousel slide used for bootstrap before client hydration. */
export const HOMEPAGE_BOOTSTRAP_SLIDE_ID = "ag10-arrival" as const;

/** Homepage carousel — keyed by slide id. */
export const homepageSlideNavbarInk = {
  "ag10-arrival": "light",
  "mapping-flight": "light",
  "drone-ecosystem": "light"
} as const satisfies Record<string, NavbarInkTone>;

/**
 * Category showcase — keyed by /category/* path.
 * Use "light" (white labels) for flush dark cinematic showcases behind the
 * navbar. Runtime falls back to dark ink when no showcase surface is mounted
 * so white storefront chrome stays readable.
 */
export const categoryPathNavbarInk = {
  "/category/agri-drones": "light",
  "/category/video-drones": "light",
  "/category/creative-drones": "light",
  "/category/survey-drones": "light",
  "/category/surveillance-drones": "light",
  "/category/accessories": "light",
  "/category/global-products": "light"
} as const satisfies Record<string, NavbarInkTone>;

export function resolveHomepageSlideNavbarInk(slideId: string | null | undefined): NavbarInkTone {
  if (!slideId) return "light";
  return homepageSlideNavbarInk[slideId as keyof typeof homepageSlideNavbarInk] ?? "light";
}

export function resolveCategoryNavbarInk(pathname: string | null): NavbarInkTone {
  const normalized = normalizeStorefrontPath(pathname);
  return categoryPathNavbarInk[normalized as keyof typeof categoryPathNavbarInk] ?? "light";
}

export function resolveCategoryNavbarInkByCmsRouteKey(routeKey: string): NavbarInkTone | null {
  const definition = catalogCategoryDefinitions.find((entry) => entry.cmsRouteKey === routeKey);
  if (!definition) return null;
  return resolveCategoryNavbarInk(definition.href);
}

/** Routes with flush hero banners (excludes /login). */
export function isFlushHeroStreamingRoute(pathname: string | null): boolean {
  const normalized = normalizeStorefrontPath(pathname);
  if (normalized === "/login") return false;
  return getBootstrapNavbarInk(pathname) === "light";
}

/** SSR-safe bootstrap tone from pathname only. */
export function getBootstrapNavbarInk(pathname: string | null): NavbarInkTone {
  const normalized = normalizeStorefrontPath(pathname);
  if (normalized === "/") {
    return resolveHomepageSlideNavbarInk(HOMEPAGE_BOOTSTRAP_SLIDE_ID);
  }
  if (normalized === "/login") return "light";

  const categoryInk = categoryPathNavbarInk[normalized as keyof typeof categoryPathNavbarInk];
  if (categoryInk) return categoryInk;

  if (normalized.startsWith("/category/")) return "light";
  if (FLUSH_HERO_LIGHT_NAV_ROUTE_SET.has(normalized)) return "light";
  return "dark";
}
