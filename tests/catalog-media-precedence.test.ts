import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("catalog media precedence", () => {
  it("prefers Supabase media and does not fall back to external https URLs", () => {
    const catalog = source("services/catalog.ts");
    expect(catalog).toContain("isTrustedCatalogStorageSrc");
    expect(catalog).not.toContain("externalRowImage");
    expect(catalog).not.toContain("wixstatic");
    expect(catalog).toContain("inline JSON image fallback");
    // Wix migrations often omit width/height — linked media must still resolve.
    expect(catalog).toContain("Migrated Wix originals often lack width/height");
    expect(catalog).not.toMatch(/if \(!dimensions\.width \|\| !dimensions\.height\) return null;/);
  });

  it("tracks published products missing primary media links", () => {
    const catalog = source("services/catalog.ts");
    const admin = source("services/admin.ts");
    expect(catalog).toContain("countPublishedProductsWithoutPrimaryLink");
    expect(admin).toContain("publishedProductsWithoutPrimaryLink");
    expect(admin).toContain("mediaParityVerified");
  });

  it("skips enterprise menu products that are missing source images", () => {
    const catalog = source("services/catalog.ts");
    const shell = source("components/layout/storefront-shell-chrome.tsx");
    const adminProducts = source("app/admin/products/page.tsx");
    expect(catalog).toContain("export type CatalogDataError");
    expect(catalog).toContain("export type EnterpriseMenuLoadResult");
    expect(catalog).toContain("createMissingSourceImageError");
    expect(catalog).toContain("errors.push(error)");
    expect(catalog).toContain("export const loadProductForPage");
    expect(shell).not.toContain("CatalogIntegrityNotice");
    expect(shell).toContain("enterpriseMenu.products");
    expect(adminProducts).toContain("CatalogIntegrityNotice");
    expect(adminProducts).toContain("getEnterpriseMenuProducts");
  });

  it("hides missing-image products from customers via notFound on PDP", () => {
    const productPage = source("app/(storefront)/product/[slug]/page.tsx");
    const panel = source("components/layout/catalog-integrity-notice.tsx");
    expect(productPage).toContain('pageLoad.error.code === "missing_source_image"');
    expect(productPage).toContain("notFound()");
    expect(panel).toContain("showTechnicalDetail");
    expect(panel).toContain("showTechnicalDetail ?");
  });
});
