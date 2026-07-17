import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const oldDraftCityOperatorId = ["draft", "city", "operators"].join("-");

describe("home composite scroll transition system", () => {
  it("uses a static composite section without scroll-scrubbed reveals", () => {
    const component = source("sections/home/home-landing-composite.tsx");
    const compositeSection = source("sections/home/home-composite-section.tsx");
    const css = source("sections/home/home-landing-composite.module.css");
    const globals = source("app/globals.css");

    expect(component).toContain("export function HomeLandingComposite");
    expect(compositeSection).toContain('data-testid="home-landing-composite"');
    expect(compositeSection).toContain('data-home-composite-root="true"');
    expect(compositeSection).toContain('data-motion-engine="static"');
    expect(component).not.toContain("ScrollTrigger.create");
    expect(component).not.toContain("scrub: true");
    expect(component).not.toContain("--home-composite-progress");
    expect(component).not.toContain("ScrollTrigger.refresh()");
    expect(component).not.toContain("mithron:ensure-lenis");
    expect(component).not.toContain("mithron:lenis-ready");
    expect(component).not.toContain('window.addEventListener("scroll"');
    expect(component).not.toContain("SplitText");
    expect(compositeSection).toContain('data-testid="home-landing-composite"');
    expect(component).not.toContain('id: "about-us"');
    expect(component).not.toContain('id: "draft-testimonials"');
    expect(component).not.toContain('data-testimonial-state="fallback"');
    expect(component).not.toContain(oldDraftCityOperatorId);

    expect(css).not.toContain(".progressTrack");
    expect(css).not.toContain(".progressFill");
    expect(css).not.toMatch(/pin:\s*true|position:\s*fixed/);
    expect(globals).not.toContain("@import \"./storefront-showcase.css\"");
  });

  it("uses shelf rows followed by Agri and City mission worlds", () => {
    const component = source("sections/home/home-landing-composite.tsx");
    const resolution = source("lib/home/homepage-resolution.ts");
    const chapterBlock = resolution.slice(
      resolution.indexOf("export const homeChapters"),
      resolution.indexOf("export const missionWorldConfigs")
    );

    for (const chapterId of [
      "drone-world",
      "drone-care",
      "global-products",
      "agri-drones",
      "city-drones"
    ]) {
      expect(chapterBlock).toContain(`id: "${chapterId}"`);
    }

    for (const removedId of ["lineup-solutions", "draft-testimonials", "creative-three", "about-us"]) {
      expect(chapterBlock).not.toContain(`id: "${removedId}"`);
    }

    expect(component).toContain("ProductShelfSection");
    expect(component).toContain("function AgriCommunityWorldSection");
    const shelfSection = source("sections/home/product-shelf-section.tsx");
    const shelfCard = source("components/product/home-product-shelf-card.tsx");
    expect(shelfCard).toContain("ProductCardImage");
    expect(shelfCard).toContain('href={`/product/${product.slug}`}');
    expect(shelfSection).toContain('data-testid="home-product-shelf-hero"');
    expect(shelfSection).toContain('data-testid="home-product-shelf-section"');
    expect(shelfCard).toContain('data-testid="home-product-card"');
    expect(component).toContain('testId="agri-community-world-section"');
    expect(component).toContain('"data-testid": "mission-world-tile"');
    expect(resolution).toContain("Drone Rental App");
    expect(resolution).toContain("Dronelancer Model");
    expect(resolution).toContain('composition: "agri-field"');
    expect(resolution).toContain('composition: "city-urban"');
    expect(component).toContain("HomeClientTestimonialsSection");
    expect(component).toContain("function HomeAboutUsBand");
    expect(component).not.toContain("function ThreeStorySection");
    expect(component).not.toContain("function AboutSection");
  });
});
