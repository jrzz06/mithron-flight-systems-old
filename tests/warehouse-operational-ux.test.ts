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
    expect(page).toContain("Dispatched today");
    expect(page).toContain('label: "Received today"');
    expect(page).toContain('label: "Pending"');
    expect(page).toContain("listWarehouseDashboardOpenOrders");
    expect(page).toContain("/warehouse/dashboard/export");
    expect(page).toContain("WarehouseDashboardLiveSync");
    expect(page).toContain('href: "/warehouse/orders"');
    expect(page).toContain('href: "/warehouse/fulfillment"');
    expect(page).not.toContain("EnterpriseRealtimePanel");
    expect(page).not.toContain("/warehouse/inventory");
  });

  it("keeps orders focused on open, dispatch, and delete actions", () => {
    const ordersPage = source("app/warehouse/orders/page.tsx");
    const queueTable = source("components/warehouse/warehouse-order-queue-table.tsx");
    const labels = source("lib/warehouse/operational-labels.ts");

    expect(ordersPage).toContain("cancelWarehouseOrderFormAction");
    expect(ordersPage).toContain("dispatchWarehouseOrderFormAction");
    expect(ordersPage).toContain("getWarehouseDashboardOrderKpis");
    expect(ordersPage).toContain('href: "/warehouse/fulfillment"');
    expect(ordersPage).toContain("/warehouse/activity?operation_status=success");
    expect(ordersPage).toContain('label: "Received today"');
    expect(ordersPage).toContain('label: "Pending"');
    expect(ordersPage).toContain("WarehouseOpsLiveSync");
    expect(ordersPage).not.toContain("countByStep");
    expect(queueTable).toContain("WarehouseOpenOrderLink");
    expect(source("components/warehouse/warehouse-open-order-link.tsx")).toContain("/warehouse/fulfillment/");
    expect(queueTable).toContain("OperationalMoreActions");
    expect(queueTable).toContain("Delete order");
    expect(queueTable).toContain("requireTypedText={order.orderNumber}");
    expect(queueTable).toContain("Dispatch");
    expect(queueTable).toContain("confirmMessage={`Dispatch order ${order.orderNumber}?`}");
    expect(queueTable).toContain('confirmLabel="Dispatch"');
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
    const navMetrics = source("services/nav-metrics.ts");
    const adminService = source("services/admin.ts");

    expect(fulfillmentPage).toContain("data-warehouse-fulfillment-route");
    expect(fulfillmentPage).toContain("getWarehouseDashboardOrderKpis");
    expect(fulfillmentPage).toContain("RECEIVED_FULFILLMENT_STATUSES");
    expect(fulfillmentPage).toContain("/warehouse/activity?operation_status=success");
    expect(fulfillmentPage).not.toContain('["pending", ...RECEIVED_FULFILLMENT_STATUSES]');
    expect(fulfillmentPage).not.toContain('activeStatuses = ["pending"');
    expect(fulfillmentDetail).toContain("dispatchWarehouseOrderFormAction");
    expect(fulfillmentDetail).toContain("/warehouse/activity?operation_status=success");
    expect(fulfillmentDetail).not.toContain("receiveWarehouseOrderFormAction");
    expect(detailComponent).not.toContain("Mark Received");
    expect(detailComponent).not.toContain("Timeline");
    expect(detailComponent).not.toContain("Priority");
    expect(detailComponent).toContain("paymentLabel");
    expect(detailComponent).toContain("Dispatch");
    expect(detailComponent).toContain("confirmMessage={`Dispatch order ${orderRow.orderNumber}?`}");
    expect(detailComponent).toContain("Customer details");
    expect(detailComponent).toContain("View product");
    expect(detailComponent).toContain("max-w-5xl");
    expect(detailComponent).toContain("data-warehouse-product-preview");
    expect(detailComponent).toContain("OperationalMoreActions");
    expect(detailComponent).not.toContain("fixed inset");
    expect(detailComponent).not.toContain("z-50");
    expect(productDetail).toContain("Product to dispatch");
    expect(productDetail).toContain("dispatchWarehouseOrderFormAction");
    expect(productDetail).toContain("canDispatchOrder");
    expect(productDetail).toContain("confirmMessage={`Dispatch order ${orderNumber}?`}");
    expect(navMetrics).toContain("getWarehouseDashboardOrderKpis");
    expect(navMetrics).toContain("fulfillmentPending: kpis.picking");
    expect(navMetrics).not.toContain("fulfillment_status=in.(pending,packing)");
    expect(adminService).toContain("fulfillment_status=in.(dispatched,delivered)");
    expect(adminService).toContain("receivedToday");
    expect(adminService).not.toContain("fulfillment_status=in.(shipped,delivered)");

    // Dispatch reuses only active shipments and skips redundant fulfillment advance.
    expect(actions).toContain('activeShipmentStatuses = ["pending", "reserved", "packed", "ready_for_pickup"]');
    expect(actions).not.toContain("?? shipments[0]");
    expect(actions).toContain('fulfillment !== "dispatched" && fulfillment !== "delivered"');
    expect(actions).toContain('revalidatePath("/warehouse/activity")');
    expect(actions).toContain('revalidatePath("/admin")');
    expect(actions).toContain('input.shipmentStatus === "delivered" ? "delivered" : "dispatched"');
  });

  it("shows dispatch history instead of mixed activity feeds", () => {
    const activityPage = source("app/warehouse/activity/page.tsx");
    const opsQueries = source("services/warehouse-ops-queries.ts");

    expect(activityPage).toContain("Dispatch History");
    expect(activityPage).toContain("Dispatched at");
    expect(activityPage).toContain("Tracking #");
    expect(activityPage).toContain("listWarehouseHistoryOrders");
    expect(activityPage).toContain("WarehouseOpsLiveSync");
    expect(activityPage).toContain("OperationalFeedback");
    expect(activityPage).toContain("operation_status");
    expect(activityPage).not.toContain("activityLogs");
    expect(activityPage).not.toContain("/warehouse/movements");
    expect(opsQueries).toContain("DISPATCHED_STATUSES");
    expect(opsQueries).toContain('fulfillment_status=in.(${DISPATCHED_STATUSES})');
    expect(opsQueries).toContain("order=updated_at.desc");
  });
});
