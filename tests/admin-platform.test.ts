import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getAdminDashboardSnapshot,
  getCmsWorkspaceSnapshot,
  getMediaLibrarySnapshot,
  getOperationsSnapshot,
  getProductManagerSnapshot,
  getWarehouseSnapshot
} from "@/services/admin";
import { getSupabaseAdminConfig } from "@/lib/env";

const root = process.cwd();

describe("enterprise admin platform", () => {
  it("exposes the protected admin, product, warehouse, and staff route surface", () => {
    const expectedRoutes = [
      "app/auth/callback/route.ts",
      "app/admin/layout.tsx",
      "app/admin/products/page.tsx",
      "app/admin/inventory/page.tsx",
      "app/admin/audit/page.tsx",
      "app/admin/orders/page.tsx",
      "app/admin/settings/page.tsx",
      "app/warehouse/orders/page.tsx",
      "app/warehouse/fulfillment/page.tsx",
      "app/warehouse/fulfillment/[id]/page.tsx",
      "app/warehouse/activity/page.tsx",
      "app/operations/page.tsx",
      "app/operations/deployments/page.tsx",
      "app/operations/notifications/page.tsx",
      "app/operations/tasks/page.tsx"
    ];

    for (const route of expectedRoutes) {
      expect(existsSync(join(root, route))).toBe(true);
    }
  });

  it("keeps admin mutations behind server-side service-role configuration", () => {
    const envSource = readFileSync(join(root, "lib", "env.ts"), "utf8");
    const actionsSource = readFileSync(join(root, "services", "admin-actions.ts"), "utf8");

    expect(getSupabaseAdminConfig({})).toMatchObject({ configured: false });
    expect(envSource).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(actionsSource).toContain("assertSupabaseAdminConfig");
    expect(actionsSource).toContain("insertAuditLog");
  });

  it("returns honest blocked snapshots when live Supabase admin credentials are unavailable", async () => {
    const [dashboard, cms, media, products, warehouse, operations] = await Promise.all([
      getAdminDashboardSnapshot({}),
      getCmsWorkspaceSnapshot({}),
      getMediaLibrarySnapshot({}),
      getProductManagerSnapshot({}),
      getWarehouseSnapshot({}),
      getOperationsSnapshot({})
    ]);

    expect(dashboard.status).toBe("BLOCKED");
    expect(cms.status).toBe("BLOCKED");
    expect(media.status).toBe("BLOCKED");
    expect(products.status).toBe("BLOCKED");
    expect(warehouse.status).toBe("BLOCKED");
    expect(operations.status).toBe("BLOCKED");
  });
});
