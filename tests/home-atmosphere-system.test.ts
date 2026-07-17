import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("home landing composite visual system", () => {
  it("uses the Mithron white/off-white storefront rhythm with scoped styles", () => {
    const component = source("sections/home/home-landing-composite.tsx");
    const miniCarousel = source("sections/home/home-mini-carousel.tsx");
    const miniCarouselLib = source("lib/home/mini-carousel.ts");
    const css = `${source("sections/home/home-landing-composite.module.css")}\n${source("sections/home/home-shelf-shared.module.css")}`;
    const globals = source("app/globals.css");

    expect(miniCarousel).toContain('data-testid="home-mini-carousel"');
    expect(miniCarousel).toContain('data-testid="home-mini-carousel-rail"');
    expect(miniCarouselLib).toContain("pickHomeMiniCarouselItems");
    expect(component).not.toContain("Mithron operating ecosystem");
    expect(component).not.toContain("one guided journey");
    expect(component).toContain("localMedia");
    expect(source("config/storefront-media-paths.ts")).toContain("night-surveillance.webp");
    expect(source("config/homepage-media-fallbacks.ts")).toContain("Site monitoring mission media");
    expect(css).toContain("--home-page: var(--ds-bg)");
    expect(css).toContain("--home-card: var(--ds-card)");
    expect(css).toContain("background: var(--ds-bg)");
    expect(css).toContain("border: 1px solid var(--home-border)");
    expect(css).toContain("--shelf-product-image-shadow:");
    expect(css).toContain("filter: var(--shelf-product-image-shadow)");
    const cssWithoutProductImageShadow = css
      .replace(/--shelf-product-image-shadow:[^;]+;/g, "")
      .replace(/--shelf-product-image-shadow-hover:[^;]+;/g, "")
      .replace(/filter:\s*var\(--shelf-product-image-shadow[^)]*\)/g, "");
    expect(cssWithoutProductImageShadow).not.toMatch(/aurora|neon|text-shadow|filter:\s*drop-shadow|glow/i);
    expect(component).not.toContain("data-atmosphere-system");
    expect(component).not.toContain("--sf-atmo");
    expect(globals).not.toContain("@import \"./storefront-showcase.css\"");
  });

  it("keeps typography and product-card motion restrained", () => {
    const css = `${source("sections/home/home-landing-composite.module.css")}\n${source("sections/home/home-shelf-shared.module.css")}`;

    expect(css).toContain("font-family: var(--type-display)");
    expect(css).toContain("font-family: var(--type-ui)");
    expect(css).toContain("letter-spacing: 0");
    expect(css).toContain(".productCard:hover .productImage");
    expect(css).toContain("scale(1.024)");
    expect(css).not.toContain("scale(1.08)");
    expect(css).not.toMatch(/rotateX|rotateY|translateY\(-12px\)|backdrop-filter:\s*blur\(20px\)/);
  });

  it("uses medium spread light zones with bottom text scrims", () => {
    const component = source("sections/home/home-landing-composite.tsx");
    const css = `${source("sections/home/home-landing-composite.module.css")}\n${source("sections/home/home-shelf-shared.module.css")}`;

    expect(css).toMatch(/\.agriShowcaseAtmosphere,\s*\n\.cityShowcaseAtmosphere\s*{\s*display:\s*none;/s);
    expect(component).toContain("missionLightZoneStyle");
    expect(component).toContain('"--zone-1-x"');
    expect(component).toContain("agrone-pilot-registration");
    expect(component).toContain("dronelancer-model");
    expect(css).toContain("--mission-asset-stage-height");
    expect(css).toContain("--mission-text-scrim-height");
    expect(css).toMatch(/\.agriCardAmbientBeam[\s\S]*opacity:\s*0\.32;/);
    expect(css).toMatch(/\.agriCardTextProtection[\s\S]*linear-gradient\(\s*to top/s);
    expect(css).toContain("mix-blend-mode: soft-light");
    expect(css).toContain("background: #f8fcf9");
    expect(css).toContain("background: #f7faff");
    expect(css).toContain(".missionCardBrandShield");
    expect(css).toContain("data-logo-cover");
    expect(component).toContain("logoCover");
  });
});
