import { describe, expect, it } from "vitest";
import {
  ACTIVE_PRODUCT_FILTER,
  ARCHIVED_PRODUCT_FILTER,
  PUBLISHED_STOREFRONT_FILTER
} from "@/lib/catalog-product-filters";

describe("catalog product filters", () => {
  it("keeps merge_status null-safe inside and= so search or= cannot overwrite it", () => {
    expect(ACTIVE_PRODUCT_FILTER).toContain("and=(");
    expect(ACTIVE_PRODUCT_FILTER).toContain("or(merge_status.is.null,merge_status.eq.active)");
    expect(ACTIVE_PRODUCT_FILTER).not.toMatch(/(^|&)or=/);
    expect(ACTIVE_PRODUCT_FILTER).not.toContain("merge_status=neq.");
  });

  it("archives via workflow_status or archived_at", () => {
    expect(ARCHIVED_PRODUCT_FILTER).toBe(
      "or=(workflow_status.eq.archived,archived_at.not.is.null)"
    );
  });

  it("keeps storefront published filter null-safe for merge_status", () => {
    expect(PUBLISHED_STOREFRONT_FILTER).toContain("workflow_status.eq.published");
    expect(PUBLISHED_STOREFRONT_FILTER).toContain("or(merge_status.is.null,merge_status.eq.active)");
    expect(PUBLISHED_STOREFRONT_FILTER).not.toMatch(/(^|&)or=/);
  });
});
