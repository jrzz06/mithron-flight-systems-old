import { describe, expect, it } from "vitest";
import { getRolePermissions, roleHasPermission } from "@/lib/auth/permissions";

describe("RBAC split v2", () => {
  it("grants customers checkout but not warehouse lifecycle permissions", () => {
    expect(roleHasPermission("user", "orders.checkout")).toBe(true);
    expect(roleHasPermission("user", "orders.write")).toBe(false);
    expect(roleHasPermission("user", "orders.lifecycle")).toBe(false);
    expect(roleHasPermission("user", "operations.write")).toBe(false);
  });

  it("grants warehouse lifecycle and legacy orders.write", () => {
    expect(roleHasPermission("warehouse", "orders.lifecycle")).toBe(true);
    expect(roleHasPermission("warehouse", "orders.write")).toBe(true);
    expect(roleHasPermission("warehouse", "warehouse.write")).toBe(true);
  });

  it("includes new permissions in admin role", () => {
    const adminPerms = getRolePermissions("admin");
    expect(adminPerms).toContain("orders.checkout");
    expect(adminPerms).toContain("orders.lifecycle");
    expect(adminPerms).toContain("account.read.self");
  });
});
