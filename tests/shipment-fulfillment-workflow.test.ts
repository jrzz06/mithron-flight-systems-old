import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertShipmentTransition,
  buildShipmentCreateWorkflowFromFormData,
  buildShipmentTimelineRecord,
  buildShipmentUpdateWorkflowFromFormData,
  deriveOrderFulfillmentStatusFromShipments,
  validateShipmentItemsAgainstOrder
} from "@/services/shipments";
import { deleteAdminRecord, updateAdminRecord } from "@/services/admin-actions";

function formData(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

describe("shipment persistence and fulfillment lifecycle", () => {
  it("normalizes shipment creation input with partial, variant-aware shipment items", () => {
    const input = buildShipmentCreateWorkflowFromFormData(formData({
      order_id: "11111111-1111-1111-1111-111111111111",
      warehouse_id: " IN-WEST-01 ",
      carrier_name: "Mithron Field",
      tracking_number: " MTH-100 ",
      notes: "First carton",
      shipment_items: "[{\"orderItemId\":\"22222222-2222-2222-2222-222222222222\",\"productId\":\"source-agri-kisan-drone-small-8-liter\",\"variantId\":\"base\",\"quantity\":1}]",
      change_summary: "Create shipment"
    }));

    expect(input).toEqual({
      orderId: "11111111-1111-1111-1111-111111111111",
      warehouseId: "IN-WEST-01",
      carrierName: "Mithron Field",
      trackingNumber: "MTH-100",
      notes: "First carton",
      items: [{
        orderItemId: "22222222-2222-2222-2222-222222222222",
        productId: "source-agri-kisan-drone-small-8-liter",
        variantId: "base",
        quantity: 1
      }],
      changeSummary: "Create shipment"
    });
  });

  it("validates shipment lifecycle transitions server-side", () => {
    expect(assertShipmentTransition("pending", "reserved")).toBe("reserved");
    expect(assertShipmentTransition("reserved", "packed")).toBe("packed");
    expect(assertShipmentTransition("pending", "packed")).toBe("packed");
    expect(assertShipmentTransition("packed", "ready_for_pickup")).toBe("ready_for_pickup");
    expect(assertShipmentTransition("packed", "shipped")).toBe("shipped");
    expect(assertShipmentTransition("ready_for_pickup", "shipped")).toBe("shipped");
    expect(assertShipmentTransition("shipped", "in_transit")).toBe("in_transit");
    expect(assertShipmentTransition("in_transit", "delivered")).toBe("delivered");
    expect(assertShipmentTransition("delivered", "returned")).toBe("returned");
    expect(assertShipmentTransition("packed", "damaged")).toBe("damaged");
    expect(assertShipmentTransition("shipped", "damaged")).toBe("damaged");

    expect(() => assertShipmentTransition("pending", "delivered")).toThrow("Invalid shipment transition pending -> delivered.");
    expect(() => assertShipmentTransition("damaged", "shipped")).toThrow("Invalid shipment transition damaged -> shipped.");
    expect(() => assertShipmentTransition("returned", "shipped")).toThrow("Invalid shipment transition returned -> shipped.");
  });

  it("builds immutable shipment timeline rows", () => {
    expect(buildShipmentTimelineRecord({
      shipmentId: "33333333-3333-3333-3333-333333333333",
      eventType: "shipment.created",
      previousStatus: null,
      nextStatus: "pending",
      notes: "Created from fulfillment queue",
      actorUserId: "00000000-0000-0000-0000-000000000001",
      at: "2026-05-24T10:00:00.000Z"
    })).toEqual({
      shipment_id: "33333333-3333-3333-3333-333333333333",
      event_type: "shipment.created",
      previous_status: null,
      next_status: "pending",
      notes: "Created from fulfillment queue",
      actor_user_id: "00000000-0000-0000-0000-000000000001",
      created_at: "2026-05-24T10:00:00.000Z"
    });
  });

  it("supports multiple shipments without over-shipping an order item", () => {
    const orderItems = [
      { id: "item-1", product_slug: "source-agri-kisan-drone-small-8-liter", sku: "AG-8L-BASE", quantity: 3 }
    ];
    const existingShipmentItems = [
      { order_item_id: "item-1", quantity: 1 }
    ];

    expect(validateShipmentItemsAgainstOrder(orderItems, existingShipmentItems, [{
      orderItemId: "item-1",
      productId: "source-agri-kisan-drone-small-8-liter",
      variantId: "base",
      quantity: 2
    }])).toHaveLength(1);

    expect(() => validateShipmentItemsAgainstOrder(orderItems, existingShipmentItems, [{
      orderItemId: "item-1",
      productId: "source-agri-kisan-drone-small-8-liter",
      variantId: "base",
      quantity: 3
    }])).toThrow("Shipment quantity exceeds remaining order quantity for item item-1.");
  });

  it("derives order fulfillment status from shipment coverage and statuses", () => {
    const orderItems = [
      { id: "item-1", quantity: 2 },
      { id: "item-2", quantity: 1 }
    ];

    expect(deriveOrderFulfillmentStatusFromShipments(orderItems, [], [])).toBe("pending");
    expect(deriveOrderFulfillmentStatusFromShipments(orderItems, [{ order_item_id: "item-1", quantity: 1 }], [{ shipment_status: "packed" }])).toBe("processing");
    expect(deriveOrderFulfillmentStatusFromShipments(orderItems, [
      { order_item_id: "item-1", quantity: 2 },
      { order_item_id: "item-2", quantity: 1 }
    ], [{ shipment_status: "delivered" }])).toBe("delivered");
    expect(deriveOrderFulfillmentStatusFromShipments(orderItems, [{ order_item_id: "item-1", quantity: 2 }], [{ shipment_status: "failed" }])).toBe("cancelled");
    expect(deriveOrderFulfillmentStatusFromShipments([{ id: "item-1", quantity: 2 }], [{ order_item_id: "item-1", quantity: 2 }], [{ shipment_status: "damaged" }])).toBe("returned");
  });

  it("normalizes shipment status update forms", () => {
    expect(buildShipmentUpdateWorkflowFromFormData(formData({
      shipment_id: "33333333-3333-3333-3333-333333333333",
      shipment_status: "damaged",
      carrier_name: "Mithron Field",
      tracking_number: "MTH-101",
      notes: "Damage found during handling",
      change_summary: "Mark shipment damaged"
    }))).toMatchObject({
      shipmentId: "33333333-3333-3333-3333-333333333333",
      shipmentStatus: "damaged",
      carrierName: "Mithron Field",
      trackingNumber: "MTH-101",
      notes: "Damage found during handling",
      changeSummary: "Mark shipment damaged"
    });
  });

  it("adds additive shipment schema with RLS, foreign keys, indexes, and realtime readiness", () => {
    const migrationPath = join(process.cwd(), "supabase", "migrations", "20260524000600_shipments_fulfillment_lifecycle.sql");
    const hardeningMigrationPath = join(process.cwd(), "supabase", "migrations", "20260524001000_shipment_operational_hardening.sql");
    expect(existsSync(migrationPath)).toBe(true);
    expect(existsSync(hardeningMigrationPath)).toBe(true);
    const sql = `${readFileSync(migrationPath, "utf8")}\n${readFileSync(hardeningMigrationPath, "utf8")}`.toLowerCase();

    for (const expected of [
      "create table if not exists public.shipments",
      "order_id uuid not null references public.orders(id)",
      "shipment_number text not null unique",
      "shipment_status text not null default 'pending'",
      "'reserved'",
      "warehouse_id text not null",
      "carrier_name text",
      "tracking_number text",
      "shipped_at timestamptz",
      "delivered_at timestamptz",
      "failed_at timestamptz",
      "damaged_at timestamptz",
      "returned_at timestamptz",
      "actor_user_id uuid references auth.users(id)",
      "create table if not exists public.shipment_items",
      "shipment_id uuid not null references public.shipments(id)",
      "order_item_id uuid not null references public.order_items(id)",
      "product_id text not null references public.mithron_products(slug)",
      "variant_id text",
      "quantity integer not null check (quantity > 0)",
      "create table if not exists public.shipment_timeline",
      "event_type text not null",
      "previous_status text",
      "next_status text not null",
      "alter table public.shipments enable row level security",
      "alter table public.shipment_items enable row level security",
      "alter table public.shipment_timeline enable row level security",
      "alter publication supabase_realtime add table public.shipments",
      "alter publication supabase_realtime add table public.shipment_timeline",
      "inventory_movements_related_shipment_fk"
    ]) {
      expect(sql).toContain(expected);
    }

    expect(sql).toContain("shipments_status_idx");
    expect(sql).toContain("shipment_items_order_item_idx");
    expect(sql).toContain("shipment_timeline_shipment_idx");
  });

  it("wires shipment persistence through admin mutations, warehouse actions, UI, and remote verifier", async () => {
    const adminActions = readFileSync(join(process.cwd(), "services", "admin-actions.ts"), "utf8");
    const shipmentService = readFileSync(join(process.cwd(), "services", "shipments.ts"), "utf8");
    const warehouseActions = readFileSync(join(process.cwd(), "app", "warehouse", "actions.ts"), "utf8");
    const fulfillmentPage = readFileSync(join(process.cwd(), "app", "warehouse", "fulfillment", "page.tsx"), "utf8");
    const fulfillmentDetailPage = readFileSync(join(process.cwd(), "app", "warehouse", "fulfillment", "[id]", "page.tsx"), "utf8");
    const adminSnapshot = readFileSync(join(process.cwd(), "services", "admin.ts"), "utf8");
    const verifier = readFileSync(join(process.cwd(), "tools", "verify-enterprise-remote-workflows.mjs"), "utf8");

    expect(adminActions).toContain("\"shipments\"");
    expect(adminActions).toContain("\"shipment_items\"");
    expect(adminActions).toContain("\"shipment_timeline\"");
    expect(adminActions).toContain("createShipmentRecord");
    expect(adminActions).toContain("createShipmentTimelineRecord");
    expect(shipmentService).toContain("createShipmentWorkflow");
    expect(shipmentService).toContain("updateShipmentWorkflow");
    expect(warehouseActions).toContain("createShipmentFormAction");
    expect(warehouseActions).toContain("updateShipmentLifecycleFormAction");
    expect(warehouseActions).toContain("dispatchWarehouseOrderFormAction");
    expect(fulfillmentPage).toContain("data-warehouse-fulfillment-route");
    expect(fulfillmentDetailPage).toContain("dispatchWarehouseOrderFormAction");
    expect(fulfillmentDetailPage).not.toContain("receiveWarehouseOrderFormAction");
    expect(adminSnapshot).toContain("shipmentTimeline");
    expect(verifier).toContain("shipments");
    expect(verifier).toContain("shipment_timeline");

    await expect(updateAdminRecord(
      "shipment_timeline",
      "id",
      "33333333-3333-3333-3333-333333333333",
      { notes: "mutate timeline" },
      "00000000-0000-0000-0000-000000000001"
    )).rejects.toThrow("Shipment timeline records are immutable.");

    await expect(deleteAdminRecord(
      "shipment_timeline",
      "id",
      "33333333-3333-3333-3333-333333333333",
      "00000000-0000-0000-0000-000000000001"
    )).rejects.toThrow("Shipment timeline records are immutable.");
  });
});
