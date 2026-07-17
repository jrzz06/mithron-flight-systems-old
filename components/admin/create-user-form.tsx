"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useOptionalAdminRealtime } from "@/components/admin/realtime/admin-realtime-provider";
import { markControlPlaneLiveSyncFlush } from "@/lib/control-plane/shared-live-sync-coordinator";
import { OperationalSubmitButton } from "@/components/admin/operational-submit-button";
import { CopyPasswordPanel } from "@/components/admin/copy-password-panel";
import { wrapServerAction } from "@/hooks/use-async-action";
import { notify } from "@/lib/feedback/notify";

export type CreateUserFormState = {
  status: "idle" | "success" | "error";
  message: string;
  email?: string;
  temporaryPassword?: string;
  passwordGenerated?: boolean;
};

const initialState: CreateUserFormState = { status: "idle", message: "" };

const roleOptions = [
  { value: "admin", label: "Admin" },
  { value: "warehouse", label: "Warehouse" },
  { value: "supplier", label: "Supplier" },
  { value: "user", label: "User" }
] as const;

function compactActionClass(tone: "default" | "success" = "default") {
  if (tone === "success") {
    return "inline-flex h-9 items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-950/25 px-3 text-sm font-semibold text-emerald-200 hover:bg-emerald-950/45";
  }
  return "inline-flex h-9 items-center gap-2 rounded-lg border border-slate-700 bg-[#10151d] px-3 text-sm font-semibold text-slate-100 hover:border-slate-600";
}

function feedbackClass(status: CreateUserFormState["status"]) {
  if (status === "success") return "border-emerald-500/30 bg-emerald-950/30 text-emerald-100";
  if (status === "error") return "border-rose-500/30 bg-rose-950/30 text-rose-100";
  return "";
}

export function CreateUserForm({
  action,
  warehouses
}: {
  action: (prevState: CreateUserFormState, formData: FormData) => Promise<CreateUserFormState>;
  warehouses: Array<{ code: string; name: string }>;
}) {
  const realtime = useOptionalAdminRealtime();
  const feedbackRef = useRef<HTMLDivElement>(null);
  const timedAction = useMemo(
    () => wrapServerAction(action, { label: "Create user" }),
    [action]
  );
  const [state, formAction] = useActionState(timedAction, initialState);
  const [role, setRole] = useState<typeof roleOptions[number]["value"]>("warehouse");

  useEffect(() => {
    if (state.status === "idle") return;
    feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    if (state.status === "success") {
      notify.success("User created", { source: "admin" });
      markControlPlaneLiveSyncFlush();
      void realtime?.reconcileResources(["users"]);
      return;
    }
    if (state.status === "error") {
      notify.error(state.message || "Could not create user.", { source: "admin" });
    }
  }, [realtime, state]);

  return (
    <form action={formAction} data-user-create-form className="grid gap-3">
      <div>
        <p className="text-sm font-semibold text-slate-100">Create User</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">Add a user directly with one clear role.</p>
      </div>
      <input
        name="email"
        type="email"
        required
        autoComplete="off"
        placeholder="name@company.com"
        className="h-10 rounded-lg border border-slate-700 bg-[#10151d] px-3 text-sm text-slate-100 outline-none placeholder:text-slate-600"
      />
      <input
        name="display_name"
        autoComplete="off"
        placeholder="Display name (optional)"
        className="h-10 rounded-lg border border-slate-700 bg-[#10151d] px-3 text-sm text-slate-100 outline-none placeholder:text-slate-600"
      />
      <select
        name="role_key"
        value={role}
        onChange={(event) => setRole(event.target.value as typeof role)}
        className="h-10 rounded-lg border border-slate-700 bg-[#0c1118] px-3 text-sm text-slate-100 outline-none focus:border-emerald-500/70"
      >
        {roleOptions.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      {role === "warehouse" ? (
        <select
          name="assigned_warehouse_code"
          required
          defaultValue={warehouses[0]?.code ?? ""}
          className="h-10 rounded-lg border border-slate-700 bg-[#0c1118] px-3 text-sm text-slate-100 outline-none focus:border-emerald-500/70"
        >
          {warehouses.length ? warehouses.map((warehouse) => (
            <option key={warehouse.code} value={warehouse.code}>
              {warehouse.name} ({warehouse.code})
            </option>
          )) : (
            <option value="">Create a warehouse site first</option>
          )}
        </select>
      ) : null}
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Login credentials</p>
      <input
        name="temporary_password"
        type="text"
        minLength={8}
        autoComplete="new-password"
        placeholder="Temporary password (optional — auto-generated if empty)"
        className="h-10 rounded-lg border border-slate-700 bg-[#10151d] px-3 text-sm text-slate-100 outline-none placeholder:text-slate-600"
      />
      <p className="text-xs leading-5 text-slate-500">
        Share this exact password with the user for /login. If left empty, Mithron generates one and displays it after creation.
      </p>
      {state.status !== "idle" ? (
        <div
          ref={feedbackRef}
          role={state.status === "error" ? "alert" : "status"}
          data-user-create-feedback={state.status}
          className={`rounded-lg border px-3 py-2.5 text-sm leading-6 ${feedbackClass(state.status)}`}
        >
          {state.status === "success" ? "User created — " : "Could not create user — "}
          {state.message}
          {state.status === "success" && state.email && state.temporaryPassword ? (
            <CopyPasswordPanel
              email={state.email}
              temporaryPassword={state.temporaryPassword}
              passwordGenerated={state.passwordGenerated}
            />
          ) : null}
        </div>
      ) : null}
      <OperationalSubmitButton pendingLabel="Creating" className={compactActionClass("success")}>
        Create user
      </OperationalSubmitButton>
    </form>
  );
}
