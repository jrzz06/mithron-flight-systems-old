import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildPatternCircles, PATTERN_DEFAULTS } from "@/components/ui/pattern-background";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("PatternBackground", () => {
  it("exports tweakable defaults with five to six ripple clusters", () => {
    expect(PATTERN_DEFAULTS.clusters.length).toBeGreaterThanOrEqual(5);
    expect(PATTERN_DEFAULTS.clusters.length).toBeLessThanOrEqual(6);
    expect(PATTERN_DEFAULTS.strokeColor).toBe("#E5E5E5");
    expect(PATTERN_DEFAULTS.background).toBe("#FAFAFA");
  });

  it("generates concentric circles programmatically for each cluster", () => {
    const circles = buildPatternCircles();
    const expectedCount = PATTERN_DEFAULTS.clusters.reduce((total, cluster) => total + cluster.ringCount, 0);

    expect(circles).toHaveLength(expectedCount);
    expect(circles[0]).toMatchObject({
      cx: PATTERN_DEFAULTS.clusters[0].cxPct,
      cy: PATTERN_DEFAULTS.clusters[0].cyPct
    });
    expect(circles.some((circle) => circle.r > 0)).toBe(true);
  });

  it("uses svg slice scaling and non-scaling stroke in the component", () => {
    const component = source("components/ui/pattern-background.tsx");

    expect(component).toContain('preserveAspectRatio="xMidYMid slice"');
    expect(component).toContain('vectorEffect="non-scaling-stroke"');
    expect(component).toContain("buildPatternCircles");
    expect(component).not.toContain('"use client"');
    expect(component).toContain('from "lucide-react"');
    expect(component).toContain("Crown");
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
    expect(css).toMatch(/\.stage[\s\S]*border-radius:\s*var\(--pdp-radius-xl\)/);
    expect(css).not.toMatch(/\.stage[\s\S]*background:\s*var\(--pdp-section\)/);
  });
});
