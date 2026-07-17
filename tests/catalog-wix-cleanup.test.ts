import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("catalog wix cleanup", () => {
  it("ships a migration that removes Imported Wix Inventory duplicates", () => {
    const migration = source("supabase/migrations/20260622000400_remove_imported_wix_inventory_duplicates.sql");

    expect(migration).toContain("Imported Wix Inventory");
    expect(migration).toContain("delete from public.mithron_products");
    expect(migration).toContain("product_media_assets");
    expect(migration).toContain("warehouse_stock");
  });

  it("excludes legacy Imported Wix Inventory rows from storefront catalog queries", () => {
    const catalog = source("services/catalog.ts");

    expect(catalog).toContain('const LEGACY_WIX_INVENTORY_CATEGORY = "Imported Wix Inventory"');
    expect(catalog).toContain("publishedCatalogFilter");
    expect(catalog).toContain("category=neq.");
  });

  it("ships product merge audit migration for duplicate reconciliation", () => {
    const migration = source("supabase/migrations/20260623100000_product_merge_audit.sql");
    expect(migration).toContain("product_merge_audit");
    expect(migration).toContain("merge_product_into_canonical");
  });
});
