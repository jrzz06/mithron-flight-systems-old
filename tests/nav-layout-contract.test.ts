import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("storefront nav layout contract", () => {
  const globals = source("app/globals.css");
  const density = source("app/storefront-density.css");
  const hook = source("hooks/use-adaptive-navbar-tone.ts");
  const shell = source("components/layout/storefront-shell-streaming.tsx");

  it("defines nav height primitives and derives offset from them", () => {
    expect(globals).toContain("--store-topbar-height: 34px");
    expect(globals).toContain("--store-nav-bar-height: 3.5rem");
    expect(globals).toContain("--store-nav-bar-height-md: 58px");
    expect(globals).toContain("--store-nav-offset: var(--store-nav-bar-height)");
    expect(globals).toContain(
      "--store-nav-offset: calc(var(--store-topbar-height) + var(--store-nav-bar-height))"
    );
    expect(globals).toContain(
      "--store-nav-offset: calc(var(--store-topbar-height) + var(--store-nav-bar-height-md))"
    );
    expect(globals).not.toContain("--store-nav-offset: 100px");
    expect(globals).not.toContain("--store-nav-offset: 104px");
  });

  it("offsets catalog hero by topbar only with no underlap spacer", () => {
    expect(globals).toMatch(
      /\.catalog-hero-section--showcase\s*{[^}]*--catalog-hero-top-spacer:\s*0px/s
    );
    expect(globals).not.toMatch(/\.catalog-hero-section--showcase \.catalog-hero-immersive\s*{[^}]*margin-top:\s*calc\(-1/s);
    expect(globals).not.toMatch(/--catalog-hero-top-spacer:\s*clamp\(/);
  });

  it("keeps navigation in normal document flow on all storefront pages", () => {
    expect(globals).toMatch(/\.TOP_NAVBAR\.adaptive-navbar\s*{[^}]*position:\s*relative/s);
    expect(globals).not.toMatch(
      /\.storefront-root\[data-nav-chrome="flush"\]\s+\.TOP_NAVBAR\.adaptive-navbar:not\(\[data-nav-variant="login"\]\)\s*{\s*position:\s*fixed/s
    );
    expect(globals).not.toMatch(
      /\.storefront-root\[data-nav-chrome="solid"\]\s+\.TOP_NAVBAR\.adaptive-navbar:not\(\[data-nav-variant="login"\]\)\s*{\s*position:\s*fixed/s
    );
    expect(shell).not.toContain("store-main-offset");
    expect(globals).not.toMatch(
      /\.storefront-root\[data-nav-chrome="flush"\] #g-main\s*{[^}]*padding-top/s
    );
  });

  it("anchors enterprise mega menus below the nav stack", () => {
    expect(globals).toMatch(/\.enterprise-mega-menu-shell\s*{[^}]*top:\s*100%/s);
    expect(globals).toMatch(/\.enterprise-mega-menu-shell\s*{[^}]*padding-top:\s*10px/s);
    expect(globals).not.toMatch(/\.enterprise-mega-menu-shell\s*{[^}]*top:\s*var\(--store-nav-offset/s);
  });

  it("overlays a fully transparent secondary nav on flush hero pages", () => {
    expect(globals).toMatch(
      /\.storefront-root\[data-nav-chrome="flush"\][\s\S]*\.adaptive-navbar__bar\s*{[^}]*position:\s*absolute/s
    );
    expect(globals).toMatch(
      /\.storefront-root\[data-nav-chrome="flush"\][\s\S]*\.adaptive-navbar__bar\s*{[^}]*background:\s*transparent/s
    );
    expect(globals).toMatch(
      /\.storefront-root\[data-nav-chrome="flush"\][\s\S]*\.adaptive-navbar__bar\s*{[^}]*border-bottom:\s*none/s
    );
    expect(globals).toMatch(
      /\.storefront-root\[data-nav-chrome="flush"\][\s\S]*\.adaptive-navbar__bar\s*{[^}]*top:\s*100%/s
    );
  });

  it("preserves adaptive ink on flush hero mobile pages", () => {
    expect(hook).toContain("resolveNavbarTone");
    expect(hook).toContain("useLayoutEffect");
    expect(hook).toContain("applyNavbarInkToDocument");
    expect(hook).toContain("NAVBAR_INK_SURFACE_SELECTOR");
    expect(hook).toContain("rootMutationObserver");
    expect(hook).toContain("childList: true");
    expect(hook).toContain("[pathname, initialTone]");
    expect(hook).toContain("resolveNavbarChromeMode");
    expect(globals).toContain('html[data-nav-ink="light"]');
    expect(globals).toContain("data-nav-ink-hydrated");
    expect(globals).toContain('data-nav-chrome="flush"');
    expect(globals).toContain('data-nav-chrome="solid"');
    expect(shell).toContain("data-nav-chrome={navChrome}");
  });

  it("includes safe-area inset in mobile nav offset", () => {
    expect(globals).toContain(
      "--store-nav-offset: calc(var(--store-nav-bar-height) + env(safe-area-inset-top, 0px))"
    );
    expect(globals).toContain(
      "--store-nav-offset: calc(var(--store-topbar-height) + var(--store-nav-bar-height) + env(safe-area-inset-top, 0px))"
    );
  });

  it("scales topbar height and recomputes offset in storefront density", () => {
    expect(density).toContain("--store-topbar-height: calc(34px * var(--storefront-space-scale))");
    expect(density).toContain("--store-nav-bar-height: calc(56px * var(--storefront-space-scale))");
    expect(density).toContain(
      "--store-nav-offset: calc(var(--store-topbar-height) + var(--store-nav-bar-height-md))"
    );
    expect(density).not.toContain("--store-nav-offset: calc(104px * var(--storefront-space-scale))");
  });

  it("uses viewport pixel breakpoints for a two-tier storefront nav", () => {
    const storeNav = source("components/navigation/store-nav.tsx");

    expect(globals).toContain("--nav-breakpoint-desktop: 1280px");
    expect(globals).toMatch(/@media \(min-width: 1280px\)[\s\S]*\.nav-desktop-links\s*{\s*display:\s*flex/s);
    expect(globals).toMatch(/@media \(max-width: 1279px\)[\s\S]*\.nav-hamburger\s*{\s*display:\s*flex/s);
    expect(globals).not.toContain("@container nav");
    expect(globals).not.toContain(".nav-more-menu");
    expect(globals).not.toMatch(/\.adaptive-navbar__nav-cluster\s*\{[^}]*container-type/s);
    expect(storeNav).not.toContain("NavMoreMenu");
    expect(storeNav).not.toContain("NAV_PRIMARY_COUNT");
    expect(storeNav).toContain("NAV_DESKTOP_PREFETCH_MIN_WIDTH = 1280");
  });

  it("wires pathname-keyed store nav remount for chrome resets", () => {
    const storeNavAnchor = source("components/navigation/store-nav-with-anchor.tsx");
    expect(storeNavAnchor).toContain("usePathname");
    expect(storeNavAnchor).toContain("key={pathname}");
  });
});
