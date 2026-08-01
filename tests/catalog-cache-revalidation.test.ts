import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("catalog cache revalidation", () => {
  it("busts list and search tags when a product slug is archived or deleted", () => {
    const cache = source("lib/catalog-cache.ts");
    expect(cache).toContain("catalog-products");
    expect(cache).toContain("catalog-search");
    expect(cache).toContain("catalog-search-index");
    expect(cache).toContain("catalog-showroom");
    expect(cache).toContain("revalidateBulkCatalogSurfaces");
    expect(cache).toContain("if (normalizedProductSlug)");
    // Product-scoped revalidation must call bulk surface bust, not only PDP tags.
    const productBranch = cache.slice(cache.indexOf("if (normalizedProductSlug)"));
    expect(productBranch).toContain("revalidateBulkCatalogSurfaces()");
    expect(productBranch).toContain('revalidateTag(`product:${normalizedProductSlug}`');
  });

  it("warehouse archive sets archived_at and published_at null", () => {
    const warehouse = source("app/warehouse/actions.ts");
    expect(warehouse).toContain("productPayload.archived_at = now");
    expect(warehouse).toContain("productPayload.published_at = null");
    expect(warehouse).toContain('productPayload.workflow_status = "archived"');
  });
});
