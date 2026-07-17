import { describe, expect, it } from "vitest";
import { canAccessProtectedPath, defaultPathForRole, isStrictAdminRole } from "@/lib/auth/access-control";
import { roleHasPermission } from "@/lib/auth/permissions";

describe("RBAC role isolation", () => {
  it("routes each enterprise role to its workspace home", () => {
    expect(defaultPathForRole("admin")).toBe("/admin");
    expect(defaultPathForRole("warehouse")).toBe("/warehouse/dashboard");
    expect(defaultPathForRole("supplier")).toBe("/supplier");
    expect(defaultPathForRole("user")).toBe("/account");
  });

  it("blocks non-admin roles from foreign control-plane prefixes", () => {
    expect(canAccessProtectedPath("user", "/supplier")).toBe(false);
    expect(canAccessProtectedPath("user", "/admin/orders")).toBe(false);
    expect(canAccessProtectedPath("supplier", "/warehouse/dashboard")).toBe(false);
    expect(canAccessProtectedPath("warehouse", "/supplier/products")).toBe(false);
    expect(canAccessProtectedPath("warehouse", "/admin")).toBe(false);
    expect(canAccessProtectedPath("admin", "/warehouse/dashboard")).toBe(false);
    expect(canAccessProtectedPath("admin", "/supplier/products")).toBe(false);
    expect(canAccessProtectedPath("supplier", "/admin")).toBe(false);
    expect(isStrictAdminRole("warehouse")).toBe(false);
  });

  it("prevents cross-role privilege bleed in the permission matrix", () => {
    expect(roleHasPermission("user", "cms.write")).toBe(false);
    expect(roleHasPermission("user", "warehouse.write")).toBe(false);
    expect(roleHasPermission("user", "products.submit")).toBe(false);
    expect(roleHasPermission("supplier", "warehouse.write")).toBe(false);
    expect(roleHasPermission("warehouse", "products.write")).toBe(false);
    expect(roleHasPermission("warehouse", "settings.write")).toBe(false);
  });

  it("allows each role into its own protected workspace", () => {
    expect(canAccessProtectedPath("admin", "/admin/suppliers")).toBe(true);
    expect(canAccessProtectedPath("warehouse", "/warehouse/dashboard")).toBe(true);
    expect(canAccessProtectedPath("supplier", "/supplier/inventory")).toBe(true);
    expect(canAccessProtectedPath("user", "/account/orders")).toBe(true);
  });
});
