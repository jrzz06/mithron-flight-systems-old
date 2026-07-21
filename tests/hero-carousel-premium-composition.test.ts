import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("hero carousel premium composition", () => {
  it("keeps the home hero on the approved premium composition contract", () => {
    const hero = source("sections/home/hero-carousel.tsx");
    const heroSlides = source("lib/media/resolve-hero-carousel-slides.ts");
    const globals = source("app/globals.css");

    expect(hero).toContain("const heroImageComposition");
    expect(hero).toContain("function getHeroImageComposition");
    expect(hero).toContain("function getHeroContentInk");
    expect(hero).toContain("heroTextInkBySlide");
    expect(hero).toContain("resolveHomepageSlideNavbarInk");
    expect(hero).toContain("function getHeroNavbarInk");
    expect(heroSlides).toContain('.filter((slide) => slide.id !== "surveillance-grid")');
    expect(heroSlides).toContain(".slice(0, 3)");
    expect(hero).toContain("resolveHeroCarouselSlides");
    expect(hero).toContain("useReducedMotionPreference");
    expect(hero).toContain('data-hero-system="mithron-native-fullscreen-carousel"');
    expect(hero).toContain('sizes="100vw"');
    expect(hero).toContain("MithronPageHeroImage");
    expect(hero).not.toContain("will-change-transform");
    expect(hero).not.toContain("usePremiumPointerField");
    expect(hero).toContain("HeroControl");
    expect(hero).toContain("HeroCta");
    expect(hero).not.toContain("heroSlideCopyById");
    expect(hero).not.toContain("HERO_EXTERNAL_CTA");
    expect(hero).toContain('data-testid="hero-pagination"');

    expect(globals).toContain(".hero-dji-title");
    expect(globals).toContain('[data-hero-content-ink="split"]');
    expect(globals).toContain("max-width: min(100%, 40rem)");
    expect(globals).toContain("position: absolute");
    expect(globals).toContain("inset: 0");
    expect(globals).toContain("padding-top: clamp(1.5rem, 3cqb, 2.5rem)");
    expect(globals).toContain(".hero-dji-layout::before");
    expect(globals).toContain("content: none");
    expect(globals).toContain("@keyframes hero-cinematic-enter");
    expect(hero).toContain("hero-dji-content-unit");
    expect(hero).toContain("hero-dji-headline-row");
    expect(hero).toContain('side="left"');
    expect(hero).toContain('side="right"');
    expect(hero).toContain('label="Previous hero"');
    expect(hero).toContain("hero-carousel-control--left");

    expect(globals).toContain(".hero-dji-content-unit");
    expect(globals).toContain(".hero-dji-headline-row");
    expect(globals).toContain("justify-content: center");
    expect(globals).toContain(".hero-carousel-control--left");
    expect(globals).toContain(".hero-carousel-control--right");
    expect(globals).toContain(".hero-banner-product-image :is(img, video)");
    expect(globals).toContain("object-position: var(--hero-image-object-position, center center)");
    expect(hero).toContain('mobileObjectPosition: "78% 47%"');
    expect(hero).toContain('mobileTransform: "translate3d(0, 0, 0) scale(1.1)"');
    expect(hero).toContain("hero-banner-media-bleed");
    expect(hero).toContain('bg-[#050505]');
    expect(hero).toContain("--hero-image-mobile-origin");
    expect(globals).toContain(".hero-banner-media-bleed");
    expect(globals).toContain("max-width: none !important");
  });

  it("uses a CSS opacity crossfade carousel contract", () => {
    const hero = source("sections/home/hero-carousel.tsx");
    const globals = source("app/globals.css");

    expect(hero).not.toContain("framer-motion");
    expect(hero).not.toContain("AnimatePresence");
    expect(hero).not.toContain("<motion.div");
    expect(hero).toContain("key={item.id}");
    expect(hero).toContain('className="absolute inset-0 hero-slide-frame"');
    expect(hero).toContain('data-hero-motion="static"');
    expect(hero).toContain("HERO_ADVANCE_MS");
    expect(hero).toContain("setInterval");
    expect(hero).toContain("goToSlide");
    expect(hero).toContain("safeSlides.map");
    expect(hero).toContain('label="Previous hero"');
    expect(hero).toContain('label="Next hero"');
    expect(hero).toContain('"--hero-image-object-position": composition.desktopObjectPosition');
    expect(hero).not.toContain("previousIndex");
    expect(hero).not.toContain("stagger: 0.085");

    expect(globals).toContain('--font-misans: "MiSans VF"');
    expect(existsSync(join(process.cwd(), "lib/fonts/misans.ts"))).toBe(true);
    expect(existsSync(join(process.cwd(), "lib/fonts/misans-faces.css"))).toBe(true);
    const faces = source("lib/fonts/misans-faces.css");
    expect(faces).toContain('font-family: "MiSans VF"');
    expect(faces).toContain("font-weight: 100 900");
    expect(faces).toContain("font-display: block");
    expect(faces).toContain("/fonts/b8005e4731c12f9b1655028b1e379a35.woff2");
    expect(faces).not.toContain("MiSansLatin-");
    expect(existsSync(join(process.cwd(), "public/fonts/b8005e4731c12f9b1655028b1e379a35.woff2"))).toBe(true);
    expect(globals).toContain(".hero-banner-product-image :is(img, video)");
    expect(globals).not.toContain("@keyframes heroSlideCrossfade");
    expect(globals).toContain("object-fit: cover");
    expect(globals).toContain("object-position: var(--hero-image-object-position, center center)");
  });

  it("uses DJI-like storefront hero sizing without full-viewport lock", () => {
    const hero = source("sections/home/hero-carousel.tsx");
    const globals = source("app/globals.css");
    const layout = source("app/layout.tsx");
    const nav = source("components/navigation/store-nav.tsx");

    expect(existsSync(join(process.cwd(), "app/storefront-showcase.css"))).toBe(false);
    expect(existsSync(join(process.cwd(), "app/ecosystem-showcase.css"))).toBe(false);

    expect(hero).toContain("hero-premium-field relative isolate h-[80svh] min-h-[480px] md:min-h-[580px] w-full overflow-hidden");
    expect(hero).toContain("hero-dji-layout");
    expect(hero).toContain("hero-dji-title");
    expect(hero).toContain("hero-dji-subtitle");
    expect(hero).toContain("hero-dji-pagination");
    expect(hero).toContain("hero-dji-content-unit");
    expect(hero).toContain("hero-carousel-control");

    expect(globals).toMatch(/\.hero-premium-field\s*{[^}]*height:\s*80vh[^}]*height:\s*80svh[^}]*min-height:\s*580px/s);
    expect(globals).not.toMatch(/\.hero-premium-field\s*{[^}]*height:\s*100svh/s);
    expect(globals).not.toMatch(/\.hero-premium-field\s*{[^}]*min-height:\s*100svh/s);
    expect(globals).toContain("margin-bottom: 0");
    expect(globals).toContain("object-fit: cover");
    expect(globals).toContain("justify-content: center");
    expect(globals).toContain("grid-template-columns: 1fr");
    expect(globals).toContain("font-weight: 700");
    expect(globals).toContain("white-space: nowrap");

    expect(layout).toContain("misans");
    expect(layout).toContain("@/lib/fonts/misans");
    expect(layout).not.toContain("misans-vf");
    expect(layout).not.toContain("Manrope");
    expect(layout).not.toContain("Montserrat");
    expect(layout).not.toContain("Inter");
    expect(layout).not.toContain("Outfit");

    expect(nav).toContain("adaptive-navbar left-0 top-0 z-[var(--z-nav)] w-full");
    expect(nav).toContain("style={style}");
  });
});
