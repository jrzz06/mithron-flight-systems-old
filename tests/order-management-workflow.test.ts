import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildOrderCreateWorkflowFromFormData,
  buildOrderLifecycleUpdateFromFormData,
  assertOrderFulfillmentTransition
} from "@/services/enterprise-admin-forms";
import { appendOrderTimeline, buildOrderTimelineEntry, buildWarehouseAssignmentUpdate, syncOrderStatusFromFulfillment } from "@/services/orders";

function formData(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

describe("enterprise order management workflow", () => {
  it("normalizes order creation form data into order and order_items persistence input", () => {
    expect(buildOrderCreateWorkflowFromFormData(formData({
      customer_email: "ops@example.com",
      order_items: "[{\"productSlug\":\"source-agri-kisan-drone-small-8-liter\",\"quantity\":2,\"sku\":\"AG-8L-BASE\",\"bundleId\":\"source-listing\"}]",
      mission_profile: "agriculture",
      region: "IN-WEST",
      metadata: "{\"source\":\"admin\"}",
      status: "confirmed",
      payment_status: "not_required",
      fulfillment_status: "processing",
      currency: "INR",
      note: "Create deployment order",
      change_summary: "Admin order capture"
    }))).toMatchObject({
      checkout: {
        customerEmail: "ops@example.com",
        missionProfile: "agriculture",
        region: "IN-WEST",
        items: [{
          productSlug: "source-agri-kisan-drone-small-8-liter",
          quantity: 2,
          sku: "AG-8L-BASE",
          bundleId: "source-listing"
        }],
        metadata: { source: "admin" }
      },
      status: "confirmed",
      paymentStatus: "not_required",
      fulfillmentStatus: "processing",
      currency: "INR",
      note: "Create deployment order",
      changeSummary: "Admin order capture"
    });
  });

  it("normalizes lifecycle transitions with shipment tracking and timeline entries", () => {
    const update = buildOrderLifecycleUpdateFromFormData(formData({
      order_id: "11111111-1111-1111-1111-111111111111",
      status: "active",
      payment_status: "not_required",
      fulfillment_status: "packed",
      shipment_tracking: "{\"carrier\":\"Mithron Field\",\"tracking\":\"MTH-100\"}",
      note: "Packed for field dispatch"
    }));

    const timeline = appendOrderTimeline([], buildOrderTimelineEntry({
      status: update.status ?? "active",
      event: "order.lifecycle_update",
      note: update.note,
      actorId: "00000000-0000-0000-0000-000000000001",
      metadata: { fulfillment_status: update.fulfillmentStatus },
      at: "2026-05-24T10:00:00.000Z"
    }));

    expect(update).toMatchObject({
      orderId: "11111111-1111-1111-1111-111111111111",
      status: "active",
      fulfillmentStatus: "packed",
      shipmentTracking: {
        carrier: "Mithron Field",
        tracking: "MTH-100"
      }
    });
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({
      event: "order.lifecycle_update",
      status: "active",
      note: "Packed for field dispatch"
    });
  });

  it("rejects invalid, duplicate, and skipped fulfillment lifecycle transitions", () => {
    expect(assertOrderFulfillmentTransition("pending", "processing")).toBe("processing");
    expect(assertOrderFulfillmentTransition("processing", "picked")).toBe("picked");
    expect(assertOrderFulfillmentTransition("picked", "packed")).toBe("packed");
    expect(assertOrderFulfillmentTransition("packed", "ready_to_dispatch")).toBe("ready_to_dispatch");
    expect(assertOrderFulfillmentTransition("ready_to_dispatch", "shipped")).toBe("shipped");
    expect(assertOrderFulfillmentTransition("processing", "packed")).toBe("packed");
    expect(assertOrderFulfillmentTransition("packed", "shipped")).toBe("shipped");
    expect(assertOrderFulfillmentTransition("shipped", "delivered")).toBe("delivered");
    expect(assertOrderFulfillmentTransition("delivered", "returned")).toBe("returned");
    expect(assertOrderFulfillmentTransition("pending", "cancelled")).toBe("cancelled");

    expect(() => assertOrderFulfillmentTransition("pending", "delivered")).toThrow("Invalid order fulfillment transition pending -> delivered.");
    expect(() => assertOrderFulfillmentTransition("packed", "packed")).toThrow("Duplicate order fulfillment transition packed -> packed.");
    expect(() => assertOrderFulfillmentTransition("delivered", "shipped")).toThrow("Invalid order fulfillment transition delivered -> shipped.");
    expect(() => buildOrderLifecycleUpdateFromFormData(formData({
      order_id: "11111111-1111-1111-1111-111111111111",
      fulfillment_status: "teleported"
    }))).toThrow("Order lifecycle fulfillment_status must be one of: pending, processing, picked, packed, ready_to_dispatch, shipped, delivered, returned, cancelled.");
  });

  it("preserves advanced fulfillment when assigning warehouse to a confirmed order", () => {
    expect(buildWarehouseAssignmentUpdate("confirmed", "pending")).toEqual({
      nextStatus: "processing",
      nextFulfillment: "processing"
    });
    expect(buildWarehouseAssignmentUpdate("confirmed", "packed")).toEqual({
      nextStatus: "packed",
      nextFulfillment: "packed"
    });
    expect(syncOrderStatusFromFulfillment("assigned", "packed")).toBe("packed");
    expect(() => buildWarehouseAssignmentUpdate("assigned", "processing")).toThrow(
      "Order cannot be assigned to warehouse from status assigned."
    );
  });

  it("adds a database guard for direct REST fulfillment lifecycle writes", () => {
    const migration = readFileSync(join(process.cwd(), "supabase/migrations/20260524001300_order_fulfillment_governance.sql"), "utf8");

    expect(migration).toContain("create or replace function public.enforce_order_fulfillment_transition()");
    expect(migration).toContain("before insert or update of fulfillment_status on public.orders");
    expect(migration).toContain("Invalid order fulfillment transition");
    expect(migration).toContain("Invalid order fulfillment status");
  });

  it("allows operational workflows to write revision snapshots through the existing audit-safe service path", () => {
    const adminActions = readFileSync(join(process.cwd(), "services/admin-actions.ts"), "utf8");

    expect(adminActions).toContain("contentRevisionPermissions");
    expect(adminActions).toContain("\"orders.write\"");
    expect(adminActions).toContain("\"warehouse.write\"");
    expect(adminActions).toContain("\"audit.read\"");
    expect(adminActions).toContain("\"operations.write\"");
  });

  it("wires admin and warehouse pages to the existing order persistence actions", () => {
    const adminOrdersPage = readFileSync(join(process.cwd(), "app/admin/orders/page.tsx"), "utf8");
    const adminOrdersWorkspace = readFileSync(join(process.cwd(), "components/admin/admin-orders-workspace.tsx"), "utf8");
    const adminOrdersUi = `${adminOrdersPage}\n${adminOrdersWorkspace}`;
    const warehouseOrdersPage = readFileSync(join(process.cwd(), "app/warehouse/orders/page.tsx"), "utf8");
    const operationsOrdersPage = readFileSync(join(process.cwd(), "app/operations/orders/page.tsx"), "utf8");
    const fulfillmentPage = readFileSync(join(process.cwd(), "app/warehouse/fulfillment/page.tsx"), "utf8");
    const fulfillmentDetailPage = readFileSync(join(process.cwd(), "app/warehouse/fulfillment/[id]/page.tsx"), "utf8");

    expect(adminOrdersPage).toContain("updateWarehouseOrderLifecycleFormAction");
    expect(adminOrdersPage).toContain("createShipmentFormAction");
    expect(adminOrdersUi).toContain("data-order-filter-form");
    expect(adminOrdersUi).toContain("data-order-detail-panel");
    expect(adminOrdersUi).toContain("data-inventory-allocation");
    expect(adminOrdersUi).toContain("data-shipment-actions");

    expect(warehouseOrdersPage).toContain("cancelWarehouseOrderFormAction");
    expect(operationsOrdersPage).toContain("createWarehouseOrderFormAction");
    expect(operationsOrdersPage).toContain("updateWarehouseOrderLifecycleFormAction");

    expect(fulfillmentPage).toContain("data-warehouse-fulfillment-route");
    expect(fulfillmentDetailPage).toContain("dispatchWarehouseOrderFormAction");
    expect(fulfillmentDetailPage).not.toContain("receiveWarehouseOrderFormAction");
    expect(adminOrdersUi).toContain("timeline");
    expect(operationsOrdersPage).not.toContain("Shipment tracking JSON");
  });
});
