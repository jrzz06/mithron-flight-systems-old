import {
  getBootstrapNavbarInk,
  isFlushHeroStreamingRoute,
  normalizeStorefrontPath,
  type NavbarInkTone
} from "@/config/navbar-ink-registry";

export type { NavbarInkTone } from "@/config/navbar-ink-registry";
export {
  FLUSH_HERO_LIGHT_NAV_ROUTES,
  normalizeStorefrontPath
} from "@/config/navbar-ink-registry";

export const NAVBAR_INK_SURFACE_SELECTOR =
  "[data-navbar-ink-surface], #hero, [data-testid='home-hero'], .catalog-hero-section--showcase, [data-testid='home-product-shelf-hero']";

/** SSR-safe and bootstrap tone from pathname only. */
export function resolvePathNavbarTone(pathname: string | null): NavbarInkTone {
  return getBootstrapNavbarInk(pathname);
}

export function readNavbarInkAttribute(surface: Element | null | undefined): NavbarInkTone | null {
  const ink = surface?.getAttribute("data-navbar-ink");
  return ink === "light" || ink === "dark" ? ink : null;
}

export function isFlushHeroDocument() {
  if (typeof document === "undefined") return false;

  return Boolean(
    document.querySelector(".catalog-hero-section--showcase") ||
      document.querySelector("#g-main.home-page-canvas")
  );
}

export function navbarOverlapsSurface(surface: Element) {
  if (typeof document === "undefined") return false;

  const bar = document.querySelector(".adaptive-navbar__bar");
  const barRect = bar?.getBoundingClientRect();
  const surfaceRect = surface.getBoundingClientRect();

  if (!barRect || barRect.width <= 0) return true;

  return barRect.bottom >= surfaceRect.top && barRect.top <= surfaceRect.bottom;
}

export function resolveActiveSurfaceNavbarTone(): NavbarInkTone | null {
  if (typeof document === "undefined") return null;

  const surfaces = document.querySelectorAll(NAVBAR_INK_SURFACE_SELECTOR);
  for (const surface of surfaces) {
    if (!navbarOverlapsSurface(surface)) continue;

    const ink = readNavbarInkAttribute(surface);
    if (ink) return ink;
  }

  return null;
}

/** Runtime tone: overlapping surface ink wins, then path/bootstrap, then scroll-past-hero dark. */
export function resolveNavbarTone(pathTone: NavbarInkTone, pathname: string | null = null): NavbarInkTone {
  const surfaceTone = resolveActiveSurfaceNavbarTone();
  if (surfaceTone) return surfaceTone;

  const surfaces = document.querySelectorAll(NAVBAR_INK_SURFACE_SELECTOR);
  const overlappingSurfaces = Array.from(surfaces).filter(navbarOverlapsSurface);

  if (isFlushHeroDocument() && surfaces.length > 0 && overlappingSurfaces.length === 0) {
    return "dark";
  }

  // No ink surface mounted: keep light only for flush home/login streaming gaps.
  // Category and other light-path routes without a hero surface must use dark ink
  // so white storefront chrome stays readable (avoids white-on-white nav text).
  if (surfaces.length === 0 && pathTone === "light") {
    const path = normalizeStorefrontPath(pathname);
    if (path === "/" || path === "/login" || isFlushHeroDocument()) {
      return "light";
    }
    return "dark";
  }

  if (pathTone === "light" && (isFlushHeroStreamingRoute(pathname) || normalizeStorefrontPath(pathname) === "/login")) {
    return "light";
  }

  if (overlappingSurfaces.length > 0 && pathTone === "light") {
    return "light";
  }

  return "dark";
}
