"use client";

import { MoreHorizontal, RotateCcw, Search, ShieldCheck, Trash2, UserPlus, UserRound, UserX, X } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { CreateUserForm, type CreateUserFormState } from "@/components/admin/create-user-form";
import { OperationalSubmitButton } from "@/components/admin/operational-submit-button";
import { useAdminLiveCollectionRows } from "@/components/admin/realtime/use-admin-live-collection-rows";
import { wrapServerAction } from "@/hooks/use-async-action";
import type { AdminEntityRow } from "@/lib/admin/realtime/admin-entity-store";

type UserAction = (formData: FormData) => void | Promise<void>;

type ManagedUser = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "warehouse" | "supplier" | "user";
  status: string;
  lastLogin: string | null;
  createdAt: string;
  bannedUntil: string | null;
};

type AdminRow = Record<string, unknown>;

type UserActivityItem = {
  id: string;
  timestamp: string;
  actorName: string;
  actionLabel: string;
  targetLabel: string;
};

type UserManagementPanelProps = {
  users: ManagedUser[];
  invites: AdminRow[];
  activity: UserActivityItem[];
  warehouses: Array<{ code: string; name: string }>;
  createUserFormAction: (prevState: CreateUserFormState, formData: FormData) => Promise<CreateUserFormState>;
  inviteUserAction: UserAction;
  resetPasswordAction: UserAction;
  assignRoleAction: UserAction;
  disableUserAction: UserAction;
  reactivateUserAction: UserAction;
  removeUserAction: UserAction;
  invalidateInviteAction: UserAction;
};

type FilterKey = "all" | "admin" | "warehouse" | "supplier" | "disabled";
type PanelMode = "menu" | "edit" | "role" | "disable" | "reactivate" | "remove";

const roleOptions = [
  { value: "admin", label: "Admin" },
  { value: "warehouse", label: "Warehouse" },
  { value: "supplier", label: "Supplier" },
  { value: "user", label: "User" }
] as const;

const filters: Array<{ value: FilterKey; label: string }> = [
  { value: "all", label: "All Users" },
  { value: "admin", label: "Admin" },
  { value: "warehouse", label: "Warehouse" },
  { value: "supplier", label: "Supplier" },
  { value: "disabled", label: "Disabled" }
];

const pageSize = 12;

function formatDate(value: string | null | undefined) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function roleLabel(role: ManagedUser["role"]) {
  return roleOptions.find((option) => option.value === role)?.label ?? "User";
}

function statusLabel(status: string) {
  if (status === "auth_unavailable") return "Sync issue";
  return status.replaceAll("_", " ");
}

function roleTone(role: ManagedUser["role"]) {
  if (role === "admin") return "border-sky-500/25 bg-sky-950/35 text-sky-200";
  if (role === "warehouse") return "border-amber-500/25 bg-amber-950/35 text-amber-200";
  if (role === "supplier") return "border-violet-500/25 bg-violet-950/35 text-violet-200";
  return "border-slate-700 bg-slate-900 text-slate-300";
}

function statusTone(status: string) {
  if (status === "disabled") return "border-rose-500/25 bg-rose-950/35 text-rose-200";
  if (status === "pending" || status === "auth_unavailable") return "border-amber-500/25 bg-amber-950/35 text-amber-200";
  return "border-emerald-500/25 bg-emerald-950/35 text-emerald-200";
}

function initials(user: ManagedUser) {
  const source = user.name || user.email || "User";
  const pieces = source.split(/[\s@._-]+/).filter(Boolean);
  return (pieces[0]?.[0] ?? "U").concat(pieces[1]?.[0] ?? "").toUpperCase();
}

function userSearchText(user: ManagedUser) {
  return `${user.name} ${user.email} ${user.role} ${user.status}`.toLowerCase();
}

function compactActionClass(tone: "default" | "danger" | "success" = "default") {
  if (tone === "danger") return "inline-flex h-9 items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-950/25 px-3 text-sm font-semibold text-rose-200 hover:bg-rose-950/45";
  if (tone === "success") return "inline-flex h-9 items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-950/25 px-3 text-sm font-semibold text-emerald-200 hover:bg-emerald-950/45";
  return "inline-flex h-9 items-center gap-2 rounded-lg border border-slate-700 bg-[#10151d] px-3 text-sm font-semibold text-slate-100 hover:border-slate-600";
}

