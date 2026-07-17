import { describe, expect, it } from "vitest";
import { heroSlides as defaultHeroSlides } from "@/config/products";
import { getHeroLcpPreloadLinks } from "@/lib/media/hero-lcp-preload";
import { resolveHeroCarouselSlides } from "@/lib/media/resolve-hero-carousel-slides";

describe("hero lcp preload", () => {
  it("resolves the first carousel slide for preload", () => {
    const slides = resolveHeroCarouselSlides(defaultHeroSlides);
    expect(slides.length).toBeGreaterThan(0);
    expect(slides[0]?.id).not.toBe("surveillance-grid");
  });

  it("returns a preload link for the first hero slide", () => {
    const links = getHeroLcpPreloadLinks(defaultHeroSlides);
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]?.href).toMatch(/^https?:\/\//);
    expect(links[0]?.type).toBe("image/webp");
    expect(links[0]?.imageSrcSet).toContain("w");
    expect(links[0]?.imageSizes).toContain("1920px");
  });
});

describe("storefront scroll padding", () => {
  it("offsets hash navigation for the fixed nav height", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const globals = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

    expect(globals).toMatch(/html\s*{[^}]*scroll-padding-top:\s*var\(--store-nav-offset\)/s);
  });
});
