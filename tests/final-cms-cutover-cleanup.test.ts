import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const forbiddenStatusLabel = ["PAR", "TIAL"].join("");
const oldDraftCollectionName = ["draft", "Testimonials"].join("");

describe("final CMS cutover and real-data cleanup", () => {
  it("keeps the homepage scoped to navigation, hero carousel, and one composite post-hero section", () => {
    const page = source("app/(storefront)/page.tsx");
    const homePageContent = source("sections/home/home-page-content.tsx");
    const heroCarousel = source("sections/home/hero-carousel.tsx");
    const homeComposite = source("sections/home/home-landing-composite.tsx");
    const compositeSection = source("sections/home/home-composite-section.tsx");
    const homeCompositeCss = `${source("sections/home/home-landing-composite.module.css")}\n${source("sections/home/home-shelf-shared.module.css")}`;
    const storeShell = source("components/layout/storefront-shell-chrome.tsx");
    const storeShellClient = source("components/layout/storefront-shell-streaming.tsx");
    const globals = source("app/globals.css");
    const cms = source("services/cms.ts");
    const cmsWorkspace = source("features/admin/cms/cms-visual-workspace.tsx");

    for (const removed of ["CmsHomeSection", "EcosystemExperience", "EcosystemShowcaseSection", "droneShowcaseSections", "CinematicHomeSequence", "ProductIconRail", "CinematicMediaRail", "CommunitySection", "InterestSection", "sectionRenderers", "HeroBannerExtension", "DroneWorldEcosystemPanel"]) {
      expect(page).not.toContain(removed);
    }

    const resolution = source("lib/home/homepage-resolution.ts");
    const belowHero = source("sections/home/home-below-hero.tsx");

    expect(homePageContent).toContain("HomeHeroSection");
    expect(homePageContent).toContain("HomeBelowHero");
    expect(homePageContent).toContain("getHomepageHeroBanners");
    expect(homePageContent).toContain("getHomepageBelowFoldData");
    expect(page).toContain("HomePageContent");
    expect(homePageContent).not.toContain("productReviews=");
    expect(belowHero).toContain("HomeLandingComposite");
    expect(belowHero).toContain("footer={cms.footer}");
    expect(belowHero).toContain("listFeaturedHomeReviews");
    expect(belowHero).toContain("getHomepageProducts");
    expect(page).not.toContain("ProductEcosystemShowcase");
    expect(page).not.toContain("PlatformIntelligenceChapter");
    expect(page).not.toContain("HomeProductShelves");
    expect(page).not.toContain("homeShelves");
    expect(page).not.toContain("@/sections/home/product-ecosystem-showcase");
    expect(page).not.toContain("@/sections/home/platform-intelligence-chapter");
    expect(page).not.toContain("@/sections/home/home-product-shelves");
    expect(page).not.toContain("PostHeroEcosystemSection");
    expect(page).not.toContain("@/sections/home/post-hero-ecosystem");
    expect(page).not.toContain("SolutionsWorldsSection");
    expect(page).not.toContain("@/sections/home/solutions-worlds");
    expect(page).not.toContain("buildEcosystemProductGroups");
    expect(page).not.toContain("@/features/storefront/home/ecosystem-experience");
    expect(page).not.toContain("@/features/storefront/home/cinematic-home-sequence");
    expect(page).not.toContain("getProductShellItems");
    expect(source("services/homepage-bundle.ts")).toContain("cms.home.heroBanners");
    expect(compositeSection).toContain('data-testid="home-landing-composite"');
    expect(compositeSection).toContain('data-home-composite-root="true"');
    expect(compositeSection).toContain("data-motion-state={motionState}");
    expect(compositeSection).toContain('data-motion-engine="static"');
    expect(source("lib/home/homepage-resolution.ts")).toContain('export type ProofState = "VERIFIED" | "FALLBACK"');
    expect(homeComposite).not.toContain(forbiddenStatusLabel);
    expect(homeComposite).not.toContain(oldDraftCollectionName);
    expect(homeComposite).not.toContain('data-testimonial-state="fallback"');
    expect(homeComposite).not.toContain("verifiedTestimonialsFromCms");
    expect(homeComposite).not.toContain("VERIFIED CMS");
    expect(resolution).toContain("homepageMediaFallbacks as localMedia");
    expect(resolution).toContain("No municipal deployment claims");
    expect(homeComposite).not.toMatch(/stars:\s*[1-5]|Rajan|Meera|James|customer says/i);
    expect(homeComposite).toContain("HomeClientTestimonialsSection");
    expect(homeComposite).toContain('data-testid="home-about-band"');
    expect(homeComposite).toContain('data-testid="home-about-footer"');
    expect(homeComposite).toContain("SiteFooter");
    expect(compositeSection).toContain("useReducedMotionPreference");
    expect(compositeSection).toContain('motionState = reducedMotion ? "reduced" : "static"');
    expect(homeComposite).not.toContain("HomeDroneModelScene");
    expect(homeComposite).not.toContain("enabled={!reducedMotion");
    expect(homeComposite).not.toContain("lineup-solutions");
    expect(homeComposite).not.toContain("draft-testimonials");
    expect(homeComposite).not.toContain("creative-three");
    expect(homeComposite).not.toContain("about-us");
    expect(homeCompositeCss).toContain(".productCard:hover .productImage");
    expect(homeCompositeCss).toContain("scale(1.024)");
    expect(homeCompositeCss).not.toMatch(/text-shadow|rotateX|rotateY|backdrop-filter:\s*blur\(20px\)|glow/i);
    expect(heroCarousel).toContain("data-cms-hero-empty-state");
    expect(existsSync(join(process.cwd(), "sections/home/post-hero-ecosystem.tsx"))).toBe(false);
    expect(existsSync(join(process.cwd(), "sections/home/post-hero-ecosystem.module.css"))).toBe(false);
    expect(existsSync(join(process.cwd(), "sections/home/solutions-worlds.tsx"))).toBe(false);
    expect(existsSync(join(process.cwd(), "sections/home/solutions-worlds.module.css"))).toBe(false);
    expect(existsSync(join(process.cwd(), "sections/home/ecosystem-experience.tsx"))).toBe(false);
    expect(existsSync(join(process.cwd(), "sections/home/ecosystem-product-data.ts"))).toBe(false);
    expect(existsSync(join(process.cwd(), "sections/home/product-ecosystem-showcase.tsx"))).toBe(false);
    expect(existsSync(join(process.cwd(), "sections/home/product-ecosystem-showcase-client.tsx"))).toBe(false);
    expect(existsSync(join(process.cwd(), "sections/home/product-ecosystem-showcase.module.css"))).toBe(false);
    expect(existsSync(join(process.cwd(), "sections/home/platform-intelligence-chapter.tsx"))).toBe(false);
    expect(existsSync(join(process.cwd(), "sections/home/platform-intelligence-chapter-client.tsx"))).toBe(false);
    expect(existsSync(join(process.cwd(), "sections/home/platform-intelligence-chapter.module.css"))).toBe(false);
    expect(existsSync(join(process.cwd(), "features/storefront/home"))).toBe(false);
    expect(existsSync(join(process.cwd(), "public/media/mithron/shell/default-section-pencil-art.svg"))).toBe(false);
    expect(existsSync(join(process.cwd(), "public/media/mithron/optical-ecosystem"))).toBe(false);
    expect(existsSync(join(process.cwd(), "public/media/mithron/platform-worlds"))).toBe(false);
    expect(storeShellClient).toContain("NAV_HERO_CAROUSEL_COMPOSITE");
    expect(storeShellClient).not.toContain("NAV_HERO_CAROUSEL_ONLY");
    expect(storeShellClient).not.toContain("NAV_HERO_CAROUSEL_ECOSYSTEM_PLATFORM_INTELLIGENCE");
    expect(storeShellClient).not.toContain("NAV_HERO_CAROUSEL_WITH_ECOSYSTEM_REVEAL");
    expect(storeShellClient).not.toContain("NAV_HERO_PRODUCT_ECOSYSTEM");
    expect(storeShellClient).not.toContain("NAV_HERO_CAROUSEL_WITH_POST_HERO_ECOSYSTEM");
    expect(storeShellClient).not.toContain("NAV_HERO_CAROUSEL_WITH_SHOWCASE");
    expect(storeShellClient).not.toContain("NAV_HERO_CAROUSEL_OPTICAL_ECOSYSTEM");
    expect(storeShellClient).not.toContain("NAV_HERO_CAROUSEL_ECOSYSTEM_EXPERIENCE");
    expect(storeShell).toContain("<SiteFooter content={shell.footer} />");
    expect(storeShellClient).toContain("isHome ? null : footerChrome");
    expect(globals).not.toContain("@import \"./storefront-showcase.css\"");
    expect(globals).not.toContain("hero-banner-extension");
    expect(globals).not.toContain("drone-world-panel");
    expect(globals).toContain(".hero-premium-field::before");
    expect(globals).toContain("content: none");
    expect(globals).not.toContain("rgba(248, 250, 251, 0.5)");
    expect(globals).not.toContain("rgba(248, 250, 251, 0.25)");
    expect(globals).toContain(".catalog-product-grid");
    expect(globals).toContain("align-items: start");
    expect(cms).not.toContain("from \"@/config/products\"");
    expect(cms).not.toContain("marketing.testimonials");
    expect(cms).not.toContain("mapHomepageSections");
    expect(cms).toContain("fetchFooterLeadSettings");
    expect(cms).toContain("mapInterestRows");
    expect(cmsWorkspace).toContain("data-cms-section-visibility-toggle");
    expect(cmsWorkspace).toContain("data-cms-drag-reorder");
    expect(cmsWorkspace).toContain("archiveCmsWorkspaceRecordFormAction");
    expect(cmsWorkspace).not.toContain("fallbackPages");
  });

  it("keeps dedicated users route while settings remains a redirect", () => {
    const usersPage = source("app/admin/users/page.tsx");
    const settingsPage = source("app/admin/settings/page.tsx");

    expect(usersPage).toContain("getUserGovernanceSnapshot");
    expect(usersPage).toContain("UserManagementPanel");
    expect(settingsPage).toContain('redirect("/admin")');

    const navConfig = source("components/platform/nav-config.ts");

    expect(navConfig).toContain('href: "/admin/users"');
    expect(navConfig).not.toContain('href: "/admin/settings"');
    expect(navConfig).not.toContain('href: "/admin/settings#users"');
  });

  it("keeps orders and product media operator-facing without raw internal storage or UUID forms", () => {
    const ordersPage = source("app/admin/orders/page.tsx");
    const ordersWorkspace = source("components/admin/admin-orders-workspace.tsx");
    const productsPage = source("app/admin/products/page.tsx");

    expect(ordersPage).toContain("AdminOrdersWorkspace");
    expect(ordersWorkspace).toContain("AdminOrderDetailPanel");
    expect(ordersWorkspace).toContain("AdminOrderActionsRail");
    expect(ordersPage).not.toContain('placeholder="uuid"');
    expect(ordersPage).not.toContain("Order item ID");
    expect(ordersPage).not.toContain("Product slug");

    expect(productsPage).toContain("data-product-create-media-fields");
    expect(productsPage).toContain("ProductMultiImageField");
    expect(productsPage).not.toContain("Storage buckets");
    expect(productsPage).not.toContain("storage_path");
    expect(productsPage).not.toContain("runtime fallback");
    expect(productsPage).not.toContain("mithron_assets");
  });
});

