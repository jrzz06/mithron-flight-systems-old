import { describe, expect, it } from "vitest";
import { getProductOverviewHtml } from "@/lib/product-detail-content";
import { sanitizeProductHtml } from "@/lib/sanitize-html";
import type { Product } from "@/config/types";

function productWithDescription(description: string): Product {
  return {
    slug: "test-product",
    productUrl: "/product/test-product",
    name: "Test Product",
    tagline: "Test",
    price: 100,
    category: "Accessories",
    interests: [],
    specs: {},
    description,
    image: { src: "/test.jpg", alt: "Test" },
    hero: { src: "/test-hero.jpg", alt: "Test hero" },
    gallery: [],
    variants: [],
    bundles: [],
    story: [],
    anchors: []
  };
}

describe("product HTML sanitization", () => {
  it("strips script tags and event handlers", () => {
    const dirty = '<p>Hello</p><script>alert(1)</script><img src=x onerror="alert(1)">';
    const clean = sanitizeProductHtml(dirty);
    expect(clean).not.toContain("<script");
    expect(clean).not.toContain("onerror");
  });

  it("neutralizes javascript: links", () => {
    const dirty = '<a href="javascript:alert(1)">click</a>';
    const clean = sanitizeProductHtml(dirty);
    expect(clean).not.toContain("javascript:");
  });

  it("allows safe http and https links", () => {
    const dirty = '<a href="https://mithron.com">Mithron</a>';
    const clean = sanitizeProductHtml(dirty);
    expect(clean).toContain('href="https://mithron.com"');
  });

  it("sanitizes product overview HTML before render", () => {
    const html = getProductOverviewHtml(productWithDescription('<p>Safe</p><script>x</script>'));
    expect(html).toBe("<p>Safe</p>");
    expect(html).not.toContain("script");
  });
});