function HiddenUserFields({ user }: { user: ManagedUser }) {
  const userId = user.id;
  return (
    <>
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="email" value={user.email} />
      <input type="hidden" name="display_name" value={user.name} />
    </>
  );
}

function RoleSelect({ value }: { value: ManagedUser["role"] }) {
  return (
    <select
      name="role_key"
      defaultValue={value}
      className="h-10 rounded-lg border border-slate-700 bg-[#0c1118] px-3 text-sm text-slate-100 outline-none focus:border-emerald-500/70"
    >
      {roleOptions.map((role) => (
        <option key={role.value} value={role.value}>{role.label}</option>
      ))}
    </select>
  );
}

function EmptyState() {
  return (
    <tr>
      <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
        No team members yet
      </td>
    </tr>
  );
}

export function UserManagementPanel({
  users,
  invites,
  activity,
  warehouses,
  createUserFormAction,
  inviteUserAction,
  resetPasswordAction,
  assignRoleAction,
  disableUserAction,
  reactivateUserAction,
  removeUserAction,
  invalidateInviteAction
}: UserManagementPanelProps) {
  const liveUsers = useAdminLiveCollectionRows(
    "users",
    "profiles",
    users as unknown as AdminEntityRow[],
    ["id"]
  ) as unknown as ManagedUser[];
  const liveInvites = useAdminLiveCollectionRows(
    "users",
    "admin_invites",
    invites as unknown as AdminEntityRow[],
    ["id"]
  ) as AdminRow[];

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [page, setPage] = useState(1);
  const [activeUser, setActiveUser] = useState<ManagedUser | null>(null);
  const [mode, setMode] = useState<PanelMode | null>(null);
  const deferredQuery = useDeferredValue(query);

  const timedInviteUserAction = useMemo(
    () => wrapServerAction(inviteUserAction, { label: "Send invite" }),
    [inviteUserAction]
  );
  const timedResetPasswordAction = useMemo(
    () => wrapServerAction(resetPasswordAction, { label: "Update password" }),
    [resetPasswordAction]
  );
  const timedAssignRoleAction = useMemo(
    () => wrapServerAction(assignRoleAction, { label: "Save user role" }),
    [assignRoleAction]
  );
  const timedDisableUserAction = useMemo(
    () => wrapServerAction(disableUserAction, { label: "Disable user" }),
    [disableUserAction]
  );
  const timedReactivateUserAction = useMemo(
    () => wrapServerAction(reactivateUserAction, { label: "Reactivate user" }),
    [reactivateUserAction]
  );
  const timedRemoveUserAction = useMemo(
    () => wrapServerAction(removeUserAction, { label: "Remove user" }),
    [removeUserAction]
  );
  const timedInvalidateInviteAction = useMemo(
    () => wrapServerAction(invalidateInviteAction, { label: "Invalidate invite" }),
    [invalidateInviteAction]
  );

  const filteredUsers = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();
    return liveUsers.filter((user) => {
      const roleMatch = filter === "all" || (filter !== "disabled" && user.role === filter);
      const statusMatch = filter !== "disabled" || user.status === "disabled";
      const searchMatch = !normalizedQuery || userSearchText(user).includes(normalizedQuery);
      return roleMatch && statusMatch && searchMatch;
    });
  }, [deferredQuery, filter, liveUsers]);

  const pageCount = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const currentPageUsers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [currentPage, filteredUsers]);

  function openPanel(user: ManagedUser, nextMode: PanelMode) {
    setActiveUser(user);
    setMode(nextMode);
  }

  function closePanel() {
    setActiveUser(null);
    setMode(null);
  }

  useEffect(() => {
    if (!mode) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") closePanel();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mode]);

  function changeFilter(nextFilter: FilterKey) {
    setFilter(nextFilter);
    setPage(1);
  }

  const actionTitle = mode === "edit"
    ? "Edit User"
    : mode === "role"
      ? "Change Role"
      : mode === "disable"
        ? "Disable User"
        : mode === "reactivate"
          ? "Reactivate User"
          : mode === "remove"
            ? "Remove User"
            : "User Actions";

  return (
    <section data-user-management-panel className="grid gap-4">
      <div className="rounded-xl border border-slate-800 bg-[#0f141b] p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Team access</p>
            <h2 className="mt-1 text-base font-semibold text-slate-100">Users</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <details className="group relative">
              <summary className={compactActionClass("success")}>
                <UserPlus className="h-4 w-4" />
                Add user
              </summary>
              <div className="absolute right-0 z-40 mt-2 w-[min(92vw,420px)] rounded-xl border border-slate-800 bg-[#0b1017] p-3 shadow-2xl shadow-black/30">
                <CreateUserForm action={createUserFormAction} warehouses={warehouses} />
              </div>
            </details>

            <details className="group relative">
              <summary className={compactActionClass()}>
                <UserPlus className="h-4 w-4" />
                Invite
              </summary>
              <div className="absolute right-0 z-40 mt-2 w-[min(92vw,420px)] rounded-xl border border-slate-800 bg-[#0b1017] p-3 shadow-2xl shadow-black/30">
                <form action={timedInviteUserAction} data-user-invite-form className="grid gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-100">Invite User</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">Send an invite with a predefined role.</p>
                  </div>
                  <input name="email" type="email" required placeholder="name@company.com" className="h-10 rounded-lg border border-slate-700 bg-[#10151d] px-3 text-sm text-slate-100 outline-none placeholder:text-slate-600" />
                  <input name="display_name" placeholder="Display name" className="h-10 rounded-lg border border-slate-700 bg-[#10151d] px-3 text-sm text-slate-100 outline-none placeholder:text-slate-600" />
                  <RoleSelect value="warehouse" />
                  <OperationalSubmitButton pendingLabel="Sending" className={compactActionClass()}>Send invite</OperationalSubmitButton>
                </form>
              </div>
            </details>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              data-user-search
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Search name or email"
              className="h-10 w-full rounded-lg border border-slate-700 bg-[#10151d] pl-9 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-emerald-500/70"
            />
          </label>
          <div data-user-role-filter data-user-status-filter className="flex flex-wrap gap-1.5">
            {filters.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => changeFilter(option.value)}
                className={`h-9 rounded-lg border px-3 text-sm font-medium ${filter === option.value ? "border-emerald-500/40 bg-emerald-950/35 text-emerald-200" : "border-slate-800 bg-[#10151d] text-slate-400 hover:border-slate-700"}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div data-user-access-table className="overflow-hidden rounded-xl border border-slate-800 bg-[#0f141b]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-[#10151d] px-4 py-2.5 text-sm text-slate-400">
          <span>{filteredUsers.length} users</span>
          <span>Page {currentPage} of {pageCount}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-slate-800 bg-[#111822] text-xs font-semibold text-slate-500">
              <tr>
                <th className="w-[44%] px-4 py-3">User</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last login</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentPageUsers.length ? currentPageUsers.map((user) => (
                <tr key={`${user.email}-${user.status}`} className="border-b border-slate-800/80 text-slate-300 last:border-b-0 hover:bg-slate-900/45">
                  <td className="px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-slate-700 bg-slate-900 text-xs font-semibold text-slate-200">
                        {initials(user)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-100">{user.name || user.email}</p>
                        <p className="truncate text-xs text-slate-500">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => openPanel(user, "role")}
                      className={`inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-semibold ${roleTone(user.role)}`}
                    >
                      {roleLabel(user.role)}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-semibold capitalize ${statusTone(user.status)}`}>
                      {statusLabel(user.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(user.lastLogin)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      data-user-actions-menu
                      aria-label={`Open actions for ${user.email}`}
                      onClick={() => openPanel(user, "menu")}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-[#10151d] text-slate-300 hover:border-slate-600 hover:text-slate-100"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              )) : <EmptyState />}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 px-4 py-3">
          <button type="button" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="h-9 rounded-lg border border-slate-800 px-3 text-sm text-slate-300 disabled:opacity-40">Previous</button>
          <button type="button" disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} className="h-9 rounded-lg border border-slate-800 px-3 text-sm text-slate-300 disabled:opacity-40">Next</button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-[#0f141b] p-4">
          <p className="text-sm font-semibold text-slate-100">Recent invites</p>
          <div className="mt-3 grid gap-2">
            {liveInvites.length ? liveInvites.slice(0, 4).map((invite) => (
              <div key={String(invite.id ?? invite.email)} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-[#10151d] p-3">
                <div>
                  <p className="text-sm font-medium text-slate-200">{String(invite.email ?? "Unknown email")}</p>
                  <p className="text-xs text-slate-500">{String(invite.role_key ?? "user")} - {String(invite.status ?? "pending")}</p>
                </div>
                <form action={timedInvalidateInviteAction} data-user-invite-invalidate-form>
                  <input type="hidden" name="invite_id" value={String(invite.id ?? "")} />
                  <OperationalSubmitButton pendingLabel="Invalidating" className="h-8 rounded-lg border border-slate-700 px-2.5 text-xs font-semibold text-slate-300">
                    Invalidate
                  </OperationalSubmitButton>
                </form>
              </div>
            )) : <p className="text-sm text-slate-500">No pending invite rows.</p>}
          </div>
        </div>

        <div data-user-activity-feed className="rounded-xl border border-slate-800 bg-[#0f141b] p-4">
          <p className="text-sm font-semibold text-slate-100">Recent team activity</p>
          <p className="mt-1 text-xs text-slate-500">Live audit events for user creation, role changes, status updates, and sign-ins.</p>
          <div className="mt-3 grid gap-2">
            {activity.length ? activity.slice(0, 8).map((entry) => (
              <div key={entry.id} className="rounded-lg border border-slate-800 bg-[#10151d] p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-200">{entry.actionLabel}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {entry.actorName}
                      <span className="px-1 text-slate-700">·</span>
                      {entry.targetLabel}
                    </p>
                  </div>
                  <time className="shrink-0 text-xs text-slate-500">{formatDate(entry.timestamp)}</time>
                </div>
              </div>
            )) : <p className="text-sm text-slate-500">No recent team activity recorded yet.</p>}
          </div>
        </div>
      </div>

      {activeUser && mode ? (
        <div
          className="fixed inset-0 z-[90] bg-black/60 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closePanel();
          }}
        >
          <div
            className="ml-auto grid h-full w-full max-w-md content-start overflow-y-auto rounded-xl border border-slate-800 bg-[#0b1017] p-4 shadow-2xl shadow-black/40"
            role="dialog"
            aria-modal="true"
            aria-label={actionTitle}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">User</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-100">{actionTitle}</h3>
                <p className="mt-1 text-sm text-slate-500">{activeUser.email}</p>
              </div>
              <button type="button" onClick={closePanel} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-800 text-slate-400 hover:text-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            {mode === "menu" ? (
              <div className="mt-5 grid gap-2">
                <button type="button" onClick={() => setMode("edit")} className={compactActionClass()}>
                  <UserRound className="h-4 w-4" />
                  Edit User
                </button>
                <button type="button" onClick={() => setMode("role")} className={compactActionClass()}>
                  <ShieldCheck className="h-4 w-4" />
                  Change Role
                </button>
                {activeUser.status === "disabled" ? (
                  <button type="button" onClick={() => setMode("reactivate")} className={compactActionClass("success")}>
                    <RotateCcw className="h-4 w-4" />
                    Reactivate User
                  </button>
                ) : (
                  <button type="button" onClick={() => setMode("disable")} className={compactActionClass("danger")}>
                    <UserX className="h-4 w-4" />
                    Disable User
                  </button>
                )}
                <button type="button" onClick={() => setMode("remove")} className={compactActionClass("danger")}>
                  <Trash2 className="h-4 w-4" />
                  Remove User
                </button>
              </div>
            ) : null}

            {mode === "edit" ? (
              <form action={timedAssignRoleAction} data-user-role-form data-user-edit-form className="mt-5 grid gap-3">
                <input type="hidden" name="user_id" value={activeUser.id} />
                <input type="hidden" name="email" value={activeUser.email} />
                <label className="grid gap-1.5 text-sm text-slate-300">
                  Name
                  <input name="display_name" defaultValue={activeUser.name} className="h-10 rounded-lg border border-slate-700 bg-[#10151d] px-3 text-sm text-slate-100 outline-none focus:border-emerald-500/70" />
                </label>
                <label className="grid gap-1.5 text-sm text-slate-300">
                  Role
                  <RoleSelect value={activeUser.role} />
                </label>
                <OperationalSubmitButton pendingLabel="Saving" className={compactActionClass("success")}>Save changes</OperationalSubmitButton>
              </form>
            ) : null}

            {mode === "edit" ? (
              <form action={timedResetPasswordAction} data-user-reset-password-form className="mt-2 grid gap-3 border-t border-slate-800 pt-4">
                <input type="hidden" name="user_id" value={activeUser.id} />
                <input type="hidden" name="email" value={activeUser.email} />
                <div>
                  <p className="text-sm font-semibold text-slate-100">Set new password</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Use this if the user cannot sign in with their current password.</p>
                </div>
                <input
                  name="temporary_password"
                  type="text"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="New temporary password (min 8 characters)"
                  className="h-10 rounded-lg border border-slate-700 bg-[#10151d] px-3 text-sm text-slate-100 outline-none placeholder:text-slate-600"
                />
                <OperationalSubmitButton pendingLabel="Updating" className={compactActionClass("success")}>
                  Set new password
                </OperationalSubmitButton>
              </form>
            ) : null}

            {mode === "role" ? (
              <form action={timedAssignRoleAction} data-user-role-modal data-user-role-form className="mt-5 grid gap-3">
                <HiddenUserFields user={activeUser} />
                <label className="grid gap-1.5 text-sm text-slate-300">
                  Role
                  <RoleSelect value={activeUser.role} />
                </label>
                <OperationalSubmitButton pendingLabel="Saving" className={compactActionClass("success")}>Save role</OperationalSubmitButton>
              </form>
            ) : null}

            {mode === "disable" ? (
              <form action={timedDisableUserAction} data-user-disable-form className="mt-5 grid gap-3">
                <HiddenUserFields user={activeUser} />
                <p className="rounded-lg border border-rose-500/25 bg-rose-950/25 p-3 text-sm leading-6 text-rose-100">
                  This blocks access for {activeUser.name || activeUser.email}. Existing role data is kept for recovery.
                </p>
                <OperationalSubmitButton
                  pendingLabel="Disabling"
                  confirmMessage={`Disable ${activeUser.email}?`}
                  className={compactActionClass("danger")}
                >
                  Disable User
                </OperationalSubmitButton>
              </form>
            ) : null}

            {mode === "reactivate" ? (
              <form action={timedReactivateUserAction} data-user-reactivate-form className="mt-5 grid gap-3">
                <HiddenUserFields user={activeUser} />
                <label className="grid gap-1.5 text-sm text-slate-300">
                  Role
                  <RoleSelect value={activeUser.role} />
                </label>
                <OperationalSubmitButton pendingLabel="Reactivating" className={compactActionClass("success")}>
                  Reactivate User
                </OperationalSubmitButton>
              </form>
            ) : null}

            {mode === "remove" ? (
              <form action={timedRemoveUserAction} data-user-remove-form className="mt-5 grid gap-3">
                <HiddenUserFields user={activeUser} />
                <p className="rounded-lg border border-rose-500/25 bg-rose-950/25 p-3 text-sm leading-6 text-rose-100">
                  Remove {activeUser.name || activeUser.email} permanently. This will revoke their access to the platform.
                </p>
                <OperationalSubmitButton
                  pendingLabel="Removing"
                  confirmMessage={`Remove ${activeUser.email}? This cannot be undone.`}
                  className={compactActionClass("danger")}
                >
                  Remove User
                </OperationalSubmitButton>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
