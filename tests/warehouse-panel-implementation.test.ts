import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ORDER_FULFILLMENT_STATES,
  assertOrderFulfillmentTransition
} from "@/services/enterprise-admin-forms";
import { canAccessProtectedPath, defaultPathForRole } from "@/lib/auth/access-control";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

function exists(path: string) {
  return existsSync(join(root, path));
}

describe("warehouse panel implementation", () => {
  it("creates a separate warehouse route group with a simplified warehouse sidebar", () => {
    for (const path of [
      "app/warehouse/layout.tsx",
      "app/warehouse/dashboard/page.tsx",
      "app/warehouse/orders/page.tsx",
      "app/warehouse/fulfillment/page.tsx",
      "app/warehouse/fulfillment/[id]/page.tsx",
      "app/warehouse/activity/page.tsx"
    ]) {
      expect(exists(path), `${path} should exist`).toBe(true);
    }

    const layout = source("app/warehouse/layout.tsx");
    const navConfig = source("components/platform/nav-config.ts");
    for (const label of ["Today", "Orders", "Fulfillment", "History"]) {
      expect(navConfig).toContain(label);
    }
    expect(navConfig).toContain("/warehouse/fulfillment");
    expect(navConfig).not.toContain("/warehouse/inventory");
    expect(navConfig).not.toContain("/warehouse/settings");
    expect(layout).toContain("ControlPlaneParallelLayout");
    expect(layout).toContain("data-warehouse-frame");
    expect(navConfig).toContain("export const warehouseNavGroups");
    expect(navConfig).not.toMatch(/warehouseNavGroups[\s\S]*\/admin\//);
  });

  it("keeps warehouse RBAC isolated from admin and sends warehouse users to the dashboard", () => {
    expect(canAccessProtectedPath("warehouse", "/warehouse/dashboard")).toBe(true);
    expect(canAccessProtectedPath("warehouse", "/warehouse/fulfillment")).toBe(true);
    expect(canAccessProtectedPath("warehouse", "/admin/settings")).toBe(false);
    expect(canAccessProtectedPath("warehouse", "/admin/cms")).toBe(false);
    expect(defaultPathForRole("warehouse")).toBe("/warehouse/dashboard");

    const layout = source("app/warehouse/layout.tsx");
    expect(layout).toContain("getCurrentAuthContext");
    expect(layout).toContain("canAccessProtectedPath");
    expect(layout).toContain("ControlPlaneParallelLayout");
    expect(source("app/warehouse/@shell/default.tsx")).toContain("readSessionHandoff");
  });

  it("extends the real order lifecycle without bypassing validation", () => {
    expect(ORDER_FULFILLMENT_STATES).toEqual([
      "pending",
      "packing",
      "dispatched",
      "delivered",
      "returned",
      "cancelled"
    ]);
    expect(assertOrderFulfillmentTransition("pending", "packing")).toBe("packing");
    expect(assertOrderFulfillmentTransition("packing", "dispatched")).toBe("dispatched");
    expect(assertOrderFulfillmentTransition("dispatched", "delivered")).toBe("delivered");
    expect(() => assertOrderFulfillmentTransition("pending", "dispatched")).toThrow(
      /Invalid order fulfillment transition/
    );

    const migration = source("supabase/migrations/20260526000400_warehouse_order_lifecycle_expansion.sql");
    expect(migration).toContain("'picked'");
    expect(migration).toContain("'ready_to_dispatch'");
    expect(migration).toContain("orders_fulfillment_transition_guard");
  });

  it("wires simplified warehouse pages to real Supabase snapshots and server actions", () => {
    const pages = {
      dashboard: source("app/warehouse/dashboard/page.tsx"),
      fulfillment: source("app/warehouse/fulfillment/page.tsx"),
      fulfillmentDetail: source("app/warehouse/fulfillment/[id]/page.tsx"),
      productDetail: source("app/warehouse/fulfillment/[id]/products/[itemId]/page.tsx"),
      activity: source("app/warehouse/activity/page.tsx"),
      actions: source("app/warehouse/actions.ts")
    };

    for (const [key, page] of Object.entries(pages)) {
      if (key === "actions") continue;
      const usesSnapshotOrDetail =
        page.includes("getWarehouseSnapshot") || page.includes("loadWarehouseOrderDetail");
      expect(usesSnapshotOrDetail).toBe(true);
      expect(page).not.toMatch(/\bmock\b|\bdemo data\b/i);
    }

    expect(pages.dashboard).toContain("data-warehouse-operational-dashboard");
    expect(pages.dashboard).toContain("/warehouse/fulfillment");
    expect(pages.fulfillment).toContain("data-warehouse-fulfillment-route");
    expect(pages.fulfillmentDetail).toContain("dispatchWarehouseOrderFormAction");
    expect(pages.fulfillmentDetail).not.toContain("receiveWarehouseOrderFormAction");
    expect(pages.fulfillmentDetail).toContain("cancelWarehouseOrderFormAction");
    expect(pages.productDetail).toContain("dispatchWarehouseOrderFormAction");
    expect(pages.activity).toContain("data-warehouse-activity-timeline");
    expect(pages.activity).toContain("Dispatched At");
    expect(pages.actions).toContain("receiveWarehouseOrderFormAction");
    expect(pages.actions).toContain("cancelWarehouseOrderFormAction");
  });
});
