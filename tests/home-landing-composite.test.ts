import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderAccentTitle } from "@/sections/home/home-client-testimonials-carousel";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

function homeShelfCss() {
  return source("sections/home/home-shelf-shared.module.css");
}

function homeCompositeCss() {
  return source("sections/home/home-landing-composite.module.css");
}

const forbiddenStatusLabel = ["PAR", "TIAL"].join("");
const oldDraftCollectionName = ["draft", "Testimonials"].join("");

describe("home landing composite contract", () => {
  it("renders the current hero followed by exactly one composite post-hero section", () => {
    const page = source("app/(storefront)/page.tsx");
    const homePageContent = source("sections/home/home-page-content.tsx");
    const belowHero = source("sections/home/home-below-hero.tsx");

    expect(homePageContent).toContain("HomeBelowHero");
    expect(homePageContent).toContain("HomeHeroSection");
    expect(page).toContain("HomePageContent");
    expect(page).not.toContain("dynamic(");
    expect(belowHero).toContain("listFeaturedHomeReviews");
    expect(belowHero).toContain("productReviews={homepageReviews}");
    expect(belowHero).toContain("footer={cms.footer}");
    expect(belowHero).toContain("homepageCms={homepageCms}");
    expect(belowHero).toContain("getHomepageProducts");
    expect(homePageContent).not.toContain("HomeProductShelves");
    expect(homePageContent).not.toContain("homeShelves");
  });

  it("defines the requested chapter order and proof states without fake verified testimonials", () => {
    const component = source("sections/home/home-landing-composite.tsx");
    const resolution = source("lib/home/homepage-resolution.ts");
    const compositeSection = source("sections/home/home-composite-section.tsx");

    expect(compositeSection).toContain('data-testid="home-landing-composite"');
    expect(compositeSection).toContain('data-home-composite-root="true"');
    expect(compositeSection).toContain("data-motion-state={motionState}");
    expect(compositeSection).toContain('data-motion-engine="static"');
    expect(resolution).toContain('export type ProofState = "VERIFIED" | "FALLBACK"');
    expect(component).not.toContain(forbiddenStatusLabel);
    expect(component).not.toContain(oldDraftCollectionName);
    expect(component).not.toContain('data-testimonial-state="fallback"');
    expect(component).not.toContain("verifiedTestimonialsFromCms");
    expect(component).not.toContain("VERIFIED CMS");
    expect(resolution).toContain("homepageMediaFallbacks as localMedia");
    expect(resolution).toContain("Representative mission gallery");
    expect(resolution).toContain("No municipal deployment claims");
    expect(component).not.toMatch(/stars?:\s*[1-5]/i);
    expect(component).not.toMatch(/Rajan|Meera|James|customer says/i);

    const chapterBlock = resolution.slice(
      resolution.indexOf("export const homeChapters"),
      resolution.indexOf("export const missionWorldConfigs")
    );
    const order = [
      "drone-world",
      "drone-care",
      "global-products",
      "agri-drones",
      "city-drones"
    ];
    let cursor = -1;
    for (const id of order) {
      const next = chapterBlock.indexOf(`id: "${id}"`);
      expect(next, `${id} should appear after the previous chapter`).toBeGreaterThan(cursor);
      cursor = next;
    }

    for (const removedId of ["lineup-solutions", "draft-testimonials", "creative-three", "about-us"]) {
      expect(chapterBlock).not.toContain(`id: "${removedId}"`);
      expect(component).not.toContain(`case "${removedId}"`);
    }
  });

  it("uses reduced-motion guards and restrained product hover selectors", () => {
    const component = source("sections/home/home-landing-composite.tsx");
    const compositeSection = source("sections/home/home-composite-section.tsx");
    const css = homeCompositeCss();
    const shelfCss = homeShelfCss();

    expect(component).not.toContain('import gsap from "gsap"');
    expect(component).not.toContain('import("gsap")');
    expect(component).not.toContain("ScrollTrigger.create");
    expect(compositeSection).toContain("useReducedMotionPreference");
    expect(compositeSection).toContain('motionState = reducedMotion ? "reduced" : "static"');

    expect(shelfCss).toContain(".productCard:hover .productImage");
    expect(css).toContain("scale(1.024)");
    expect(css).not.toMatch(/glow|text-shadow|backdrop-filter:\s*blur\(20px\)|rotateX|rotateY/i);
  });

  it("uses product shelves followed by distinct mission-world editorial sections", () => {
    const component = source("sections/home/home-landing-composite.tsx");
    const resolution = source("lib/home/homepage-resolution.ts");
    const shelfSection = source("sections/home/product-shelf-section.tsx");
    const miniCarousel = source("sections/home/home-mini-carousel.tsx");
    const miniCarouselLib = source("lib/home/mini-carousel.ts");
    const shelfCard = source("components/product/home-product-shelf-card.tsx");
    const css = homeCompositeCss();
    const shelfCss = homeShelfCss();
    const chapterBlock = resolution.slice(
      resolution.indexOf("export const homeChapters"),
      resolution.indexOf("export const missionWorldConfigs")
    );

    expect(component).toContain("resolveHomepageLandingState");
    expect(resolution).toContain("export type MissionWorldConfig");
    expect(component).toContain("export function AgriCommunityWorldSection");
    expect(shelfSection).toContain("export function ProductShelfSection");
    expect(chapterBlock).toContain('layoutKind: "ecosystem"');
    expect(chapterBlock).toContain('layoutKind: "care"');
    expect(chapterBlock).toContain('layoutKind: "catalog"');
    expect(chapterBlock).toContain('layoutKind: "agri-mission"');
    expect(chapterBlock).toContain('layoutKind: "city-mission"');
    expect(resolution).toContain("resolveShelfConfigs");
    expect(resolution).toContain("missionWorldConfigs");
    expect(shelfSection).toContain('data-testid="home-product-shelf-section"');
    expect(shelfSection).toContain('data-home-content-shell="true"');
    expect(component).toContain('data-home-content-shell="true"');
    expect(shelfSection).toContain('data-testid="home-product-shelf-hero"');
    expect(shelfSection).toMatch(/shelfHeroBackdrop[\s\S]{0,240}MithronShelfHeroImage/);
    expect(shelfSection).toContain('data-testid="home-product-shelf-grid"');
    expect(shelfSection).toContain("ProductShelfViewAllCard");
    const viewAllCardComponent = source("sections/home/product-shelf-view-all-card.tsx");
    expect(viewAllCardComponent).toContain('data-testid="home-product-view-all-card"');
    expect(viewAllCardComponent).toContain("viewAllStage");
    expect(viewAllCardComponent).toContain("resolveViewAllCardPresentation");
    expect(viewAllCardComponent).toContain("viewAllArrow");
    expect(viewAllCardComponent).toContain("imageSlug");
    expect(shelfSection).toContain("imageSlug={cardProducts[0]?.slug}");
    expect(component).not.toContain('data-testid="home-product-guide-card"');
    expect(component).not.toContain("styles.viewAllLink");
    expect(component).not.toContain("styles.shelfHeaderActions");
    expect(component).not.toContain("styles.guideCard");
    expect(shelfSection).not.toContain("{config.guideLabel}");
    expect(shelfSection).not.toContain("{config.guideTitle}");
    expect(shelfCard).toContain('data-testid="home-product-card"');
    expect(component).not.toContain('data-testid="home-shelf-prev"');
    expect(component).not.toContain('data-testid="home-shelf-next"');
    expect(component).toContain('testId="agri-community-world-section"');
    expect(component).toContain('"data-testid": "mission-world-tile"');
    expect(resolution).toContain('testId: "agri-community-world"');
    expect(resolution).toContain('testId: "city-drone-world"');
    expect(resolution).toContain('composition: "agri-field"');
    expect(resolution).toContain('composition: "city-urban"');
    expect(component).toContain('"data-tile-size": cardType');
    expect(component).toContain('"data-showcase-kind": "mission-image"');
    expect(component).toContain("export function AgriCommunityWorldSection");
    expect(component).toContain("export function CityDroneWorldSection");
    expect(component).toContain('testId="agri-community-world-section"');
    expect(component).toContain('testId="city-drone-world-section"');
    expect(component).not.toContain('data-media-kind={tile.mediaKind}');
    expect(component).toContain("renderMissionWorldTile");
    expect(component).toContain("resolveHomepageLandingState");
    expect(component).not.toContain("<Link href={config.href} className={styles.missionWorldLink}>");
    const shelfResolution = source("lib/home/shelf-product-resolution.ts");
    expect(shelfResolution).toContain("function pickFeatureProduct");
    expect(shelfSection).toContain('href={config.heroCtaHref}');
    expect(shelfResolution).toContain("function productShelfSearchText");
    expect(shelfResolution).toContain("featurePriority");
    expect(shelfResolution).toContain("featureExclude");
    expect(shelfCard).toContain('href={`/product/${product.slug}`}');
    expect(shelfSection).toContain("shelfProducts.slice(0, 4)");
    expect(miniCarousel).toContain('data-testid="home-mini-carousel"');
    expect(miniCarousel).toContain('data-carousel-kind="product"');
    expect(miniCarousel).toContain('data-testid="home-mini-carousel-item"');
    expect(component).not.toContain("Mithron mission stack");
    expect(component).not.toContain("Aircraft, spares, and field support in one path.");
    expect(component).toContain("resolveHomeMiniCarouselItems");
    expect(miniCarouselLib).toContain("miniCarouselProductPriority");
    expect(miniCarouselLib).toContain("itemKey:");
    expect(miniCarousel).toContain("key={item.itemKey}");
    expect(miniCarousel).not.toContain("key={item.label}");
    expect(miniCarouselLib).toContain('href: `/product/${product.slug}`');
    expect(component).not.toContain("miniCarouselConfigs");

    expect(shelfCss).toContain(".productShelfSection");
    expect(css).toContain(".promoImageBand");
    expect(css).toContain(".promoImageFrame");
    expect(css).toContain(".promoImageEyebrow");
    expect(css).toContain(".promoImageCard");
    expect(css).toContain("filter: none");
    expect(css).toContain("width: min(100%, var(--ds-container-wide, 1740px))");
    expect(css).toContain("border-radius: 8px");
    expect(css).not.toContain(".promoImageCopy");
    expect(shelfCss).toContain(".productShelfHeader");
    expect(shelfCss).toContain(".productShelfHero");
    expect(shelfCss).toContain(".productShelfGrid");
    expect(shelfCss).toContain("repeat(4, minmax(0, var(--shelf-product-col");
    expect(shelfCss).toContain("var(--shelf-view-all-col");
    expect(shelfCss).toContain("var(--shelf-row-gap");
    expect(shelfCss).toContain("gap: var(--shelf-row-gap");
    expect(css).not.toContain('[data-testid="home-product-view-all-card"]');
    const viewAllCardCss = readFileSync(join(process.cwd(), "sections/home/product-shelf-view-all-card.module.css"), "utf8");
    expect(viewAllCardCss).toContain(".viewAllCard");
    expect(viewAllCardCss).toContain(".viewAllStage");
    expect(viewAllCardCss).toContain(".viewAllArrow");
    expect(viewAllCardCss).toContain("radial-gradient(circle at 50% 50%");
    expect(viewAllCardCss).toContain("aspect-ratio: var(--shelf-card-aspect-ratio");
    expect(viewAllCardCss).not.toContain("mask-image");
    expect(viewAllCardCss).not.toContain(".viewAllImageFrame::after");
    expect(viewAllCardCss).not.toContain("rgba(31, 107, 70");
    expect(viewAllCardCss).not.toContain("--view-all-wash");
    expect(viewAllCardCss).not.toContain(".viewAllStage::before");
    expect(shelfSection).toContain("heroSrc={chapter.media.src}");
    expect(shelfCss).toContain('.productShelfSection[data-shelf-tone="world"]');
    expect(shelfCss).toContain("-webkit-line-clamp: 2");
    const productHeroCss = shelfCss.slice(shelfCss.indexOf(".productShelfHero"), shelfCss.indexOf(".shelfHeroBackdrop"));
    expect(productHeroCss).not.toContain("rgba(15, 23, 42, 0.78)");
    expect(productHeroCss).not.toContain("rgba(15, 23, 42, 0.56)");
    expect(shelfCss).toContain(".productActionDot");
    const missionStart = css.indexOf(".missionWorldSection {", css.indexOf(".shelfFallback p"));
    const missionCss = css.slice(missionStart, css.indexOf("@media (max-width: 980px)"));
    expect(css).toContain(".missionWorldSection");
    expect(css).toContain(".missionWorldGrid");
    expect(css).toContain(".missionWorldTile");
    expect(css).toContain('[data-composition="agri-field"]');
    expect(css).toContain('[data-composition="city-urban"]');
    expect(missionCss).toContain("width: min(100%, var(--ds-container-wide, 1740px))");
    expect(missionCss).not.toContain("width: min(100%, 1440px)");
    expect(missionCss).toContain("min-height: clamp(760px, 88svh, 980px)");
    expect(missionCss).toContain("padding: clamp(calc(88px * var(--storefront-section-space-scale, 1)), 9vh, calc(128px * var(--storefront-section-space-scale, 1))) 0 clamp(calc(96px * var(--storefront-section-space-scale, 1)), 10vh, calc(140px * var(--storefront-section-space-scale, 1)))");
    expect(missionCss).toContain("padding: 0 clamp(24px, 4vw, 72px)");
    expect(missionCss).toContain("align-items: end");
    expect(shelfCss).toContain(".productShelfSection+.missionWorldSection");
    expect(shelfCss).toContain("padding-top: clamp(48px, 5vh, 72px)");
    expect(shelfCss).not.toContain(".productShelfSection+.missionWorldSection {\n  padding-top: clamp(4px, 0.9vw, 12px)");
    expect(css).toContain("grid-template-areas:");
    expect(css).toContain('"mission-left mission-hero mission-hero mission-right"');
    expect(css).toContain('"mission-left mission-small-a mission-small-b mission-right"');
    expect(css).toContain("gap: clamp(20px, 1.7vw, 28px)");
    expect(css).toContain("clamp(300px, 33vh, 360px)");
    expect(css).toContain("clamp(220px, 24vh, 270px)");
    expect(css).toContain(".missionWorldSection[data-composition=\"agri-field\"] .missionWorldTile:nth-child(1)");
    expect(css).toContain(".missionWorldSection[data-composition=\"city-urban\"] .missionWorldTile:nth-child(1)");
    expect(css).toContain("grid-area: mission-left");
    expect(css).toContain(".missionWorldSection[data-composition=\"agri-field\"] .missionWorldTile:nth-child(2)");
    expect(css).toContain(".missionWorldSection[data-composition=\"city-urban\"] .missionWorldTile:nth-child(2)");
    expect(css).toContain("grid-area: mission-hero");
    expect(css).toContain(".missionWorldSection[data-composition=\"agri-field\"] .missionWorldTile:nth-child(3)");
    expect(css).toContain(".missionWorldSection[data-composition=\"city-urban\"] .missionWorldTile:nth-child(3)");
    expect(css).toContain("grid-area: mission-right");
    expect(css).toContain(".missionWorldSection[data-composition=\"agri-field\"] .missionWorldTile:nth-child(4)");
    expect(css).toContain(".missionWorldSection[data-composition=\"city-urban\"] .missionWorldTile:nth-child(4)");
    expect(css).toContain("grid-area: mission-small-a");
    expect(css).toContain(".missionWorldSection[data-composition=\"agri-field\"] .missionWorldTile:nth-child(5)");
    expect(css).toContain(".missionWorldSection[data-composition=\"city-urban\"] .missionWorldTile:nth-child(5)");
    expect(css).toContain("grid-area: mission-small-b");
    expect(css).toContain(".missionWorldTileHero");
    expect(css).not.toContain(".missionTilePlay");
    expect(css).not.toContain(".missionWorldLink");
    expect(css).toContain("scale(1.024)");
    expect(missionCss).toContain("border: 0");
    expect(missionCss).toContain("box-shadow: none");
    expect(missionCss).not.toMatch(/catalog|productCard|productShelf|viewAllCard/);
  });

  it("renders Agri and City mission worlds as linked editorial bento sections without GSAP reveal hooks", () => {
    const component = source("sections/home/home-landing-composite.tsx");
    const resolution = source("lib/home/homepage-resolution.ts");
    const agriSection = component.slice(
      component.indexOf("export function AgriCommunityWorldSection"),
      component.indexOf("export function CityDroneWorldSection")
    );
    const citySection = component.slice(
      component.indexOf("export function CityDroneWorldSection"),
      component.lastIndexOf("}")
    );
    const missionTypes = resolution.slice(
      resolution.indexOf("export type MissionWorldTile"),
      resolution.indexOf("export const AGRONE_REGISTRATION_LINKS")
    );
    const agriMissionConfig = resolution.slice(
      resolution.indexOf('"agri-drones":'),
      resolution.indexOf('"city-drones":')
    );
    const cityMissionConfig = resolution.slice(
      resolution.indexOf('"city-drones":'),
      resolution.indexOf("};", resolution.indexOf('"city-drones":')) + 2
    );

    expect(missionTypes).toMatch(/\bhref\?:/);
    expect(missionTypes).not.toMatch(/\bcta:/);
    expect(missionTypes).not.toMatch(/\bmediaKind:/);
    expect(agriMissionConfig).toContain("AGRONE_REGISTRATION_LINKS.droneOwner");
    expect(agriMissionConfig).toContain("AGRONE_REGISTRATION_LINKS.pilot");
    expect(agriMissionConfig).toContain("AGRONE_REGISTRATION_LINKS.smartFarmer");
    expect(cityMissionConfig).not.toMatch(/\bhref:/);
    expect(agriMissionConfig).not.toMatch(/\bcta:/);
    expect(cityMissionConfig).not.toMatch(/\bcta:/);
    expect(agriMissionConfig).not.toMatch(/\bmediaKind:/);
    expect(cityMissionConfig).not.toMatch(/\bmediaKind:/);
    expect(agriSection).toContain("MissionWorldBentoSection");
    expect(citySection).toContain("MissionWorldBentoSection");
    expect(component).toContain('"data-showcase-kind": "mission-image"');
    expect(component).toContain("renderMissionWorldTile");
    expect(component).toContain('data-showcase-link="false"');
    expect(resolution).toContain("https://drone.mithronsmart.com/selectlogin");
    expect(resolution).toContain('buildAgroneSelectLoginHref("Pilot")');
    expect(resolution).toContain('buildAgroneSelectLoginHref("Drone Owner")');
    expect(resolution).toContain('buildAgroneSelectLoginHref("FPO / Farmer")');
    expect(agriSection).not.toContain('href={tile.href || chapter.href || "/agriculture"}');
    expect(citySection).not.toContain('href={tile.href || chapter.href || "/surveillance"}');
    expect(component).not.toContain("<Play");
  });

  it("intentionally renders Drone World, Drone Care, and Global Products as catalog-backed shelves", () => {
    const component = source("sections/home/home-landing-composite.tsx");
    const resolution = source("lib/home/homepage-resolution.ts");
    const shelfSection = source("sections/home/product-shelf-section.tsx");
    const shelfResolution = source("lib/home/shelf-product-resolution.ts");

    for (const shelfId of ["drone-world", "drone-care", "global-products"]) {
      expect(resolution).toContain(`id: "${shelfId}"`);
    }
    expect(shelfResolution).toContain('testId: "drone-world-shelf"');
    expect(shelfResolution).toContain('testId: "drone-care-shelf"');
    expect(shelfResolution).toContain('testId: "global-products-shelf"');
    expect(component).not.toContain('testId: "lineup-solutions-shelf"');
    expect(shelfResolution).toContain('featurePriority: ["drone", "uav", "kisan", "sprayer", "seed spreader"]');
    expect(shelfResolution).toContain('featureExclude: ["controller", "flight controller", "propeller", "battery", "cable", "connector", "sensor", "motor", "frame", "hpc"]');
    expect(resolution).toContain("resolveShelfConfigs");
    expect(shelfSection).toContain("pickShelfProducts");
    expect(shelfResolution).toContain('tone: "world"');
    expect(shelfResolution).toContain('tone: "care"');
    expect(shelfResolution).toContain('tone: "global"');
    expect(shelfResolution).toContain("isGlobalProductsCategory");
    expect(shelfResolution).toContain("isDroneWorldCategory");
    expect(shelfResolution).toContain("isDroneCareShelfProduct");
    expect(shelfResolution).toContain('config.tone === "global"');
    expect(resolution).toContain("Drone World");
    expect(resolution).toContain("Drone Care");
    expect(resolution).toContain("Global Product");
    expect(component).not.toContain("Product lineup");
    expect(shelfSection).toContain("shelfHeroEyebrow");
    expect(shelfSection).toContain("shelfHeroHeading");
    expect(shelfSection).toContain("{config.title}");
    expect(shelfSection).toContain("shelfHeroBody");
    expect(shelfSection).toContain("shelfHeroCta");
    const agriMissionConfig = resolution.slice(
      resolution.indexOf('"agri-drones":'),
      resolution.indexOf('"city-drones":')
    );
    const cityMissionConfig = resolution.slice(
      resolution.indexOf('"city-drones":'),
      resolution.indexOf("};", resolution.indexOf('"city-drones":')) + 2
    );
    expect(agriMissionConfig.match(/label: "/g) ?? []).toHaveLength(5);
    expect(cityMissionConfig.match(/label: "/g) ?? []).toHaveLength(5);
    expect(resolution).toContain("Pilot Registration");
    expect(resolution).toContain("Drone owner registration");
    expect(resolution).toContain("Farmer & FPO registration");
    expect(resolution).toContain("Drones on EMI");
    expect(resolution).toContain("AGRONE booking");
    expect(component).toContain("formatMissionHeadline(config.title)");
    expect(resolution).toContain("localMedia.agroneDroneOwnerRegistration");
    expect(resolution).toContain("localMedia.agronePilotRegistration");
    expect(resolution).toContain("localMedia.agroneFarmerDroneBooking");
    expect(resolution).toContain("localMedia.agroneSmartFarmerRegistration");
    expect(resolution).toContain("localMedia.agroneAgriDroneLoanEmi");
    expect(component).not.toContain("Precision Spraying");
    expect(component).not.toContain("Field Mapping Pass");
    expect(component).not.toContain("Crop Health Review");
    expect(component).not.toContain("Plantation Monitoring");
    expect(component).not.toContain("Irrigation Analysis");
    expect(resolution).toContain("Drone Rental App");
    expect(resolution).toContain("Dronelancer Model");
    expect(resolution).toContain("FranchiseCare Center");
    expect(resolution).toContain("Drone Academic");
    expect(resolution).toContain("Technician Network");
    expect(resolution).toContain("localMedia.cityTrafficAnalytics");
    expect(resolution).toContain("localMedia.citySmartMonitoring");
    expect(resolution).toContain("localMedia.cityEmergencyResponse");
    expect(resolution).toContain("localMedia.cityInfrastructureInspection");
    expect(resolution).toContain("localMedia.cityCrowdMonitoring");
    expect(component).not.toContain("Yield Monitoring");
    expect(component).not.toContain("RTK Survey Operations");
    expect(component).not.toContain("Smart Agriculture Insights");
    expect(component).not.toContain("Utility Inspection");
    expect(component).not.toContain("Urban Mapping");
    expect(component).not.toContain("Construction Survey");
    expect(component).not.toContain("Smart-City Monitoring");
    expect(component).not.toContain("Delivery Operations");
    expect(component).not.toContain("Large-Scale Farm Ops");
    expect(component).not.toContain("Representative agriculture mission gallery");
  });

  it("auto-advances hero slides with hover pause and reduced-motion guard", () => {
    const hero = source("sections/home/hero-carousel.tsx");

    expect(hero).toContain("function resolveHeroCarouselSlides");
    expect(hero).toContain("goToSlide");
    expect(hero).toContain("HERO_ADVANCE_MS");
    expect(hero).toContain("setInterval");
    expect(hero).toContain('document.visibilityState !== "visible"');
    expect(hero).toContain("setIsHovered(true)");
  });

  it("defaults the reduced-motion hook to motion-enabled SSR before reading browser prefs", () => {
    const hook = source("hooks/use-reduced-motion.ts");

    expect(hook).toContain("useSyncExternalStore");
    expect(hook).toContain("const getServerSnapshot = () => false");
    expect(hook).toContain('window.matchMedia("(prefers-reduced-motion: reduce)").matches');
  });

  it("keeps mission galleries truthful while removing all later story chapters", () => {
    const component = source("sections/home/home-landing-composite.tsx");
    const resolution = source("lib/home/homepage-resolution.ts");
    const chapterBlock = resolution.slice(
      resolution.indexOf("export const homeChapters"),
      resolution.indexOf("export const missionWorldConfigs")
    );

    expect(component).not.toContain("HomeDroneModelScene");
    expect(component).not.toContain("dynamic(");
    expect(component).not.toContain('modelUrl="/models/mithron-drone-showcase.glb"');
    expect(component).not.toContain('data-testid="home-three-cinematic-section"');
    expect(component).toContain("HomeClientTestimonialsSection");
    expect(component).toContain("pickHomeTestimonialItems");
    expect(component).toContain("ProductPageReview");
    expect(component).not.toContain('data-testid="home-about-band"');
    expect(component).toContain('data-testid="home-about-footer"');
    expect(component).toContain("SiteFooter");
    expect(component).toContain("HomeRelatedArticlesSection");
    expect(component).not.toContain("HomeAboutUsBand");
    expect(component).toContain("relatedArticles");
    expect(component).toContain("pressCoverage");
    expect(component).toContain("customItems={cmsV2.relatedArticles.enabled");
    expect(component.lastIndexOf("<HomeRelatedArticlesSection")).toBeGreaterThan(
      component.lastIndexOf("<HomeClientTestimonialsSection")
    );
    expect(component).not.toContain("representativeHomeReviewTemplates");
    expect(component).toContain("header={cms.testimonials}");
    expect(component).toContain("homepageCms");
    expect(component).not.toContain("lineup-solutions");
    expect(component).not.toContain("draft-testimonials");
    expect(component).not.toContain("creative-three");
    expect(component).not.toContain("about-us");
    expect(chapterBlock).toContain('id: "agri-drones"');
    expect(chapterBlock).toContain('id: "city-drones"');
    expect(component).not.toContain("buildHomeProductReviewFallbacks");
    expect(component).not.toMatch(/municipal contract|performance metric|star rating/i);
    expect(existsSync(join(process.cwd(), "public/models/mithron-drone-showcase.glb"))).toBe(false);
  });

  it("renders the linen testimonials carousel with product images and accent headline", () => {
    const section = source("sections/home/home-client-testimonials-section.tsx");
    const sectionStyles = source("sections/home/home-client-testimonials-section.module.css");
    const carousel = source("sections/home/home-client-testimonials-carousel.tsx");
    const card = source("components/editorial/testimonial-carousel-card.tsx");
    const cardStyles = source("components/editorial/testimonial-carousel-card.module.css");
    const hook = source("hooks/use-css-marquee.ts");

    expect(section).toContain('data-testid="home-client-testimonials"');
    expect(section).toContain("pickHomeTestimonialItems");
    expect(section).toContain("productHref");
    expect(carousel).toContain("useCssMarquee");
    expect(carousel).toContain("marqueeEnabled");
    expect(carousel).toContain("marqueeReady");
    expect(carousel).toContain("loopItems");
    expect(carousel).not.toContain("useScrollCarousel");
    expect(carousel).not.toContain("useCarouselSwipe");
    expect(carousel).not.toContain("ChevronLeft");
    expect(carousel).not.toContain("ChevronRight");
    expect(carousel).not.toContain("pagination");
    expect(carousel).toContain("renderAccentTitle");
    expect(carousel).toContain("HorizontalScrollTouchRail");
    expect(carousel).toContain("marqueeTrack");
    expect(carousel).toContain("carouselViewport");
    expect(card).toContain("MithronCardImage");
    expect(card).toContain("productHref");
    expect(card).toContain('from "next/link"');
    expect(card).toContain("View product");
    expect(card).not.toContain("avatarUrl");
    expect(cardStyles).toContain(".productThumb");
    expect(cardStyles).toContain(".viewProduct");
    expect(cardStyles).toContain("-webkit-line-clamp: 5");
    expect(sectionStyles).toContain("var(--brand-accent, #1f6b46)");
    expect(sectionStyles).toContain("--brand-accent");
    expect(sectionStyles).not.toContain("#4f6ef7");
    expect(sectionStyles).toContain("linear-gradient(165deg, #f6f9f7 0%, #e9f2ec 100%)");
    expect(sectionStyles).toContain("--testimonial-heading: #0f2a1c");
    expect(sectionStyles).toContain("scroll-snap-type: x mandatory");
    expect(sectionStyles).toContain("scroll-behavior: smooth");
    expect(sectionStyles).toContain("calc((100% - (var(--testimonial-gap) * 2)) / 3.15)");
    expect(sectionStyles).toContain("@keyframes testimonialMarquee");
    expect(sectionStyles).toContain(".marqueeTrack");
    expect(sectionStyles).toContain("translate3d(-50%, 0, 0)");
    expect(hook).toContain("measureMarqueeLoopDistance");
    expect(hook).toContain("--marquee-duration");
  });

  it("splits accent phrases in the testimonials headline", () => {
    expect(renderAccentTitle("Customer Testimonial", "Testimonial")).toEqual({
      before: "Customer ",
      accent: "Testimonial",
      after: ""
    });
  });
});
