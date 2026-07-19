import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ORDER_FULFILLMENT_STATES,
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
      fulfillment_status: "packing",
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
      fulfillmentStatus: "packing",
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
      fulfillment_status: "dispatched",
      shipment_tracking: "{\"carrier\":\"Mithron Field\",\"tracking\":\"MTH-100\"}",
      note: "Dispatched for field delivery"
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
      fulfillmentStatus: "dispatched",
      shipmentTracking: {
        carrier: "Mithron Field",
        tracking: "MTH-100"
      }
    });
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({
      event: "order.lifecycle_update",
      status: "active",
      note: "Dispatched for field delivery"
    });
  });

  it("only accepts the simplified pending/packing/dispatched/delivered fulfillment states", () => {
    expect(ORDER_FULFILLMENT_STATES).toEqual(["pending", "packing", "dispatched", "delivered", "returned", "cancelled"]);
  });

  it("walks the full pending -> packing -> dispatched -> delivered -> returned fulfillment lifecycle", () => {
    expect(assertOrderFulfillmentTransition("pending", "packing")).toBe("packing");
    expect(assertOrderFulfillmentTransition("packing", "dispatched")).toBe("dispatched");
    expect(assertOrderFulfillmentTransition("dispatched", "delivered")).toBe("delivered");
    expect(assertOrderFulfillmentTransition("delivered", "returned")).toBe("returned");
    expect(assertOrderFulfillmentTransition("pending", "cancelled")).toBe("cancelled");
    expect(assertOrderFulfillmentTransition("packing", "cancelled")).toBe("cancelled");
  });

  it("rejects invalid, duplicate, skipped, and legacy fulfillment lifecycle transitions", () => {
    expect(() => assertOrderFulfillmentTransition("pending", "dispatched")).toThrow(
      "Invalid order fulfillment transition pending -> dispatched."
    );
    expect(() => assertOrderFulfillmentTransition("packing", "packing")).toThrow(
      "Duplicate order fulfillment transition packing -> packing."
    );
    expect(() => assertOrderFulfillmentTransition("delivered", "dispatched")).toThrow(
      "Invalid order fulfillment transition delivered -> dispatched."
    );
    expect(() => assertOrderFulfillmentTransition("dispatched", "cancelled")).toThrow(
      "Invalid order fulfillment transition dispatched -> cancelled."
    );

    expect(() => buildOrderLifecycleUpdateFromFormData(formData({
      order_id: "11111111-1111-1111-1111-111111111111",
      fulfillment_status: "teleported"
    }))).toThrow("Order lifecycle fulfillment_status must be one of: pending, packing, dispatched, delivered, returned, cancelled.");

    // Legacy pre-simplification literals (processing/picked/packed/ready_to_dispatch/shipped) are no
    // longer valid fulfillment_status values and must be rejected the same way as any unknown string.
    expect(() => buildOrderLifecycleUpdateFromFormData(formData({
      order_id: "11111111-1111-1111-1111-111111111111",
      fulfillment_status: "processing"
    }))).toThrow("Order lifecycle fulfillment_status must be one of: pending, packing, dispatched, delivered, returned, cancelled.");
  });

  it("never leaves a fulfillment state without a legal next move (no dead ends before delivery)", () => {
    // Every non-terminal state must have at least one allowed transition. "returned" and "cancelled"
    // are the only intentional terminal states in the simplified fulfillment machine.
    const terminalStates = new Set(["returned", "cancelled"]);
    for (const state of ORDER_FULFILLMENT_STATES) {
      if (terminalStates.has(state)) continue;
      const reachableStates = ORDER_FULFILLMENT_STATES.filter((next) => next !== state).filter((next) => {
        try {
          assertOrderFulfillmentTransition(state, next);
          return true;
        } catch {
          return false;
        }
      });
      expect(reachableStates.length).toBeGreaterThan(0);
    }

    // The forward-progress path from receipt to delivery must always be unblocked.
    expect(assertOrderFulfillmentTransition("pending", "packing")).toBe("packing");
    expect(assertOrderFulfillmentTransition("packing", "dispatched")).toBe("dispatched");
    expect(assertOrderFulfillmentTransition("dispatched", "delivered")).toBe("delivered");
  });

  it("preserves advanced fulfillment when assigning warehouse to a confirmed order", () => {
    expect(buildWarehouseAssignmentUpdate("confirmed", "pending")).toEqual({
      nextStatus: "processing",
      nextFulfillment: "packing"
    });
    expect(buildWarehouseAssignmentUpdate("confirmed", "dispatched")).toEqual({
      nextStatus: "dispatched",
      nextFulfillment: "dispatched"
    });
    expect(syncOrderStatusFromFulfillment("assigned", "dispatched")).toBe("dispatched");
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
    const adminOrdersFilterBar = readFileSync(join(process.cwd(), "components/admin/orders/admin-orders-filter-bar.tsx"), "utf8");
    const adminOrderDetail = readFileSync(join(process.cwd(), "components/admin/orders/admin-order-detail.tsx"), "utf8");
    const adminOrderDetailPanel = readFileSync(join(process.cwd(), "components/admin/orders/admin-order-detail-panel.tsx"), "utf8");
    const adminOrderProductsSection = readFileSync(join(process.cwd(), "components/admin/orders/admin-order-products-section.tsx"), "utf8");
    const adminOrderActionsRail = readFileSync(join(process.cwd(), "components/admin/orders/admin-order-actions-rail.tsx"), "utf8");
    const adminOrdersUi = [
      adminOrdersPage,
      adminOrdersWorkspace,
      adminOrdersFilterBar,
      adminOrderDetail,
      adminOrderDetailPanel,
      adminOrderProductsSection,
      adminOrderActionsRail
    ].join("\n");
    const warehouseOrdersPage = readFileSync(join(process.cwd(), "app/warehouse/orders/page.tsx"), "utf8");
    const operationsOrdersPage = readFileSync(join(process.cwd(), "app/operations/orders/page.tsx"), "utf8");
    const fulfillmentPage = readFileSync(join(process.cwd(), "app/warehouse/fulfillment/page.tsx"), "utf8");
    const fulfillmentDetailPage = readFileSync(join(process.cwd(), "app/warehouse/fulfillment/[id]/page.tsx"), "utf8");

    expect(adminOrdersPage).toContain("updateWarehouseOrderLifecycleFormAction");
    expect(adminOrdersPage).toContain("createShipmentFormAction");
    expect(adminOrdersUi).toContain("data-order-filter-form");
    expect(adminOrdersUi).toContain("data-order-detail-panel");
    expect(adminOrdersUi).toContain("data-inventory-allocation");
    expect(adminOrdersUi).toContain("data-admin-order-actions-rail");

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
