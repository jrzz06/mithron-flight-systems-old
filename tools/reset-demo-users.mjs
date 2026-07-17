import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

const DEMO_PASSWORD_ENV_KEYS = {
  admin: "DEMO_ADMIN_PASSWORD",
  supplier: "DEMO_SUPPLIER_PASSWORD",
  warehouse: "DEMO_WAREHOUSE_PASSWORD"
};

async function loadDemoAccounts(supabase) {
  const { data, error } = await supabase
    .from("demo_access_accounts")
    .select("id,email,role_key,label,enabled,sort_order")
    .eq("enabled", true)
    .order("sort_order", { ascending: true })
    .order("email", { ascending: true });

  if (error) {
    throw new Error(`Failed to load demo_access_accounts from Supabase: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    const envKey = DEMO_PASSWORD_ENV_KEYS[row.role_key];
    const password = envKey ? process.env[envKey]?.trim() ?? "" : "";
    if (!password) {
      throw new Error(`Missing ${envKey} for ${row.role_key} demo account (${row.email}).`);
    }
    return {
      id: row.id,
      email: row.email.toLowerCase(),
      password,
      role: row.role_key,
      label: row.label
    };
  });
}

const USER_REFERENCE_UPDATES = [
  { table: "mithron_products", matchColumn: "slug", columns: { approved_by: null, submitted_by: null, supplier_id: null } },
  { table: "profiles", matchColumn: "id", columns: { disabled_by: null, reactivated_by: null } },
  { table: "audit_logs", matchColumn: "id", columns: { actor_id: null } },
  { table: "hero_banners", matchColumn: "id", columns: { created_by: null, updated_by: null } },
  { table: "media_assets", matchColumn: "id", columns: { created_by: null, uploaded_by: null } },
  { table: "inventory", matchColumn: "id", columns: { updated_by: null } },
  { table: "orders", matchColumn: "id", columns: { created_by: null, created_by_user_id: null } },
  { table: "warehouse_stock", matchColumn: "id", columns: { updated_by: null } },
  { table: "deployment_requests", matchColumn: "id", columns: { assigned_to: null } },
  { table: "staff_tasks", matchColumn: "id", columns: { assigned_to: null, created_by: null } },
  { table: "cms_pages", matchColumn: "id", columns: { created_by: null, updated_by: null } },
  { table: "cms_sections", matchColumn: "id", columns: { created_by: null, updated_by: null } },
  { table: "content_revisions", matchColumn: "id", columns: { created_by: null } },
  { table: "activity_logs", matchColumn: "id", columns: { actor_id: null } },
  { table: "admin_invites", matchColumn: "id", columns: { accepted_by: null, invited_by: null } },
  { table: "inventory_movements", matchColumn: "id", columns: { actor_user_id: null } },
  { table: "shipments", matchColumn: "id", columns: { actor_user_id: null } },
  { table: "shipment_timeline", matchColumn: "id", columns: { actor_user_id: null } },
  { table: "security_events", matchColumn: "id", columns: { actor_user_id: null } },
  { table: "admin_settings", matchColumn: "id", columns: { updated_by: null } },
  { table: "enquiries", matchColumn: "id", columns: { assigned_to: null, customer_user_id: null } }
];

async function ensureRoles(supabase) {
  const rows = [
    { key: "admin", label: "Admin", description: "Full admin access.", sort_order: 1 },
    { key: "warehouse", label: "Warehouse", description: "Warehouse access.", sort_order: 2 },
    { key: "supplier", label: "Supplier", description: "Supplier access.", sort_order: 3 },
    { key: "user", label: "User", description: "Storefront user access.", sort_order: 4 }
  ];

  for (const row of rows) {
    const { error } = await supabase.from("roles").upsert(row, { onConflict: "key" });
    if (error) throw error;
  }
}

async function clearUserReferences(supabase) {
  for (const update of USER_REFERENCE_UPDATES) {
    const { error } = await supabase
      .from(update.table)
      .update(update.columns)
      .not(update.matchColumn, "is", null);
    if (error) throw new Error(`Failed to clear ${update.table}: ${error.message}`);
    console.log(`cleared user refs in ${update.table}`);
  }

  for (const table of ["customer_addresses", "notifications"]) {
    const { error } = await supabase.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) throw new Error(`Failed to delete ${table}: ${error.message}`);
    console.log(`deleted ${table}`);
  }
}

async function listAllAuthUsers(supabase) {
  const users = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 200) break;
  }
  return users;
}

function serviceHeaders(serviceRoleKey, prefer = "return=minimal") {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    Prefer: prefer
  };
}

async function deleteUserRoles(url, serviceRoleKey, userId) {
  const { data: roles, error } = await createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
    .from("user_roles")
    .select("role_key")
    .eq("user_id", userId);

  if (error) throw error;

  for (const row of roles ?? []) {
    const response = await fetch(
      `${url}/rest/v1/user_roles?user_id=eq.${encodeURIComponent(userId)}&role_key=eq.${encodeURIComponent(row.role_key)}`,
      { method: "DELETE", headers: serviceHeaders(serviceRoleKey) }
    );
    if (!response.ok) {
      throw new Error(`Failed to delete role ${row.role_key} for ${userId}: ${response.status} ${response.statusText}`);
    }
  }
}

async function deleteProfile(url, serviceRoleKey, userId) {
  const response = await fetch(`${url}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: serviceHeaders(serviceRoleKey)
  });
  if (!response.ok) {
    throw new Error(`Failed to delete profile ${userId}: ${response.status} ${response.statusText}`);
  }
}

