import { describe, expect, it } from "vitest";
import { getRequiredPermissionForAdminTable } from "@/services/admin-actions";
import { roleHasPermission } from "@/lib/auth/permissions";

describe("notification permission hardening", () => {
  it("maps orders table to lifecycle permission for warehouse mutations", () => {
    expect(getRequiredPermissionForAdminTable("orders")).toBe("orders.lifecycle");
  });

  it("does not grant customers warehouse or notification permissions", () => {
    expect(roleHasPermission("user", "notifications.write")).toBe(false);
    expect(roleHasPermission("user", "operations.write")).toBe(false);
    expect(roleHasPermission("user", "orders.lifecycle")).toBe(false);
  });

  it("keeps warehouse permissions aligned with /warehouse routes", () => {
    expect(roleHasPermission("warehouse", "operations.write")).toBe(false);
    expect(roleHasPermission("warehouse", "warehouse.write")).toBe(true);
    expect(roleHasPermission("warehouse", "orders.lifecycle")).toBe(true);
  });
});
