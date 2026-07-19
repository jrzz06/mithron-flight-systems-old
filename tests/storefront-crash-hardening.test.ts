import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("storefront crash hardening", () => {
  it("swallows inventory overlay failures and skips corrupt catalog rows", () => {
    const catalog = source("services/catalog.ts");
    expect(catalog).toContain("inventory overlay failed; continuing with source availability");
    expect(catalog).toContain("skipping product due to mapper error");
    expect(catalog).toContain("scoped primary media lookup failed");
    expect(catalog).toContain("primary product media lookup failed");
  });

  it("guards catalog and CMS storefront pages against hard crashes", () => {
    const products = source("app/(storefront)/products/page.tsx");
    const category = source("app/(storefront)/category/[slug]/page.tsx");
    const interest = source("app/(storefront)/interest/[slug]/page.tsx");
    const about = source("app/(storefront)/about/page.tsx");
    const contact = source("app/(storefront)/contact/page.tsx");
    const carePlus = source("app/(storefront)/product/mithron-care-plus/page.tsx");
    const home = source("sections/home/home-page-content.tsx");
    const cms = source("services/cms.ts");

    expect(products).toContain("catalog showroom failed");
    expect(category).toContain("rendering degraded catalog");
    expect(interest).toContain("generateStaticParams failed");
    expect(interest).toContain("fallbackSnapshot");
    expect(about).toContain("fallbackSnapshot");
    expect(contact).toContain("fallbackSnapshot");
    expect(carePlus).toContain("featured products failed");
    expect(home).toContain("hero banners failed");
    expect(cms).toContain("public snapshot failed; using fallback");
    expect(cms).toContain("public hero banners failed; using fallback");
  });

  it("defaults SoftErrorBoundary to silent degrade on storefront islands", () => {
    const boundary = source("components/soft-error-boundary.tsx");
    const checkout = source("app/(storefront)/checkout/page.tsx");
    const cart = source("app/(storefront)/cart/page.tsx");
    expect(boundary).toContain('variant?: "silent" | "retry"');
    expect(boundary).toContain("return null");
    expect(checkout).toContain('variant="retry"');
    expect(cart).toContain('variant="retry"');
  });
});
