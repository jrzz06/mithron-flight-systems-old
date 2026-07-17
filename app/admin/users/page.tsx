import { UserManagementPanel } from "@/components/admin/user-management-panel";
import { UserGovernanceFeedback } from "@/components/admin/user-governance-feedback";
import { AdminUsersLiveSync } from "@/components/admin/admin-users-live-sync";
import { ControlShell } from "@/components/admin/control-shell";
import { connectivityMessage } from "@/lib/platform/copy";
import { normalizeCmsRole } from "@/lib/auth/permissions";
import { getUserGovernanceSnapshot, mapUserGovernanceActivity } from "@/services/admin";
import { listActiveWarehouses } from "@/services/warehouses";
import { getAdminSettingsPolicy } from "@/services/admin-settings-policy";
import {
  assignManagedUserRoleAction,
  createUserFormAction,
  disableManagedUserAction,
  invalidateManagedInviteAction,
  inviteManagedUserAction,
  reactivateManagedUserAction,
  removeManagedUserAction,
  resetManagedUserPasswordAction
} from "@/app/admin/settings/actions";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function searchValue(params: SearchParams, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function managedRole(value: unknown): "admin" | "warehouse" | "supplier" | "user" {
  const role = normalizeCmsRole(value);
  if (role === "admin" || role === "warehouse" || role === "supplier" || role === "user") {
    return role;
  }
  return "user";
}

export default async function AdminUsersPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const [snapshot, warehouses, policy] = await Promise.all([
    getUserGovernanceSnapshot(),
    listActiveWarehouses().catch(() => []),
    getAdminSettingsPolicy()
  ]);
  const params = searchParams ? await searchParams : {};
  const userStatus = searchValue(params, "user_status");
  const userMessage = searchValue(params, "user_message");

  const users = snapshot.data.users.map((user) => ({
    id: user.id,
    email: user.email,
    name: user.display_name || user.email,
    role: managedRole(user.default_role ?? user.roles[0]),
    status: user.status === "disabled" ? "disabled" : user.status,
    lastLogin: user.last_sign_in_at,
    createdAt: user.created_at,
    bannedUntil: user.banned_until
  }));

  const activity = mapUserGovernanceActivity(snapshot.data.activity, snapshot.data.users, snapshot.data.invites);

  return (
    <div data-user-management-shell className="grid gap-4">
      <AdminUsersLiveSync enabled={policy.realtimeUpdatesEnabled} />
      <ControlShell
        eyebrow="Team access"
        title="Users"
        description="Create warehouse, supplier, and admin accounts. Assign roles, reset passwords, and manage account status."
        actions={[{ label: "Warehouse sites", href: "/admin/warehouses" }]}
      >
        <UserGovernanceFeedback status={userStatus} message={userMessage} />

        {snapshot.blockedReason ? (
          <p className="rounded-[var(--platform-radius)] border border-[var(--platform-warning)]/20 bg-[var(--platform-warning-soft)] px-4 py-3 text-sm text-[var(--platform-warning)]">
            {connectivityMessage(snapshot.blockedReason)}
          </p>
        ) : null}

        <div data-user-operational-feedback>
          <UserManagementPanel
            users={users}
            invites={snapshot.data.invites}
            activity={activity}
            warehouses={warehouses.map((warehouse) => ({ code: warehouse.code, name: warehouse.name }))}
            createUserFormAction={createUserFormAction}
            inviteUserAction={inviteManagedUserAction}
            resetPasswordAction={resetManagedUserPasswordAction}
            assignRoleAction={assignManagedUserRoleAction}
            disableUserAction={disableManagedUserAction}
            reactivateUserAction={reactivateManagedUserAction}
            removeUserAction={removeManagedUserAction}
            invalidateInviteAction={invalidateManagedInviteAction}
          />
        </div>
      </ControlShell>
    </div>
  );
}
