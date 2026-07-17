import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildInventoryLinkageRecords,
  buildProductInventoryWorkflowFromFormData,
  buildSimpleInventoryUpdateFromFormData,
  reconcileAdminInventoryQuantities
} from "@/services/enterprise-admin-forms";
import { parseProductCreateInventoryFromFormData } from "@/services/product-inventory-workflow";

function formData(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

describe("product inventory enterprise workflow", () => {
  it("builds inventory and warehouse records with quantity as the single source of truth", () => {
    const input = buildProductInventoryWorkflowFromFormData(formData({
      product_slug: "source-agri-kisan-drone-small-8-liter",
      warehouse_code: " IN-WEST-01 ",
      quantity: "4",
      change_summary: "Link base variant stock"
    }));

    const records = buildInventoryLinkageRecords(input, {
      actorId: "00000000-0000-0000-0000-000000000001",
      at: "2026-05-24T10:00:00.000Z"
    });

    expect(records.inventoryRecord).toEqual({
      product_slug: "source-agri-kisan-drone-small-8-liter",
      sku: "SOURCE-AGRI-KISAN-DRONE-SMALL-8-LITER",
      variant_id: null,
      stock_status: "available",
      quantity: 4,
      reserved_quantity: 0,
      reorder_threshold: 0,
      updated_by: "00000000-0000-0000-0000-000000000001",
      updated_at: "2026-05-24T10:00:00.000Z"
    });
    expect(records.warehouseStockRecord).toEqual({
      warehouse_code: "IN-WEST-01",
      product_slug: "source-agri-kisan-drone-small-8-liter",
      sku: "SOURCE-AGRI-KISAN-DRONE-SMALL-8-LITER",
      variant_id: null,
      available_quantity: 4,
      committed_quantity: 0,
      last_counted_at: "2026-05-24T10:00:00.000Z",
      updated_by: "00000000-0000-0000-0000-000000000001",
      updated_at: "2026-05-24T10:00:00.000Z"
    });
    expect(records.lowStock).toBe(false);
  });

  it("derives stock status from quantity", () => {
    const input = buildProductInventoryWorkflowFromFormData(formData({
      product_slug: "source-agri-kisan-drone-small-8-liter",
      warehouse_code: "IN-WEST-01",
      quantity: "0"
    }));

    expect(input.sku).toBe("SOURCE-AGRI-KISAN-DRONE-SMALL-8-LITER");
    expect(input.stockStatus).toBe("out_of_stock");
  });

  it("parses create inventory when checkbox sends off then on", () => {
    const data = new FormData();
    data.append("inventory_track", "off");
    data.append("inventory_track", "on");
    data.append("inventory_warehouse_code", "IN-WEST-01");
    data.append("inventory_initial_quantity", "6");

    const parsed = parseProductCreateInventoryFromFormData(data, "agri-drone-x1");
    expect(parsed).toEqual({
      productSlug: "agri-drone-x1",
      sku: "AGRI-DRONE-X1",
      variantId: null,
      stockStatus: "available",
      quantity: 6,
      warehouseCode: "IN-WEST-01",
      changeSummary: "Initial inventory on product creation"
    });
  });

  it("seeds warehouse linkage on create even when initial quantity is zero", () => {
    const parsed = parseProductCreateInventoryFromFormData(formData({
      inventory_track: "on",
      inventory_warehouse_code: "IN-WEST-01",
      inventory_initial_quantity: "0"
    }), "agri-drone-x1");

    expect(parsed?.quantity).toBe(0);
    expect(parsed?.warehouseCode).toBe("IN-WEST-01");
  });

  it("reconciles admin stock quantities to a single quantity value", () => {
    expect(reconcileAdminInventoryQuantities({ quantity: 10 })).toEqual({ quantity: 10 });
  });

  it("builds simple inventory updates from quantity", () => {
    const input = buildSimpleInventoryUpdateFromFormData(formData({
      product_slug: "agri-drone-x1",
      sku: "AGRI-DRONE-X1",
      warehouse_code: "IN-WEST-01",
      quantity: "3"
    }));

    expect(input.stockStatus).toBe("available");
    expect(input.quantity).toBe(3);
  });

  it("includes simplified inventory migration", () => {
    const migrationPath = join(process.cwd(), "supabase", "migrations", "20260712000100_simplified_inventory_model.sql");
    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("upsert_product_inventory");
    expect(sql).toContain("stock_deduction_trigger");
  });
});
