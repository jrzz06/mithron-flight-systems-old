import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getRequiredPermissionForAdminTable } from "@/services/admin-actions";

describe("enterprise user governance workflow", () => {
  it("maps profile and role mutations to settings.write instead of exposing direct public role writes", () => {
    expect(getRequiredPermissionForAdminTable("profiles")).toBe("settings.write");
    expect(getRequiredPermissionForAdminTable("user_roles")).toBe("settings.write");
    expect(getRequiredPermissionForAdminTable("admin_invites")).toBe("settings.write");
  });

  it("exposes an operator-facing manage-users surface on the dedicated users route", () => {
    const usersPage = readFileSync(join(process.cwd(), "app/admin/users/page.tsx"), "utf8");
    const settingsPage = readFileSync(join(process.cwd(), "app/admin/settings/page.tsx"), "utf8");
    const userPanel = readFileSync(join(process.cwd(), "components/admin/user-management-panel.tsx"), "utf8");

    expect(usersPage).toContain("getUserGovernanceSnapshot");
    expect(usersPage).toContain("UserManagementPanel");
    expect(usersPage).toContain("data-user-management-shell");
    expect(usersPage).toContain("data-user-operational-feedback");
    expect(settingsPage).not.toContain("getUserGovernanceSnapshot");
    expect(settingsPage).not.toContain("UserManagementPanel");
    expect(userPanel).toContain("data-user-management-panel");
    expect(userPanel).toContain("data-user-access-table");
    expect(userPanel).toContain("data-user-search");
    expect(userPanel).toContain("data-user-role-filter");
    expect(userPanel).toContain("data-user-status-filter");
    expect(userPanel).toContain("data-user-actions-menu");
    expect(userPanel).toContain("data-user-role-modal");
    expect(userPanel).toContain("CreateUserForm");
    expect(userPanel).toContain("createUserFormAction");
    const createUserForm = readFileSync(join(process.cwd(), "components/admin/create-user-form.tsx"), "utf8");
    expect(createUserForm).toContain("data-user-create-form");
    expect(createUserForm).toContain("Login credentials");
    expect(createUserForm).toContain("temporaryPassword");
    expect(userPanel).toContain("data-user-invite-form");
    expect(userPanel).toContain("data-user-disable-form");
    expect(userPanel).toContain("data-user-reactivate-form");
    expect(userPanel).toContain("data-user-remove-form");
    expect(userPanel).toContain("data-user-activity-feed");
    expect(userPanel).toContain("Recent team activity");
    expect(userPanel).toContain("useDeferredValue");
    expect(userPanel).toContain("currentPageUsers");
    expect(userPanel).toContain("All Users");
    expect(userPanel).toContain("Edit User");
    expect(userPanel).toContain("Change Role");
    expect(userPanel).toContain("Disable User");
    expect(userPanel).toContain("Reactivate User");
    expect(userPanel).toContain("Remove User");
    expect(usersPage).toContain("admin");
    expect(usersPage).toContain("warehouse");
    expect(usersPage).toContain("supplier");
    expect(usersPage).toContain("user");
    expect(usersPage).toContain("mapUserGovernanceActivity");
    expect(usersPage).not.toContain("activity={[]}");
    expect(usersPage).not.toContain("User governance");
    expect(usersPage).not.toContain("Governance activity");
    expect(usersPage).not.toContain("unassigned");
    expect(settingsPage).not.toContain("data-user-revoke-form");
    expect(settingsPage).not.toContain("data-user-disable-form");
    expect(settingsPage).not.toContain("data-user-reactivate-form");
    expect(userPanel).not.toContain("{user.id}");
    expect(userPanel).not.toContain("default_role");
    expect(userPanel).not.toContain("operations_manager");
    expect(userPanel).not.toContain("warehouse_manager");
    expect(userPanel).not.toContain("unassigned");
    expect(userPanel).not.toContain("Governance");
    expect(usersPage).not.toContain("operations_manager");
    expect(usersPage).not.toContain("warehouse_manager");
  });

  it("wires admin-only user governance actions to Supabase Auth, role rows, and activity logging", () => {
    const actions = readFileSync(join(process.cwd(), "app/admin/settings/actions.ts"), "utf8");

    for (const actionName of [
      "createManagedUserAction",
      "inviteManagedUserAction",
      "assignManagedUserRoleAction",
      "removeManagedUserRoleAction",
      "disableManagedUserAction",
      "reactivateManagedUserAction",
      "removeManagedUserAction"
    ]) {
      expect(actions).toContain(actionName);
    }

    expect(actions).toContain("auth.admin.createUser");
    expect(actions).toContain("auth.admin.generateLink");
    expect(actions).toContain("auth.admin.updateUserById");
    expect(actions).toContain("auth.admin.deleteUser");
    expect(actions).toContain("upsertUserRoleRecord");
    expect(actions).toContain("deleteUserRoleRecord");
    expect(actions).toContain("createActivityLogRecord");
    expect(actions).toContain("resetManagedUserPasswordAction");
    expect(actions).toContain("verifyManagedUserCredentials");
  });

  it("prevents duplicate pending invites before creating Supabase invite links", () => {
    const actions = readFileSync(join(process.cwd(), "app/admin/settings/actions.ts"), "utf8");

    expect(actions).toContain("findPendingInvite");
    expect(actions).toContain("users.invite_duplicate");
    expect(actions).toContain("Duplicate pending invite");
  });

  it("records governance audit metadata with actor role, before state, and after state", () => {
    const actions = readFileSync(join(process.cwd(), "app/admin/settings/actions.ts"), "utf8");

    expect(actions).toContain("actor_role");
    expect(actions).toContain("target_user_id");
    expect(actions).toContain("before_state");
    expect(actions).toContain("after_state");
    expect(actions).toContain("related_entity_ids");
  });

  it("adds an explicit fail-closed database guard for direct user role deletion", () => {
    const migration = readFileSync(join(process.cwd(), "supabase/migrations/20260524001400_governance_fail_closed_audit.sql"), "utf8");

    expect(migration).toContain("create or replace function public.reject_direct_user_role_delete()");
    expect(migration).toContain("Direct user role deletion is denied");
    expect(migration).toContain("before delete on public.user_roles");
    expect(migration).toContain("user_roles direct delete explicit deny");
  });
});
