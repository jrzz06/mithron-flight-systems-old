import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defaultPathForRole } from "@/lib/auth/access-control";
import { getRoleAwareAuthRedirectPath } from "@/lib/auth/redirects";
import { rejectClientSuppliedRole } from "@/lib/auth/signup-validation";
import { resolvePostAuthRedirect } from "@/lib/auth/post-auth-redirect";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

const mockUser = {
  id: "user-1",
  app_metadata: {},
  user_metadata: {},
  aud: "",
  created_at: ""
};

describe("role creation policy", () => {
  it("restricts admin create and invite to staff roles only", () => {
    const actions = source("app/admin/settings/actions.ts");
    expect(actions).toContain("staffAssignableRoles");
    expect(actions).toContain("assertStaffAssignableRole");
    expect(actions).toContain("createManagedUserAction");
    expect(actions).toContain("inviteManagedUserAction");
    expect(actions).toMatch(/createManagedUserAction[\s\S]*assertStaffAssignableRole/);
    expect(actions).toMatch(/inviteManagedUserAction[\s\S]*assertStaffAssignableRole/);
    expect(actions).toMatch(/assignManagedUserRoleAction[\s\S]*assertManageableUserRole/);
  });

  it("does not offer customer role in admin create or invite UI", () => {
    const createForm = source("components/admin/create-user-form.tsx");
    const userPanel = source("components/admin/user-management-panel.tsx");

    expect(createForm).toContain("staffRoleOptions");
    expect(createForm).not.toContain('value: "user"');
    expect(createForm).toContain("Customers register via Create Account");

    expect(userPanel).toContain("StaffRoleSelect");
    expect(userPanel).toMatch(/Invite staff[\s\S]*StaffRoleSelect/);
    expect(userPanel).toContain('value: "user"');
  });

  it("rejects client-supplied roles on public signup and OTP routes", () => {
    expect(rejectClientSuppliedRole({ role: "admin" })).toMatch(/not allowed/i);
    expect(rejectClientSuppliedRole({ preferredRole: "warehouse" })).toMatch(/not allowed/i);
    expect(rejectClientSuppliedRole({ email: "a@b.com" })).toBeNull();

    const signupRoute = source("app/api/auth/signup/route.ts");
    const verifyOtpRoute = source("app/api/auth/verify-otp/route.ts");
    const loginRoute = source("app/api/auth/login/route.ts");

    expect(signupRoute).toContain("rejectClientSuppliedRole");
    expect(verifyOtpRoute).toContain("rejectClientSuppliedRole");
    expect(loginRoute).toContain('preferredRole: inviteRole ?? operatorRole ?? "user"');
  });

  it("defaults public provisioning to customer when no invite or operator match", () => {
    for (const path of [
      "app/auth/confirm/route.ts",
      "app/auth/callback/route.ts",
      "app/api/auth/verify-otp/route.ts",
      "app/api/auth/login/route.ts"
    ]) {
      expect(source(path)).toContain('preferredRole: inviteRole ?? operatorRole ?? "user"');
    }
  });
});

describe("post-auth redirects by role", () => {
  it("maps default panel homes for each role", () => {
    expect(defaultPathForRole("admin")).toBe("/admin");
    expect(defaultPathForRole("warehouse")).toBe("/warehouse/dashboard");
    expect(defaultPathForRole("supplier")).toBe("/supplier");
    expect(defaultPathForRole("user")).toBe("/account");
  });

  it("sends staff to their panel and ignores storefront next", () => {
    expect(resolvePostAuthRedirect({ user: mockUser, role: "admin", nextPath: "/cart" })).toBe("/admin");
    expect(resolvePostAuthRedirect({ user: mockUser, role: "warehouse", nextPath: "/account" })).toBe("/warehouse/dashboard");
    expect(resolvePostAuthRedirect({ user: mockUser, role: "supplier", nextPath: "" })).toBe("/supplier");
  });

  it("sends customers to /account by default and honors safe storefront next", () => {
    expect(resolvePostAuthRedirect({ user: mockUser, role: "user", nextPath: "" })).toBe("/account");
    expect(resolvePostAuthRedirect({ user: mockUser, role: "user", nextPath: "/login" })).toBe("/account");
    expect(resolvePostAuthRedirect({ user: mockUser, role: "user", nextPath: "/admin" })).toBe("/account");
    expect(resolvePostAuthRedirect({ user: mockUser, role: "user", nextPath: "/checkout" })).toBe("/checkout");
  });

  it("keeps role-aware redirect helpers aligned with panel homes", () => {
    expect(getRoleAwareAuthRedirectPath("", "admin")).toBe("/admin");
    expect(getRoleAwareAuthRedirectPath("/cart", "warehouse")).toBe("/warehouse/dashboard");
    expect(getRoleAwareAuthRedirectPath("", "user")).toBe("/account");
    expect(getRoleAwareAuthRedirectPath("/cart", "user")).toBe("/cart");
  });
});