async function deleteAllAuthUsers(supabase, url, serviceRoleKey) {
  const users = await listAllAuthUsers(supabase);
  for (const user of users) {
    await deleteUserRoles(url, serviceRoleKey, user.id);
    await deleteProfile(url, serviceRoleKey, user.id);
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) throw new Error(`Failed to delete ${user.email ?? user.id}: ${error.message}`);
    console.log(`deleted ${user.email ?? user.id}`);
  }
}

async function provisionUser(supabase, account) {
  const now = new Date().toISOString();
  const email = account.email.toLowerCase();

  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      id: account.id,
      email,
      display_name: account.label,
      default_role: account.role,
      governance_status: "active",
      updated_at: now
    },
    { onConflict: "id" }
  );
  if (profileError) throw profileError;

  const { error: roleError } = await supabase.from("user_roles").upsert(
    { user_id: account.id, role_key: account.role },
    { onConflict: "user_id,role_key" }
  );
  if (roleError) throw roleError;

  const { error: metadataError } = await supabase.auth.admin.updateUserById(account.id, {
    app_metadata: { role: account.role, governance_status: "active" },
    user_metadata: { display_name: account.label }
  });
  if (metadataError) throw metadataError;
}

async function createDemoUsers(supabase, accounts) {
  for (const account of accounts) {
    const email = account.email.toLowerCase();
    const { data, error } = await supabase.auth.admin.createUser({
      id: account.id,
      email,
      password: account.password,
      email_confirm: true,
      user_metadata: { display_name: account.label },
      app_metadata: { role: account.role, governance_status: "active" }
    });
    if (error || !data.user) {
      throw new Error(`Failed to create ${email}: ${error?.message ?? "missing user"}`);
    }

    await provisionUser(supabase, account);
    console.log(`created ${email} (${account.role}) id=${account.id}`);
  }
}

async function verifyLogin(url, anonKey, account) {
  const verifier = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data, error } = await verifier.auth.signInWithPassword({
    email: account.email,
    password: account.password
  });
  if (error) throw error;
  if (data.user?.id !== account.id) {
    throw new Error(`Login id mismatch for ${account.email}: expected ${account.id}, got ${data.user?.id}`);
  }
  console.log(`verified ${account.email}`);
}

async function main() {
  loadEnvLocal();

  if (process.env.ALLOW_DEMO_SEED !== "true") {
    throw new Error("Set ALLOW_DEMO_SEED=true in .env.local before running reset-demo-users.");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !serviceRoleKey || !anonKey) {
    throw new Error("Missing Supabase env vars in .env.local");
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const demoAccounts = await loadDemoAccounts(supabase);
  if (!demoAccounts.length) {
    throw new Error("No enabled demo_access_accounts rows found in Supabase.");
  }

  console.log("Resetting all users and seeding demo accounts from Supabase...");
  await ensureRoles(supabase);
  await clearUserReferences(supabase);
  await deleteAllAuthUsers(supabase, url, serviceRoleKey);
  await createDemoUsers(supabase, demoAccounts);

  for (const account of demoAccounts) {
    await verifyLogin(url, anonKey, account);
  }

  console.log("DEMO_USERS_RESET_COMPLETE");
  for (const account of demoAccounts) {
    console.log(`${account.role}: ${account.email} (id: ${account.id}) — password stored in Supabase Auth`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
