import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  filterInventoryForWarehouseScope,
  orderMatchesWarehouseScope,
  type WarehouseScope
} from "@/services/warehouse-scope";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("warehouse order scope hardening", () => {
  it("enforces orderMatchesWarehouseScope on warehouse order mutations", () => {
    const actions = source("app/warehouse/actions.ts");
    expect(actions).toContain("assertOrderAccessibleInWarehouseScope");
    expect(actions).toContain("orderMatchesWarehouseScope");
    expect(actions).toMatch(/updateWarehouseOrderLifecycleFormAction[\s\S]*assertOrderAccessibleInWarehouseScope/);
    expect(actions).toMatch(/receiveWarehouseOrderFormAction[\s\S]*assertOrderAccessibleInWarehouseScope/);
    expect(actions).toMatch(/cancelWarehouseOrderFormAction[\s\S]*assertOrderAccessibleInWarehouseScope/);
    expect(actions).toMatch(/dispatchWarehouseOrderFormAction[\s\S]*assertOrderAccessibleInWarehouseScope/);
  });

  it("loads order metadata for warehouse scope checks", () => {
    const actions = source("app/warehouse/actions.ts");
    expect(actions).toContain("metadata");
    expect(actions).toContain("Order is outside your assigned warehouse.");
  });

  it("ignores client-supplied warehouse_code for non-global operators", () => {
    const actions = source("app/warehouse/actions.ts");
    expect(actions).toMatch(/resolveWarehouseCodeFromFormData[\s\S]*if \(!scope\.isGlobal\)/);
    expect(actions).toMatch(/return scope\.warehouseCode/);
  });

  it("scopes inventory rows by warehouse_code for non-global operators", () => {
    const scoped: WarehouseScope = {
      role: "warehouse",
      warehouseCode: "BLR",
      warehouseName: "Bangalore",
      isGlobal: false
    };
    const rows = [
      { warehouse_code: "BLR", sku: "A" },
      { warehouse_code: "DEL", sku: "B" }
    ];
    expect(filterInventoryForWarehouseScope(rows, scoped)).toEqual([{ warehouse_code: "BLR", sku: "A" }]);
    expect(
      orderMatchesWarehouseScope(
        { metadata: { assigned_warehouse_code: "DEL" } },
        scoped,
        "BLR"
      )
    ).toBe(false);
    expect(
      orderMatchesWarehouseScope(
        { metadata: { assigned_warehouse_code: "BLR" } },
        scoped,
        "BLR"
      )
    ).toBe(true);
  });
});
