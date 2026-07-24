import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canAccessProtectedPath,
  defaultPathForRole,
  isControlPanelPath,
  shouldConfineRoleToControlPanel,
  workspaceLabelForRole
} from "@/lib/auth/access-control";
import { getRoleAwareAuthRedirectPath } from "@/lib/auth/redirects";
import { ENTERPRISE_ROLES, normalizeCmsRole } from "@/lib/auth/permissions";

const root = process.cwd();

function readWorkspaceFile(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("phase 1 auth and role flow stabilization", () => {
  it("routes authenticated roles to stable role-owned homes", () => {
    expect(defaultPathForRole("admin")).toBe("/admin");
    expect(defaultPathForRole("warehouse")).toBe("/warehouse/dashboard");
    expect(defaultPathForRole("supplier")).toBe("/supplier");
    expect(defaultPathForRole("user")).toBe("/account");
    expect(defaultPathForRole(null)).toBe("/login");
  });

  it("keeps role-specific protected routes isolated", () => {
    expect(canAccessProtectedPath("admin", "/admin")).toBe(true);
    expect(canAccessProtectedPath("admin", "/operations/tasks")).toBe(true);
    expect(canAccessProtectedPath("warehouse", "/warehouse/fulfillment")).toBe(true);
    expect(canAccessProtectedPath("warehouse", "/warehouse/activity")).toBe(true);
    expect(canAccessProtectedPath("supplier", "/supplier/products")).toBe(true);
    expect(canAccessProtectedPath("supplier", "/admin")).toBe(false);
    expect(canAccessProtectedPath("warehouse", "/admin")).toBe(false);
    expect(canAccessProtectedPath("warehouse", "/operations")).toBe(false);
    expect(canAccessProtectedPath("user", "/admin")).toBe(false);
    expect(canAccessProtectedPath("user", "/warehouse/inventory")).toBe(false);
    expect(canAccessProtectedPath(null, "/admin")).toBe(false);
  });

  it("confines admin, warehouse, and supplier roles to control panel routes only", () => {
    expect(shouldConfineRoleToControlPanel("admin", "/")).toBe(true);
    expect(shouldConfineRoleToControlPanel("admin", "/products")).toBe(true);
    expect(shouldConfineRoleToControlPanel("admin", "/checkout")).toBe(true);
    expect(shouldConfineRoleToControlPanel("admin", "/account")).toBe(true);
    expect(shouldConfineRoleToControlPanel("admin", "/preview/home")).toBe(false);
    expect(shouldConfineRoleToControlPanel("admin", "/preview/blog/example")).toBe(false);
    expect(shouldConfineRoleToControlPanel("admin", "/admin")).toBe(false);
    expect(shouldConfineRoleToControlPanel("admin", "/account/security")).toBe(false);
    expect(shouldConfineRoleToControlPanel("admin", "/account/complete-profile")).toBe(false);
    expect(shouldConfineRoleToControlPanel("admin", "/auth/logout")).toBe(false);
    expect(shouldConfineRoleToControlPanel("warehouse", "/logout")).toBe(false);
    expect(shouldConfineRoleToControlPanel("warehouse", "/account/complete-profile")).toBe(false);

    expect(shouldConfineRoleToControlPanel("warehouse", "/")).toBe(true);
    expect(shouldConfineRoleToControlPanel("warehouse", "/warehouse/dashboard")).toBe(false);

    expect(shouldConfineRoleToControlPanel("supplier", "/cart")).toBe(true);
    expect(shouldConfineRoleToControlPanel("supplier", "/supplier/products")).toBe(false);

    expect(shouldConfineRoleToControlPanel("user", "/")).toBe(false);
    expect(shouldConfineRoleToControlPanel("user", "/checkout")).toBe(false);
  });

  it("redirects control panel roles away from storefront login targets", () => {
    expect(getRoleAwareAuthRedirectPath("/", "admin")).toBe("/admin");
    expect(getRoleAwareAuthRedirectPath("/products", "warehouse")).toBe("/warehouse/dashboard");
    expect(getRoleAwareAuthRedirectPath("/checkout", "supplier")).toBe("/supplier");
    expect(getRoleAwareAuthRedirectPath("/warehouse/fulfillment", "warehouse")).toBe("/warehouse/fulfillment");
    expect(getRoleAwareAuthRedirectPath("/admin/orders", "admin")).toBe("/admin/orders");
    expect(getRoleAwareAuthRedirectPath("/", "user")).toBe("/");
    expect(isControlPanelPath("/account/security")).toBe(true);
  });

  it("keeps admin, warehouse, supplier, and user as assignable canonical roles", () => {
    expect(ENTERPRISE_ROLES).toEqual(["admin", "warehouse", "supplier", "user"]);
    expect(normalizeCmsRole("admin")).toBe("admin");
    expect(normalizeCmsRole("warehouse")).toBe("warehouse");
    expect(normalizeCmsRole("supplier")).toBe("supplier");
    expect(normalizeCmsRole("user")).toBe("user");
    expect(normalizeCmsRole("super_admin")).toBe("admin");
    expect(normalizeCmsRole("editor")).toBe("supplier");
    expect(normalizeCmsRole("warehouse_manager")).toBe("warehouse");
    expect(normalizeCmsRole("warehouse_staff")).toBe("warehouse");
    expect(normalizeCmsRole("operations_manager")).toBe("user");
  });

  it("resolves the DB-backed role before login redirect", () => {
    const loginForm = readWorkspaceFile("app/login/login-form.tsx");
    const redirects = readWorkspaceFile("lib/auth/redirects.ts");

    expect(loginForm).toContain('fetch("/api/auth/login"');
    expect(loginForm).toContain("redirectPath");
    expect(redirects).toContain("getRoleAwareAuthRedirectPath");
    expect(redirects).toContain("canAccessProtectedPath");
    expect(redirects).toContain("isControlPanelRole");
  });

  it("uses DB-backed role resolution for protected proxy route checks", () => {
    const proxy = readWorkspaceFile("proxy.ts");
    const authService = readWorkspaceFile("services/auth.ts");

    expect(proxy).toContain("current_enterprise_role");
    expect(proxy).toContain("shouldConfineRoleToControlPanel");
    expect(proxy).toContain("security.role_resolution_failed");
    expect(authService).toContain("current_enterprise_role");
    expect(authService).not.toContain("falling back to claims role");
    expect(authService).not.toContain("?? claimsRole");
  });

  it("keeps profile navigation pointed at account for signed-in customers", () => {
    const nav = readWorkspaceFile("components/navigation/store-nav.tsx");
    const profile = readWorkspaceFile("components/navigation/profile-nav-button.tsx");
    expect(nav).toContain("ProfileNavButton");
    expect(nav).toContain("CartNavButton");
    expect(profile).toContain('href="/account"');
    expect(profile).toContain('href="/account/orders"');
    expect(profile).toContain('href="/login?next=/account"');
    expect(profile).toContain("setSignedIn(Boolean(data.session?.user))");
  });

  it("labels staff workspaces separately from the customer hub", () => {
    expect(workspaceLabelForRole("admin")).toBe("Admin");
    expect(workspaceLabelForRole("supplier")).toBe("Supplier");
    expect(workspaceLabelForRole("warehouse")).toBe("Warehouse");
    expect(workspaceLabelForRole("user")).toBe("Customer hub");
  });

  it("does not enforce operator MFA in proxy", () => {
    const proxy = readWorkspaceFile("proxy.ts");
    expect(proxy).not.toContain("mfa_required");
    expect(proxy).not.toContain("isOperatorMfaRequired");
  });
});
