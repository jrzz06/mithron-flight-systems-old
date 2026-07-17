import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getDefaultWarehouseCode,
  getWarehouseConfiguration,
  parseWarehouseConfigurationFormData
} from "@/services/warehouse-config";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const env = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  DEFAULT_WAREHOUSE_CODE: "IN-EAST-01"
};

describe("warehouse configuration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads warehouse configuration from the database with env fallback", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{
          default_warehouse_code: "IN-WEST-01",
          checkout_warehouse_code: null,
          supplier_intake_warehouse_code: "IN-SOUTH-01",
          auto_reserve_on_allocate: true,
          default_carrier: "Mithron Field",
          barcode_prefix: "MTH-",
          printer_name: "Label-1",
          label_width_mm: 100,
          require_item_scan: true
        }]
      })
      .mockResolvedValue({
        ok: true,
        json: async () => [{ code: "IN-WEST-01", name: "West" }]
      }));

    const config = await getWarehouseConfiguration(env);
    expect(config.defaultWarehouseCode).toBe("IN-WEST-01");
    expect(config.checkoutWarehouseCode).toBe("IN-WEST-01");
    expect(config.supplierIntakeWarehouseCode).toBe("IN-SOUTH-01");
    expect(config.autoReserveOnAllocate).toBe(false);
    expect(config.stockDeductionTrigger).toBe("dispatched");
    expect(config.barcodePrefix).toBe("MTH-");
  });

  it("falls back to env default warehouse when configuration row is missing", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValue({
        ok: true,
        json: async () => [{ code: "IN-EAST-01", name: "East" }]
      }));

    await expect(getDefaultWarehouseCode(env)).resolves.toBe("IN-EAST-01");
  });

  it("falls back to env default warehouse when configuration fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    await expect(getDefaultWarehouseCode(env)).resolves.toBe("IN-EAST-01");
  });

  it("parses warehouse configuration form data", () => {
    const formData = new FormData();
    formData.set("default_warehouse_code", "IN-WEST-01");
    formData.set("checkout_warehouse_code", "IN-EAST-01");
    formData.set("supplier_intake_warehouse_code", "IN-SOUTH-01");
    formData.set("stock_deduction_trigger", "packed");
    formData.set("default_carrier", "Mithron Field");
    formData.set("barcode_prefix", "MTH-");
    formData.set("printer_name", "Pack-Printer");
    formData.set("label_width_mm", "80");
    formData.set("require_item_scan", "on");

    expect(parseWarehouseConfigurationFormData(formData)).toEqual({
      defaultWarehouseCode: "IN-WEST-01",
      checkoutWarehouseCode: "IN-EAST-01",
      supplierIntakeWarehouseCode: "IN-SOUTH-01",
      autoReserveOnAllocate: false,
      stockDeductionTrigger: "packed",
      defaultCarrier: "Mithron Field",
      barcodePrefix: "MTH-",
      printerName: "Pack-Printer",
      labelWidthMm: 80,
      requireItemScan: true
    });
  });

  it("deducts stock on fulfillment transition using configurable trigger", () => {
    const actions = source("app/warehouse/actions.ts");
    expect(actions).toContain("shouldDeductFulfillmentStock");
    expect(actions).toContain("applyFulfillmentStockMovements");
    expect(actions).toContain("stockDeductionTrigger");
    expect(actions).not.toContain("reserveOrderStockForAllocation");
  });
});
