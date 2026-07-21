import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("store navigation mega menu", () => {
  it("accepts catalog-built enterprise menu configs from the layout", () => {
    const nav = source("components/navigation/store-nav.tsx");
    const layout = source("app/(storefront)/layout.tsx");
    const shellChrome = source("components/layout/storefront-shell-chrome.tsx");
    const catalogNavigation = source("services/catalog-navigation.ts");

    expect(nav).toContain("enterpriseMenuConfigs?: EnterpriseMenuConfig[]");
    expect(nav).not.toContain("const enterpriseMenuConfigs: EnterpriseMenuConfig[]");
    expect(nav).not.toContain("productCutouts");
    expect(shellChrome).toContain("buildEnterpriseMenuConfigs(enterpriseMenu.products)");
    expect(layout).toContain("StorefrontShellHeaderChrome");
    expect(catalogNavigation).toContain("buildEnterpriseMenuConfigs");
    expect(catalogNavigation).toContain("filterProductsForCategorySlug");
    expect(catalogNavigation).toContain("MENU_COLUMN_LIMIT = 7");
    expect(catalogNavigation).toContain("productCount: products.length");
  });

  it("keeps the interaction accessible and performance-oriented", () => {
    const nav = source("components/navigation/store-nav.tsx");
    const mega = source("components/navigation/enterprise-mega-menu-panel.tsx");

    expect(nav).toContain('aria-haspopup={menu ? "true" : undefined}');
    expect(nav).toContain("aria-expanded={menu ? isMenuActive : undefined}");
    expect(nav).toContain("onMouseLeave={scheduleEnterpriseMenuClose}");
    expect(nav).toContain("EnterpriseMegaMenuPanel");
    expect(nav).toContain("MobileNavDrawer");
    expect(nav).toContain("ssr: false");
    expect(nav).toContain("setFeaturedByMenu");
    expect(nav).toContain("menus={megaMenus}");
    expect(nav).toContain("activeCategoryKey={activeCategoryKey}");
    expect(nav).toContain("onCategoryIntent={(categoryKey) => {");
    expect(nav).toContain('const menuId = menu ? "enterprise-mega-menu" : undefined');
    expect(nav).toContain("aria-controls={menuId}");
    expect(mega).toContain("menus: MegaMenuConfig[]");
    expect(mega).toContain("activeCategoryKey: string");
    expect(mega).toContain("onCategoryIntent: (categoryKey: string) => void");
    expect(mega).toContain("enterprise-mega-menu__categories");
    expect(mega).toContain("enterprise-mega-menu__products");
    expect(mega).toContain("enterprise-mega-menu__preview");
    expect(mega).toContain("MithronCardImage");
    expect(mega).toContain("MithronThumbImage");
    expect(mega).toContain("tabIndex={interactive ? undefined : -1}");
    expect(mega).toContain("onPointerEnter={() => {");
    expect(mega).toContain('variant="preview"');
    expect(mega).toContain("activeFeatureKey={feature.key}");
    expect(mega).toContain("enterprise-mega-menu__preview-cta");
    expect(mega).toContain("enterprise-mega-menu__view-all");
    expect(mega).toContain("View all {activeMenu.label}");
    expect(mega).not.toContain("columnTwo");
    expect(mega).toContain('is-active"');
  });

  it("uses the requested premium light overlay motion and geometry", () => {
    const globals = source("app/globals.css");

    expect(globals).toContain("--mega-menu-ease: cubic-bezier(0.16, 1, 0.3, 1)");
    expect(globals).toContain("--mega-menu-panel-width: min(1680px, calc(100vw - 48px))");
    expect(globals).toContain("--mega-menu-panel-height: 540px");
    expect(globals).toContain("height: var(--mega-menu-panel-height)");
    expect(globals).toContain("max-height: var(--mega-menu-panel-height)");
    expect(globals).toContain("left: 50%");
    expect(globals).toContain("transform: translate3d(-50%, -8px, 0) scale(0.992)");
    expect(globals).toContain("transform: translate3d(-50%, 0, 0) scale(1)");
    expect(globals).toContain(
      "grid-template-columns: minmax(220px, 0.24fr) minmax(0, 0.4fr) minmax(320px, 0.36fr)"
    );
    expect(globals).toContain("enterprise-mega-menu__categories");
    expect(globals).toContain("enterprise-mega-menu__products");
    expect(globals).toContain("enterprise-mega-menu__preview");
    expect(globals).toContain("enterprise-mega-menu__view-all");
    expect(globals).toContain("border-left: 1px solid rgba(17, 17, 17, 0.08)");
    expect(globals).toContain("min-height: 260px");
    expect(globals).toContain("min-height: 56px");
    expect(globals).toContain("font-size: 1.375rem");
    expect(globals).toContain("enterprise-feature-card__meta");
    expect(globals).toContain("opacity 220ms var(--mega-menu-ease)");
    expect(globals).toContain("transform 220ms var(--mega-menu-ease)");
    expect(globals).toContain("border-radius: 18px");
    expect(globals).toContain("background: #ffffff");
    expect(globals).toContain("0 20px 56px rgba(17, 17, 17, 0.1)");
    expect(globals).toContain("@media (max-width: 1023px)");
    expect(globals).toContain(".enterprise-mega-menu-shell");
    expect(globals).toContain("transition-duration: 1ms");
  });

  it("keeps preview copy clean without dumping product body html", () => {
    const mega = source("components/navigation/enterprise-mega-menu-panel.tsx");

    expect(mega).toContain('className="enterprise-feature-card__info"');
    expect(mega).toContain('className="enterprise-feature-card__meta"');
    expect(mega).toContain("{isPreview ? (");
    expect(mega).toContain('<EditorRenderedHtml html={card.body} className="enterprise-feature-card__description" />');
  });

  it("routes navigation labels to canonical category pages", () => {
    const navigation = source("config/navigation.ts");

    expect(navigation).toContain('{ label: "Global Products", href: "/category/global-products" }');
    expect(navigation).toContain('{ label: "Agri Drones", href: "/category/agri-drones" }');
    expect(navigation).not.toContain('href: "#"');
  });

  it("links search explore chips to category pages", () => {
    const searchOverlay = source("components/overlays/search-overlay.tsx");

    expect(searchOverlay).toContain("catalogCategoryDefinitions");
    expect(searchOverlay).toContain("Suggested categories");
    expect(searchOverlay).toContain("definition.href");
    expect(searchOverlay).not.toContain("AG10 Sprayer");
    expect(searchOverlay).not.toContain("/interest/");
  });
});
