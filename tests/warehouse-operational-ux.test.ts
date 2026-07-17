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
    expect(page).toContain('href: "/warehouse/orders"');
    expect(page).toContain('href: "/warehouse/fulfillment"');
    expect(page).not.toContain("EnterpriseRealtimePanel");
    expect(page).not.toContain("/warehouse/inventory");
  });

  it("keeps orders focused on open and cancel actions", () => {
    const ordersPage = source("app/warehouse/orders/page.tsx");
    const queueTable = source("components/warehouse/warehouse-order-queue-table.tsx");

    expect(ordersPage).toContain("cancelWarehouseOrderFormAction");
    expect(ordersPage).toContain('href: "/warehouse/fulfillment"');
    expect(queueTable).toContain("/warehouse/fulfillment/");
    expect(queueTable).toContain("OperationalMoreActions");
    expect(queueTable).toContain("Cancel order");
    expect(queueTable).not.toContain("Reserve Stock");
    expect(queueTable).not.toContain("/warehouse/picking");
  });

  it("centralizes dispatch in a compact fulfillment detail", () => {
    const fulfillmentPage = source("app/warehouse/fulfillment/page.tsx");
    const fulfillmentDetail = source("app/warehouse/fulfillment/[id]/page.tsx");
    const productDetail = source("app/warehouse/fulfillment/[id]/products/[itemId]/page.tsx");
    const detailComponent = source("components/warehouse/warehouse-fulfillment-detail.tsx");

    expect(fulfillmentPage).toContain("data-warehouse-fulfillment-route");
    expect(fulfillmentDetail).toContain("dispatchWarehouseOrderFormAction");
    expect(fulfillmentDetail).not.toContain("receiveWarehouseOrderFormAction");
    expect(detailComponent).not.toContain("Mark Received");
    expect(detailComponent).not.toContain("Timeline");
    expect(detailComponent).toContain("Dispatch");
    expect(detailComponent).toContain("OperationalMoreActions");
    expect(productDetail).toContain("Product to dispatch");
    expect(productDetail).toContain("dispatchWarehouseOrderFormAction");
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
