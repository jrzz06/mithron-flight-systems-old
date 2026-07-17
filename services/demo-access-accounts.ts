import { createClient as createSupabaseServiceClient } from "@supabase/supabase-js";
import type { DemoLoginAccount } from "@/lib/auth/demo-accounts";
import { isDemoSeedingEnabled } from "@/lib/auth/demo-access";
import { normalizeCmsRole, type CmsRole } from "@/lib/auth/permissions";
import { assertSupabaseAdminConfig } from "@/lib/env";

type EnvSource = Record<string, string | undefined>;

type DemoAccessRow = {
  id: string;
  email: string;
  role_key: string;
  label: string;
  enabled: boolean;
  sort_order: number;
};

const DEMO_PASSWORD_ENV_KEYS: Record<Exclude<CmsRole, "user">, string> = {
  admin: "DEMO_ADMIN_PASSWORD",
  supplier: "DEMO_SUPPLIER_PASSWORD",
  warehouse: "DEMO_WAREHOUSE_PASSWORD"
};

function serviceClient(env: EnvSource = process.env) {
  const config = assertSupabaseAdminConfig(env);
  return createSupabaseServiceClient(config.url, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

function resolveDemoPassword(role: CmsRole, env: EnvSource) {
  if (role === "user") return "";
  return env[DEMO_PASSWORD_ENV_KEYS[role]]?.trim() ?? "";
}

export async function listDemoAccessAccounts(env: EnvSource = process.env): Promise<DemoLoginAccount[]> {
  const supabase = serviceClient(env);
  const { data, error } = await supabase
    .from("demo_access_accounts")
    .select("id,email,role_key,label,enabled,sort_order")
    .eq("enabled", true)
    .order("sort_order", { ascending: true })
    .order("email", { ascending: true });

  if (error) {
    throw new Error(`Failed to load demo access accounts: ${error.message}`);
  }

  return (data as DemoAccessRow[] | null ?? [])
    .map((row) => {
      const role = normalizeCmsRole(row.role_key);
      if (!role || role === "user") return null;
      return {
        id: row.id,
        email: row.email.toLowerCase(),
        role,
        label: row.label,
        description: `${row.email} · ${row.label}`
      } satisfies DemoLoginAccount;
    })
    .filter(Boolean) as DemoLoginAccount[];
}

export async function findDemoAccessAccountByRole(roleValue: string, env: EnvSource = process.env) {
  const role = normalizeCmsRole(roleValue);
  if (!role || role === "user") return null;
  const accounts = await listDemoAccessAccounts(env);
  return accounts.find((account) => account.role === role) ?? null;
}

/** Operator/staff emails registered in demo_access_accounts (real addresses, not throwaway logins). */
export async function findDemoAccessAccountByEmail(email: string, env: EnvSource = process.env) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const accounts = await listDemoAccessAccounts(env);
  return accounts.find((account) => account.email === normalized) ?? null;
}

export async function resolveOperatorRoleForEmail(email: string | null | undefined, env: EnvSource = process.env) {
  if (!email?.trim()) return null;
  const account = await findDemoAccessAccountByEmail(email, env);
  return account?.role ?? null;
}

export function resolveDemoPasswordForRole(roleValue: string, env: EnvSource = process.env) {
  const role = normalizeCmsRole(roleValue);
  if (!role || role === "user") return "";
  return resolveDemoPassword(role, env);
}

export function assertDemoSeedingConfigured(env: EnvSource = process.env) {
  if (!isDemoSeedingEnabled(env)) {
    throw new Error("Demo seeding is disabled. Set ALLOW_DEMO_SEED=true to run demo user seeding.");
  }
}
