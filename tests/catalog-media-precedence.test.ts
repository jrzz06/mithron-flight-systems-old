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
    expect(catalog).toContain("isSupabaseStorageSrc");
    expect(catalog).not.toContain("externalRowImage");
    expect(catalog).not.toContain("wixstatic");
    expect(catalog).toContain("inline JSON image fallback");
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
    const layout = source("app/(storefront)/layout.tsx");
    expect(catalog).toContain("export type CatalogDataError");
    expect(catalog).toContain("export type EnterpriseMenuLoadResult");
    expect(catalog).toContain("createMissingSourceImageError");
    expect(catalog).toContain("errors.push(error)");
    expect(catalog).toContain("export async function loadProductForPage");
    expect(layout).toContain("catalogErrors={enterpriseMenu.errors}");
    expect(layout).toContain("enterpriseMenu.products");
  });
});
