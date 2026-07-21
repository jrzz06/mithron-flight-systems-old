import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("Instrument Sans + Geist typography", () => {
  it("loads storefront fonts with the approved type scale and no faux weights", () => {
    const globals = source("app/globals.css");
    const density = source("app/storefront-density.css");
    const shelves = source("sections/home/home-shelf-shared.module.css");
    const layout = source("app/layout.tsx");
    const fonts = source("lib/fonts/storefront.ts");

    expect(existsSync(join(process.cwd(), "lib/fonts/storefront.ts"))).toBe(true);
    expect(existsSync(join(process.cwd(), "lib/fonts/misans.ts"))).toBe(false);
    expect(existsSync(join(process.cwd(), "lib/fonts/misans-faces.css"))).toBe(false);
    expect(fonts).toContain('from "next/font/google"');
    expect(fonts).toContain("Instrument_Sans");
    expect(fonts).toContain('from "geist/font/sans"');
    expect(fonts).toContain("GeistSans");
    expect(fonts).toContain("--font-instrument-sans");

    expect(layout).toContain("@/lib/fonts/storefront");
    expect(layout).toContain("fontDisplay.variable");
    expect(layout).toContain("fontBody.variable");
    expect(layout).toContain("fonts-pending");
    expect(layout).toContain("document.fonts.ready");

    expect(globals).toContain("--font-instrument-sans-family");
    expect(globals).toContain("--font-geist-family");
    expect(globals).toContain("font-family: var(--font-display)");
    expect(globals).toContain("font-family: var(--font-body)");
    expect(globals).toContain("font-synthesis: none");
    expect(globals).toContain("--type-brand-header-weight: 700");
    expect(globals).toContain("--type-featured-title-weight: 700");
    expect(globals).toContain("--type-product-title-weight: 600");
    expect(globals).toContain("--type-tagline-weight: 400");
    expect(globals).toContain("--tracking-tighter: -0.02em");
    expect(globals).toContain("--tracking-display: -0.02em");
    expect(globals).toContain("--leading-hero: 1.05");
    expect(globals).toContain("--leading-body: 1.5");
    expect(globals).not.toContain("font-weight: 650");
    expect(globals).not.toContain("font-weight: 420");
    expect(globals).not.toContain("letter-spacing: -0.045em");
    expect(globals).not.toContain("MiSans");
    expect(globals).not.toContain("Quicksand");

    expect(density).toContain("--hero-panel-title-size: var(--type-brand-header)");
    expect(density).not.toContain("1.45rem * var(--storefront-type-scale)");

    expect(shelves).toContain("--type-featured-title-weight");
    expect(shelves).toContain("font-weight: 400");
    expect(shelves).not.toContain("font-weight: 420");
    expect(shelves).toContain("var(--type-section)");
    expect(shelves).toContain("var(--type-product-title)");
    expect(shelves).not.toContain("MiSans");
  });
});
