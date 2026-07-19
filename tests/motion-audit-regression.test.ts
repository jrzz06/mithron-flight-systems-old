import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("storefront motion audit regressions", () => {
  it("keeps the homepage composite static without scroll-scrubbed motion", () => {
    const component = source("sections/home/home-landing-composite.tsx");
    const compositeSection = source("sections/home/home-composite-section.tsx");

    expect(component).not.toContain("ScrollTrigger.create");
    expect(component).not.toContain("scrub: true");
    expect(component).not.toContain("onUpdate: (self)");
    expect(component).not.toContain("--home-composite-progress");
    expect(compositeSection).toContain('data-motion-engine="static"');
    expect(component).not.toContain("scheduleCompositeMotion");
    expect(component).not.toContain("requestIdleCallback");
    expect(component).not.toContain("cancelScheduledMotion?.()");
    expect(component).not.toContain('window.addEventListener("scroll"');
    expect(component).not.toContain("requestAnimationFrame(update)");
  });

  it("keeps adaptive navbar tone resolution attribute-driven under scroll", () => {
    const hook = source("hooks/use-adaptive-navbar-tone.ts");
    const resolver = source("lib/navbar-ink-resolver.ts");
    const sampling = source("lib/navbar-ink-sampling.ts");

    expect(hook).toContain('addEventListener("scroll", onScroll, { passive: true })');
    expect(hook).toContain("MIN_CHECK_INTERVAL_MS");
    expect(hook).toContain("requestAnimationFrame");
    expect(hook).toContain('attributeFilter: ["data-navbar-ink", "data-hero-slide-state"]');
    expect(hook).not.toContain("document.elementsFromPoint");
    expect(hook).not.toContain("import type { NavbarInkTone } from \"@/lib/navbar-ink-sampling\"");
    expect(hook).not.toContain("Array.from(document.images)");
    expect(hook).toContain("rootMutationObserver");
    expect(hook).toContain("childList: true");
    expect(resolver).toContain("resolveActiveSurfaceNavbarTone");
    expect(resolver).toContain("navbarOverlapsSurface");
    expect(resolver).toContain("getBootstrapNavbarInk");
    const registry = source("config/navbar-ink-registry.ts");
    expect(registry).toContain("homepageSlideNavbarInk");
    expect(registry).toContain("categoryPathNavbarInk");
    expect(sampling).toContain("showcase.navbarInk ?? inkFromHexColor(dominantColor)");
    expect(sampling).toContain("inkFromLuminanceSamples");
    expect(sampling).toContain("getNavbarSampleXs");
  });

  it("uses native browser scrolling without Lenis RAF loops", () => {
    const layout = source("app/(storefront)/layout.tsx");
    const component = source("sections/home/home-landing-composite.tsx");
    const globals = source("app/globals.css");

    expect(layout).not.toContain("LenisProvider");
    expect(layout).not.toContain("lenis-provider");
    expect(component).not.toContain("mithron:ensure-lenis");
    expect(component).not.toContain("mithron:lenis-ready");
    expect(globals).toMatch(/@media \(prefers-reduced-motion: no-preference\)[\s\S]*html\s*{[^}]*scroll-behavior:\s*smooth/s);
    expect(globals).not.toContain("html.lenis");
    expect(globals).not.toContain("new Lenis");
  });

  it("removes non-scroll-scrubbed ambient homepage motion", () => {
    const globals = source("app/globals.css");
    const component = source("sections/home/home-landing-composite.tsx");

    expect(globals).not.toMatch(/\.home-page-canvas::before\s*{[^}]*animation:\s*auroraFlow/s);
    expect(globals).not.toMatch(/@keyframes\s+auroraFlow/);
    expect(component).not.toContain("setInterval");
    expect(component).not.toContain("autoplay");
    expect(component).not.toContain("data-atmosphere-system");
  });

  it("keeps product card hover motion restrained to product media", () => {
    const cardCss = source("components/cards/product-hover-card.module.css");
    const globals = source("app/globals.css");
    const compositeCss = `${source("sections/home/home-landing-composite.module.css")}\n${source("sections/home/home-shelf-shared.module.css")}`;
    const component = source("components/cards/product-hover-card.tsx");
    const button = source("components/ui/button.tsx");
    const badge = source("components/admin/orders/order-status-badge.tsx");

    expect(cardCss).not.toMatch(/\.card:hover\s*{[^}]*transform:/s);
    expect(cardCss).not.toMatch(/backdrop-filter:\s*blur\(20px\)/);
    expect(cardCss).not.toContain("scale(1.08)");
    expect(cardCss).not.toContain("translateY(-12px)");
    expect(globals).not.toContain("transform: translate3d(0, -12px, 0) scale(1.015)");
    expect(globals).not.toContain("transform: translateY(-3px) scale(1.03)");
    expect(globals).not.toMatch(/backdrop-filter:\s*blur\(20px\)/);
    expect(component).not.toContain("backdrop-blur-[20px]");
    expect(button).not.toContain("backdrop-blur-[20px]");
    expect(button).not.toContain("backdrop-blur-xl");
    expect(button).not.toContain("hover:-translate-y");
    expect(button).not.toContain("hover:scale");
    expect(badge).not.toContain("backdrop-blur-[20px]");
    expect(cardCss).toMatch(/\.card:hover\s+\.imageFrame\s*{[^}]*scale\(1\.024\)/s);
    expect(globals).toMatch(/\.catalog-page-shell\s+\.premium-product-card:is\(:hover, :focus-visible, :focus-within\)\s+\.premium-product-card__image-asset\s*{[^}]*scale\(1\.024\)/s);
    expect(compositeCss).toContain(".productCard:hover .productImage");
    expect(compositeCss).toContain("scale(1.024)");
    expect(compositeCss).not.toMatch(/rotateX|rotateY|text-shadow|glow/i);
  });

  it("keeps reduced motion on the composite and removes Three.js runtime from the homepage", () => {
    const component = source("sections/home/home-landing-composite.tsx");
    const compositeSection = source("sections/home/home-composite-section.tsx");
    const css = `${source("sections/home/home-landing-composite.module.css")}\n${source("sections/home/home-shelf-shared.module.css")}`;

    expect(compositeSection).toContain("useReducedMotionPreference");
    expect(compositeSection).toContain('motionState = reducedMotion ? "reduced" : "static"');
    expect(compositeSection).toContain("data-motion-state={motionState}");
    expect(component).not.toContain("HomeDroneModelScene");
    expect(component).not.toContain("enabled={!reducedMotion");
    expect(component).not.toContain("home-three-scene");
    expect(component).not.toContain("creative-three");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("transition: none");
    expect(css).toContain("transform: none");
  });

  it("removes the legacy homepage 3D runtime toolchain", () => {
    const packageJson = source("package.json");
    const component = source("sections/home/home-landing-composite.tsx");
    const legacyScenePath = join(process.cwd(), "sections/home/home-drone-model-scene.tsx");
    const modelPath = join(process.cwd(), "public/models/mithron-drone-showcase.glb");
    const optimizeScriptPath = join(process.cwd(), "tools/optimize-home-drone-model.mjs");

    expect(packageJson).not.toContain('"three"');
    expect(packageJson).not.toContain('"assets:optimize-home-drone-model"');
    expect(packageJson).not.toContain('"fbx2gltf"');
    expect(existsSync(legacyScenePath)).toBe(false);
    expect(existsSync(modelPath)).toBe(false);
    expect(existsSync(optimizeScriptPath)).toBe(false);
    expect(component).not.toContain("HomeDroneModelScene");
    expect(component).not.toContain("mithron-drone-showcase.glb");
  });

  it("keeps catalog product images visible without deferred reveal or content-visibility", () => {
    const globals = source("app/globals.css");

    expect(globals).toMatch(/\.catalog-hero-section--showcase\s*{[^}]*overflow:\s*hidden/s);
    expect(globals).toMatch(/\.catalog-hero-image-section__asset\s*{[^}]*width:\s*100%[^}]*max-width:\s*100%/s);
    expect(globals).toMatch(/\.catalog-page-shell\s+\.premium-product-card__media\s+\.mithron-responsive-image\s*{[^}]*opacity:\s*1/s);
    expect(globals).not.toMatch(/\.catalog-page-shell\s+\.premium-product-card-shell\s*{[^}]*content-visibility:\s*auto/s);
    expect(globals).toMatch(/\.catalog-page-shell\s+\.premium-product-card\s*{[^}]*min-height:\s*0/s);
    expect(globals).toContain("@media (max-width: 640px)");
    expect(globals).toMatch(/@media \(max-width: 640px\)[\s\S]*\.catalog-page-shell \.premium-product-card\s*\{[^}]*min-height:\s*0/s);
  });

  it("keeps product gallery hero images visible without deferred reveal", () => {
    const showcase = source("sections/product/showcase/product-showcase.module.css");

    expect(showcase).toMatch(/\.stageImageFrame\s+:global\(\.mithron-responsive-image\)\s*{[^}]*opacity:\s*1/s);
  });

  it("keeps public storefront chrome free of heavy live backdrop blur", () => {
    const publicChromeFiles = [
      "components/layout/site-footer.tsx",
      "components/overlays/cart-drawer.tsx",
      "components/overlays/search-overlay.tsx",
      "sections/catalog/catalog-page.tsx",
      "sections/product/product-configurator.tsx",
      "sections/product/showcase/product-immersive-gallery.tsx"
    ];

    for (const file of publicChromeFiles) {
      expect(source(file), file).not.toContain("backdrop-blur");
    }
  });

  it("uses a responsive mobile composite instead of scrubbed card transforms", () => {
    const component = source("sections/home/home-landing-composite.tsx");
    const compositeSection = source("sections/home/home-composite-section.tsx");
    const css = `${source("sections/home/home-landing-composite.module.css")}\n${source("sections/home/home-shelf-shared.module.css")}`;

    expect(compositeSection).toContain("useReducedMotionPreference");
    expect(component).not.toContain('window.matchMedia("(max-width: 640px)")');
    expect(css).toContain("@media (max-width: 640px)");
    expect(css).toMatch(/@media \(max-width: 640px\)\s*{[\s\S]*?\.missionWorldGrid\s*{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*{[\s\S]*?\.productCard:hover \.productImage/s);
  });
});
