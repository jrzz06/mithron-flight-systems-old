import { describe, expect, it } from "vitest";

import {
  buildOperationalSeedRows,
  parseCliArgs,
  summarizeSeedRows
} from "../tools/seed-operational-readiness-data.mjs";

describe("operational readiness seed tooling", () => {
  it("builds deterministic, idempotent rows for empty operations and warehouse datasets", () => {
    const rows = buildOperationalSeedRows({
      existingWarehouseStockId: "89f8df1b-918e-4f0f-a24d-afe0cb36e6f9"
    });

    expect(summarizeSeedRows(rows)).toMatchObject({
      orders: 1,
      order_items: 1,
      shipments: 1,
      shipment_items: 1,
      shipment_timeline: 1,
      inventory_movements: 1,
      deployment_requests: 1,
      staff_tasks: 1,
      notifications: 1,
      activity_logs: 1
    });

    expect(rows.orders[0]).toMatchObject({
      id: "0b5e0632-11dc-496f-9d7c-625c1aa41101",
      order_number: "PROD-READY-001",
      fulfillment_status: "packed",
      metadata: {
        marker: "production-readiness-seed-v1",
        rollback_safe: true
      }
    });
    expect(rows.order_items[0]).toMatchObject({
      order_id: rows.orders[0].id,
      product_slug: "source-agri-kisan-drone-small-8-liter",
      sku: "PROD-READY-AG-8L"
    });
    expect(rows.shipments[0]).toMatchObject({
      id: "f14563ef-169c-4cf6-9e52-2c649a5359e3",
      order_id: rows.orders[0].id,
      shipment_status: "packed"
    });
    expect(rows.shipment_items[0]).toMatchObject({
      shipment_id: rows.shipments[0].id,
      order_item_id: rows.order_items[0].id
    });
    expect(rows.deployment_requests[0]).toMatchObject({
      status: "pending",
      payload: {
        marker: "production-readiness-seed-v1",
        rollback_safe: true,
        linked_shipment_id: rows.shipments[0].id
      }
    });
    expect(rows.staff_tasks[0]).toMatchObject({
      status: "in_progress",
      related_request_id: rows.deployment_requests[0].id
    });
    expect(rows.inventory_movements[0]).toMatchObject({
      warehouse_stock_id: "89f8df1b-918e-4f0f-a24d-afe0cb36e6f9",
      related_order_id: rows.orders[0].id,
      related_shipment_id: rows.shipments[0].id,
      quantity_delta: -1,
      quantity_before: 18,
      quantity_after: 17
    });
  });

  it("does not fabricate inventory movements without a warehouse stock anchor", () => {
    const rows = buildOperationalSeedRows();
    expect(rows.inventory_movements).toEqual([]);
    expect(rows.shipments).toHaveLength(1);
    expect(rows.deployment_requests).toHaveLength(1);
  });

  it("defaults to dry-run mode", () => {
    expect(parseCliArgs([])).toEqual({ apply: false, json: false });
    expect(parseCliArgs(["--apply", "--json"])).toEqual({ apply: true, json: true });
  });
});
