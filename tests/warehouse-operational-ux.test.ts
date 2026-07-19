import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("warehouse operational UX maturity", () => {
  it("turns the warehouse dashboard route into an operational control surface", () => {
    const rootPage = source("app/warehouse/page.tsx");
    const page = source("app/warehouse/dashboard/page.tsx");
    const shell = source("components/admin/control-shell.tsx");
    const platformShell = source("components/platform/platform-shell.tsx");

    expect(platformShell).toContain("data-control-plane");
    expect(shell).toContain("AdminMetricGrid");
    expect(shell).toContain("data-control-shell-header");
    expect(rootPage).toContain('redirect("/warehouse/dashboard")');
    expect(page).toContain("data-warehouse-operational-dashboard");
    expect(page).toContain("Dispatched Today");
    expect(page).toContain('label: "Received"');
    expect(page).toContain('label: "Picking"');
    expect(page).toContain('href: "/warehouse/orders"');
    expect(page).toContain('href: "/warehouse/fulfillment"');
    expect(page).not.toContain("EnterpriseRealtimePanel");
    expect(page).not.toContain("/warehouse/inventory");
  });

  it("keeps orders focused on open, dispatch, and cancel actions", () => {
    const ordersPage = source("app/warehouse/orders/page.tsx");
    const queueTable = source("components/warehouse/warehouse-order-queue-table.tsx");
    const labels = source("lib/warehouse/operational-labels.ts");

    expect(ordersPage).toContain("cancelWarehouseOrderFormAction");
    expect(ordersPage).toContain("dispatchWarehouseOrderFormAction");
    expect(ordersPage).toContain('href: "/warehouse/fulfillment"');
    expect(ordersPage).toContain('label: "Received"');
    expect(ordersPage).toContain('label: "Picking"');
    expect(queueTable).toContain("/warehouse/fulfillment/");
    expect(queueTable).toContain("OperationalMoreActions");
    expect(queueTable).toContain("Cancel & Delete Order");
    expect(queueTable).toContain("requireTypedText={order.orderNumber}");
    expect(queueTable).toContain("Dispatch");
    expect(queueTable).not.toContain("Reserve Stock");
    expect(queueTable).not.toContain("/warehouse/picking");
    expect(queueTable).not.toContain(">Priority<");
    expect(queueTable).not.toContain(">Payment<");
    expect(labels).toContain('pending: "Received"');
    expect(labels).toContain('packing: "Picking"');
  });

  it("centralizes dispatch in a compact fulfillment detail", () => {
    const fulfillmentPage = source("app/warehouse/fulfillment/page.tsx");
    const fulfillmentDetail = source("app/warehouse/fulfillment/[id]/page.tsx");
    const productDetail = source("app/warehouse/fulfillment/[id]/products/[itemId]/page.tsx");
    const detailComponent = source("components/warehouse/warehouse-fulfillment-detail.tsx");
    const actions = source("app/warehouse/actions.ts");

    expect(fulfillmentPage).toContain("data-warehouse-fulfillment-route");
    expect(fulfillmentDetail).toContain("dispatchWarehouseOrderFormAction");
    expect(fulfillmentDetail).not.toContain("receiveWarehouseOrderFormAction");
    expect(detailComponent).not.toContain("Mark Received");
    expect(detailComponent).not.toContain("Timeline");
    expect(detailComponent).not.toContain("Priority");
    expect(detailComponent).not.toContain("paymentStatus");
    expect(detailComponent).toContain("Dispatch");
    expect(detailComponent).toContain("EMPLOYEE_PROGRESS_STEPS");
    expect(detailComponent).toContain("OperationalMoreActions");
    expect(productDetail).toContain("Product to dispatch");
    expect(productDetail).toContain("dispatchWarehouseOrderFormAction");
    expect(productDetail).toContain("canDispatchOrder");

    // Dispatch reuses only active shipments and skips redundant fulfillment advance.
    expect(actions).toContain('activeShipmentStatuses = ["pending", "reserved", "packed", "ready_for_pickup"]');
    expect(actions).not.toContain("?? shipments[0]");
    expect(actions).toContain('fulfillment !== "dispatched" && fulfillment !== "delivered"');
  });

  it("shows dispatch history instead of mixed activity feeds", () => {
    const activityPage = source("app/warehouse/activity/page.tsx");

    expect(activityPage).toContain("Dispatch History");
    expect(activityPage).toContain("Dispatched At");
    expect(activityPage).toContain("Tracking #");
    expect(activityPage).not.toContain("activityLogs");
    expect(activityPage).not.toContain("/warehouse/movements");
  });
});
