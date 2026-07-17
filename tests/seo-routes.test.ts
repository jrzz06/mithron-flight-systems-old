import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("seo routes", () => {
  it("ships sitemap and robots route handlers", () => {
    expect(existsSync(join(root, "app", "sitemap.ts"))).toBe(true);
    expect(existsSync(join(root, "app", "robots.ts"))).toBe(true);
  });

  it("indexes canonical storefront paths and published products in the sitemap", () => {
    const sitemap = source("app/sitemap.ts");

    expect(sitemap).toContain("CATALOG_CATEGORY_SLUGS");
    expect(sitemap).toContain("getPublishedProductSitemapEntries");
    expect(sitemap).toContain('"/products"');
    expect(sitemap).toContain("toAbsoluteUrl");
  });

  it("blocks private control-plane routes in robots.txt", () => {
    const robots = source("app/robots.ts");

    expect(robots).toContain('"/admin/"');
    expect(robots).toContain('"/warehouse/"');
    expect(robots).toContain('"/account/"');
    expect(robots).toContain('"/checkout"');
    expect(robots).toContain("/sitemap.xml");
  });

  it("injects site-wide and product structured data", () => {
    const layout = source("app/layout.tsx");
    const productPage = source("app/(storefront)/product/[slug]/page.tsx");
    const structuredData = source("lib/structured-data.ts");

    expect(layout).toContain("buildSiteStructuredData");
    expect(layout).toContain("JsonLd");
    expect(productPage).toContain("buildProductStructuredData");
    expect(structuredData).toContain('"@type": "Product"');
    expect(structuredData).toContain('"@type": "BreadcrumbList"');
    expect(structuredData).toContain('"@type": "Organization"');
  });

  it("removes Wix tax group wording from admin surfaces", () => {
    const taxFields = source("components/admin/product-tax-fields.tsx");
    const adminForms = source("services/product-admin-forms.ts");

    expect(taxFields).not.toContain("Wix Studio");
    expect(taxFields).toContain("Indian GST catalog group");
    expect(adminForms).not.toContain("Wix tax group");
    expect(adminForms).toContain("GST catalog group");
  });
});
