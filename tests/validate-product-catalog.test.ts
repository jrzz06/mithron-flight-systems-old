import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("validate product catalog tool", () => {
  it("checks visible duplicate names and broken images", () => {
    const tool = source("tools/validate-product-catalog.ts");
    expect(tool).toContain("duplicate_visible_name");
    expect(tool).toContain("broken_image:");
    expect(tool).toContain("zero_price_visible:");
    expect(tool).toContain("warehouse_stock_on_archived");
  });
});
