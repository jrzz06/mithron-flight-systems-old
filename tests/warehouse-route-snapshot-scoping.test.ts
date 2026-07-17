import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("warehouse route snapshot scoping", () => {
  it("keeps warehouse pages on route-scoped Supabase reads instead of one broad snapshot", () => {
    const pages = {
      dashboard: source("app/warehouse/dashboard/page.tsx"),
      orders: source("app/warehouse/orders/page.tsx"),
      fulfillment: source("app/warehouse/fulfillment/page.tsx"),
      activity: source("app/warehouse/activity/page.tsx")
    };

    expect(pages.dashboard).toContain('getWarehouseSnapshot({ scope: "dashboard" })');
    expect(pages.orders).toContain('getWarehouseSnapshot({ scope: "orders" })');
    expect(pages.fulfillment).toContain('getWarehouseSnapshot({ scope: "orders" })');
    expect(pages.activity).toContain('getWarehouseSnapshot({ scope: "orders" })');
  });

  it("defines explicit warehouse snapshot scopes that avoid unrelated table reads", () => {
    const adminService = source("services/admin.ts");

    expect(adminService).toContain("type WarehouseSnapshotScope");
    expect(adminService).toContain("const warehouseSnapshotScopes");
    expect(adminService).toContain('dashboard: new Set(["inventory", "stock", "movements", "orders", "orderItems", "shipments"])');
    expect(adminService).toContain('dispatch: new Set(["shipments", "shipmentItems", "shipmentTimeline", "orders", "orderItems"])');
    expect(adminService).toContain("quantity,created_at&order=created_at.desc&limit=120");
    expect(adminService).not.toContain("quantity_packed");
    expect(adminService).toContain('movements: new Set(["movements"])');
    expect(adminService).toContain('orders: new Set(["products", "inventory", "orders", "orderItems", "shipments"])');
    expect(adminService).toContain("scopeOrderRelations");
    expect(adminService).toContain("order_id=in.(");
    expect(adminService).toContain("cacheControlPlaneRead");
    expect(adminService).toContain("admin-warehouse-snapshot");
    expect(adminService).toContain('activity: new Set(["movements", "shipmentTimeline", "activityLogs"])');
    expect(adminService).toContain("resolveWarehouseSnapshotInput");
    expect(adminService).toMatch(/env:\s*options\s*\?\s*\(options\.env\s*\?\?\s*process\.env\)/);
  });

  it("uses process.env for scoped warehouse snapshots when env is omitted", async () => {
    const { getWarehouseSnapshot } = await import("@/services/admin");
    const hasAdminEnv = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
    const snapshot = await getWarehouseSnapshot({ scope: "dispatch" });

    if (hasAdminEnv) {
      expect(snapshot.status).not.toBe("BLOCKED");
      expect(snapshot.blockedReason ?? "").not.toMatch(/Missing Supabase admin environment/);
    } else {
      expect(snapshot.status).toBe("BLOCKED");
    }
  });

  it("scopes fulfillment and history routes to order snapshots", () => {
    const fulfillment = source("app/warehouse/fulfillment/page.tsx");
    const fulfillmentDetail = source("app/warehouse/fulfillment/[id]/page.tsx");
    const activity = source("app/warehouse/activity/page.tsx");
    const adminOrders = source("app/admin/orders/page.tsx");

    expect(fulfillment).toContain('getWarehouseSnapshot({ scope: "orders" })');
    expect(fulfillmentDetail).toContain('getWarehouseSnapshot({ scope: "orders" })');
    expect(activity).toContain('getWarehouseSnapshot({ scope: "orders" })');
    expect(adminOrders).toMatch(/getWarehouseSnapshot\(\{\s*scope:\s*"orders"/);
    expect(adminOrders).toContain("includeOperatorCounts: false");
  });

  it("keeps dispatch preparation inside the unified fulfillment action", () => {
    const actions = source("app/warehouse/actions.ts");

    expect(actions).toContain("FULFILLMENT_TRANSITION_SEQUENCE");
    expect(actions).toContain("ensurePackedShipmentForOrder");
    expect(actions).toContain("dispatchWarehouseOrderFormAction");
  });
});
