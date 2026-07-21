import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PATTERN_DEFAULTS } from "@/components/ui/pattern-background";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("PatternBackground", () => {
  it("exports CSS stage defaults without concentric ripple clusters", () => {
    expect(PATTERN_DEFAULTS.background).toBe("#FAFAFA");
    expect(PATTERN_DEFAULTS.badge.size).toBe(36);
    expect(PATTERN_DEFAULTS).not.toHaveProperty("clusters");
    expect(PATTERN_DEFAULTS).not.toHaveProperty("strokeColor");
  });

  it("uses a CSS product-stage layer instead of SVG concentric circles", () => {
    const component = source("components/ui/pattern-background.tsx");
    const css = source("components/ui/pattern-background.module.css");

    expect(component).toContain("styles.stagePattern");
    expect(component).not.toContain("buildPatternCircles");
    expect(component).not.toContain("<svg");
    expect(component).not.toContain("<circle");
    expect(component).not.toContain('"use client"');
    expect(component).toContain('from "lucide-react"');
    expect(component).toContain("Crown");
    expect(css).toContain("var(--product-stage-halo)");
    expect(css).toContain("var(--product-stage-floor)");
    expect(css).not.toContain(".patternSvg");
  });

  it("renders the crown badge only when showBadge is enabled", () => {
    const component = source("components/ui/pattern-background.tsx");

    expect(component).toContain("showBadge ? (");
    expect(component).toContain('data-testid="pattern-background-badge"');
    expect(component).toContain("aria-label={badgeLabel}");
  });

  it("clips the pattern to rounded container bounds", () => {
    const css = source("components/ui/pattern-background.module.css");

    expect(css).toContain("overflow: hidden");
    expect(css).toContain("border-radius: var(--pattern-radius");
  });
});

describe("product gallery pattern integration", () => {
  it("places PatternBackground behind the immersive gallery stage", () => {
    const gallery = source("sections/product/showcase/product-immersive-gallery.tsx");
    const page = source("app/(storefront)/product/[slug]/page.tsx");
    const css = source("sections/product/showcase/product-showcase.module.css");

    expect(gallery).toContain("PatternBackground");
    expect(gallery).toContain("styles.stagePattern");
    expect(gallery).toContain("styles.stageProductShadow");
    expect(page).toContain("showBadge={Boolean(product.badge?.trim())}");
    expect(css).toContain(".stagePattern");
    expect(css).toContain(".stageProductShadow");
    expect(css).toMatch(/\.stage\s*\{[^}]*border-radius:\s*var\(--pdp-radius-xl\)/);
    expect(css).not.toMatch(/\.stage\s*\{[^}]*background:\s*var\(--pdp-section\)/);
  });
});
