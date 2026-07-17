import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readWorkspaceFile(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("admin realtime browser contract", () => {
  it("registers orders and inventory live sync through useAdminLiveResource", () => {
    const ordersLiveSync = readWorkspaceFile("components/admin/orders-live-sync.tsx");
    const inventoryLiveSync = readWorkspaceFile("components/admin/admin-inventory-live-sync.tsx");

    expect(ordersLiveSync).toContain("useAdminLiveResource");
    expect(ordersLiveSync).toContain('"orders"');
    expect(inventoryLiveSync).toContain("useAdminLiveResource");
    expect(inventoryLiveSync).toContain('"inventory"');
  });

  it("reconciles admin collections on replay and visibility without router.refresh", () => {
    const provider = readWorkspaceFile("components/admin/realtime/admin-realtime-provider.tsx");
    const controlPlaneHook = readWorkspaceFile("components/control-plane/use-control-plane-live-sync.ts");

    expect(provider).toContain("onReplayRequired");
    expect(provider).toContain("reconcileResources");
    expect(provider).toContain("visibilitychange");
    expect(provider).toContain("/api/admin/live/");
    expect(controlPlaneHook).toContain("isAdminNoRefresh");
    expect(controlPlaneHook).toContain("preferReconcile: isAdminNoRefresh");
    expect(controlPlaneHook).toContain("routerRefresh: isAdminNoRefresh ? undefined");
    expect(controlPlaneHook).toContain("Admin scope never calls router.refresh()");
  });

  it("documents that admin live sync must not trigger ?_rsc= navigation refreshes", () => {
    const coordinator = readWorkspaceFile("lib/control-plane/shared-live-sync-coordinator.ts");
    const provider = readWorkspaceFile("components/admin/realtime/admin-realtime-provider.tsx");
    const controlPlaneHook = readWorkspaceFile("components/control-plane/use-control-plane-live-sync.ts");

    expect(coordinator).toContain("never router.refresh");
    expect(coordinator).toContain("preferReconcile");
    expect(provider).toContain("reconcileResources");
    expect(controlPlaneHook).toContain("Admin scope never calls router.refresh()");
    expect(controlPlaneHook).toContain("routerRefresh: isAdminNoRefresh ? undefined");
  });
});
