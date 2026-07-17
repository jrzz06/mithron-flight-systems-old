import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canAccessProtectedPath, defaultPathForRole } from "@/lib/auth/access-control";
import { roleHasPermission } from "@/lib/auth/permissions";

const root = process.cwd();

describe("four-role RBAC route guards", () => {
  it("routes each role to its workspace home", () => {
    expect(defaultPathForRole("admin")).toBe("/admin");
    expect(defaultPathForRole("warehouse")).toBe("/warehouse/dashboard");
    expect(defaultPathForRole("supplier")).toBe("/supplier");
    expect(defaultPathForRole("user")).toBe("/account");
  });

  it("isolates protected prefixes by role", () => {
    expect(canAccessProtectedPath("admin", "/admin/suppliers")).toBe(true);
    expect(canAccessProtectedPath("warehouse", "/warehouse/dashboard")).toBe(true);
    expect(canAccessProtectedPath("supplier", "/supplier/inventory")).toBe(true);
    expect(canAccessProtectedPath("user", "/account/orders")).toBe(true);
    expect(canAccessProtectedPath("user", "/supplier")).toBe(false);
    expect(canAccessProtectedPath("supplier", "/warehouse/dashboard")).toBe(false);
    expect(canAccessProtectedPath("admin", "/warehouse/dashboard")).toBe(false);
    expect(canAccessProtectedPath("admin", "/supplier")).toBe(false);
  });

  it("ships supplier portal and proxy guard surfaces", () => {
    expect(existsSync(join(root, "app/supplier/layout.tsx"))).toBe(true);
    expect(readFileSync(join(root, "proxy.ts"), "utf8")).toContain("authorizeRoute(role, pathname");
    expect(readFileSync(join(root, "proxy.ts"), "utf8")).toContain("resolveApiRoutePolicy");
    expect(roleHasPermission("supplier", "products.submit")).toBe(true);
  });
});
