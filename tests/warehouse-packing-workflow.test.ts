import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  matchPackingItemScan,
  matchPickingScan,
  normalizeBarcodeScan
} from "@/services/warehouse-barcode";
import {
  assertPackingChecklistComplete,
  buildPackingChecklistFromFormData,
  buildRemainingShipmentItems
} from "@/services/warehouse-packing";
import { parseWarehouseStationConfig } from "@/services/warehouse-station-config";

function formData(entries: Record<string, string | string[]>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    if (Array.isArray(value)) {
      for (const entry of value) data.append(key, entry);
    } else {
      data.set(key, value);
    }
  }
  return data;
}

describe("warehouse packing workflow", () => {
  it("matches picking scans by order number, sku, and prefix", () => {
    const targets = [{
      orderId: "order-1",
      orderNumber: "MTH-20260625-001",
      sku: "HPC-3-POWER-CUBE",
      productSlug: "hpc-3-power-cube",
      warehouseCode: "IN-WEST-01"
    }];

    expect(matchPickingScan("MTH-20260625-001", targets)?.orderId).toBe("order-1");
    expect(matchPickingScan("HPC-3-POWER-CUBE", targets)?.kind).toBe("sku");
    expect(matchPickingScan("MTH-HPC-3-POWER-CUBE", targets, "MTH-")?.kind).toBe("sku");
    expect(normalizeBarcodeScan(" hpc-3 ")).toBe("HPC-3");
  });

  it("validates packing checklist requirements", () => {
    const orderItems = [
      { id: "line-1", product_slug: "alpha", sku: "ALPHA-1", quantity: 1 },
      { id: "line-2", product_slug: "beta", sku: "BETA-2", quantity: 2 }
    ];

    expect(() => assertPackingChecklistComplete({
      orderId: "order-1",
      verifiedItemIds: ["line-1"],
      slipConfirmed: true,
      packingNote: "Packed with care"
    }, orderItems)).toThrow(/Verify every line item/);

    expect(() => assertPackingChecklistComplete({
      orderId: "order-1",
      verifiedItemIds: ["line-1", "line-2"],
      slipConfirmed: false,
      packingNote: "Packed with care"
    }, orderItems)).toThrow(/Confirm the packing slip/);

    expect(assertPackingChecklistComplete({
      orderId: "order-1",
      verifiedItemIds: ["line-1", "line-2"],
      slipConfirmed: true,
      packingNote: "Packed with care"
    }, orderItems)).toBeUndefined();
  });

  it("builds remaining shipment items for multi-item orders", () => {
    const orderItems = [
      { id: "line-1", product_slug: "alpha", sku: "ALPHA-1", quantity: 2 },
      { id: "line-2", product_slug: "beta", sku: "BETA-2", quantity: 1 }
    ];
    const existingShipmentItems = [{ order_item_id: "line-1", quantity: 1 }];

    expect(buildRemainingShipmentItems(orderItems, existingShipmentItems)).toEqual([
      { orderItemId: "line-1", productId: "alpha", variantId: null, quantity: 1 },
      { orderItemId: "line-2", productId: "beta", variantId: null, quantity: 1 }
    ]);
  });

  it("maps packing form data into checklist and multi-item shipment fields", () => {
    const checklist = buildPackingChecklistFromFormData(formData({
      order_id: "order-1",
      verified_item_id: ["line-1", "line-2"],
      slip_confirmed: "on",
      packing_note: "Double boxed"
    }));

    expect(checklist.verifiedItemIds).toEqual(["line-1", "line-2"]);
    expect(matchPackingItemScan("BETA-2", [{
      orderItemId: "line-2",
      orderId: "order-1",
      orderNumber: "MTH-1",
      sku: "BETA-2",
      productSlug: "beta"
    }])?.orderItemId).toBe("line-2");
  });

  it("wires unified fulfillment actions to shipment workflow services", () => {
    const actions = readFileSync(join(process.cwd(), "app/warehouse/actions.ts"), "utf8");
    const fulfillmentDetail = readFileSync(join(process.cwd(), "app/warehouse/fulfillment/[id]/page.tsx"), "utf8");
    const shipments = readFileSync(join(process.cwd(), "services/shipments.ts"), "utf8");

    expect(actions).toContain("receiveWarehouseOrderFormAction");
    expect(actions).toContain("dispatchWarehouseOrderFormAction");
    expect(actions).toContain("completeWarehousePackingFormAction");
    expect(fulfillmentDetail).toContain("WarehouseFulfillmentDetail");
    expect(shipments).toContain("initialStatus");
    expect(parseWarehouseStationConfig({ printerName: "Zebra", labelWidthMm: 80 }).labelWidthMm).toBe(80);
  });
});
