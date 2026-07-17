import { createClient as createSupabaseServiceClient } from "@supabase/supabase-js";
import { assertSupabaseAdminConfig } from "@/lib/env";
import { provisionAuthenticatedUser } from "@/services/auth-provisioning";

type EnvSource = Record<string, string | undefined>;

export type ManualOrderCustomer = {
  userId: string | null;
  email: string;
  phone: string;
  displayName: string;
  created: boolean;
};

export type CustomerLookupRow = {
  id: string;
  email: string;
  phone: string | null;
  displayName: string;
};

function serviceClient(env: EnvSource = process.env) {
  const config = assertSupabaseAdminConfig(env);
  return createSupabaseServiceClient(config.url, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

function headers(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json"
  };
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function generatedTemporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$";
  return Array.from({ length: 16 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

async function findAuthUserByEmail(supabase: ReturnType<typeof serviceClient>, email: string) {
  const normalizedEmail = normalizeEmail(email);
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Failed to inspect auth users: ${error.message}`);
    const match = data.users.find((user) => user.email?.toLowerCase() === normalizedEmail);
    if (match) return match;
    if (data.users.length < 200) break;
  }
  return null;
}

async function findProfileByEmail(email: string, env: EnvSource = process.env) {
  const config = assertSupabaseAdminConfig(env);
  const response = await fetch(
    `${config.url}/rest/v1/profiles?select=id,email,phone,display_name&email=eq.${encodeURIComponent(normalizeEmail(email))}&limit=1`,
    { headers: headers(config.serviceRoleKey), cache: "no-store" }
  );
  if (!response.ok) return null;
  const rows = (await response.json()) as Array<{ id?: string; email?: string; phone?: string; display_name?: string }>;
  return rows[0] ?? null;
}

async function findProfileByPhone(phone: string, env: EnvSource = process.env) {
  const normalized = phone.trim();
  if (!normalized) return null;
  const config = assertSupabaseAdminConfig(env);
  const response = await fetch(
    `${config.url}/rest/v1/profiles?select=id,email,phone,display_name&phone=eq.${encodeURIComponent(normalized)}&limit=1`,
    { headers: headers(config.serviceRoleKey), cache: "no-store" }
  );
  if (!response.ok) return null;
  const rows = (await response.json()) as Array<{ id?: string; email?: string; phone?: string; display_name?: string }>;
  return rows[0] ?? null;
}

export async function lookupCustomers(query: string, limit = 8, env: EnvSource = process.env): Promise<CustomerLookupRow[]> {
  const q = query.trim();
  if (!q || q.length < 2) return [];

  const config = assertSupabaseAdminConfig(env);
  const encoded = encodeURIComponent(q);
  const filter = `or=(email.ilike.*${encoded}*,display_name.ilike.*${encoded}*,phone.ilike.*${encoded}*)`;
  const response = await fetch(
    `${config.url}/rest/v1/profiles?select=id,email,phone,display_name&${filter}&order=updated_at.desc&limit=${limit}`,
    { headers: headers(config.serviceRoleKey), cache: "no-store" }
  );
  if (!response.ok) return [];

  const rows = (await response.json()) as Array<{ id?: string; email?: string; phone?: string; display_name?: string }>;
  return rows
    .filter((row) => row.id)
    .map((row) => ({
      id: String(row.id),
      email: String(row.email ?? ""),
      phone: row.phone ?? null,
      displayName: String(row.display_name ?? row.email ?? "Customer")
    }));
}

export async function resolveManualOrderCustomer(
  input: {
    email: string;
    phone: string;
    fullName: string;
    customerUserId?: string | null;
    createAccountIfMissing: boolean;
    actorId: string;
  },
  env: EnvSource = process.env
): Promise<ManualOrderCustomer> {
  const email = normalizeEmail(input.email);
  const phone = input.phone.trim();
  const displayName = input.fullName.trim() || email;

  if (input.customerUserId) {
    const config = assertSupabaseAdminConfig(env);
    const response = await fetch(
      `${config.url}/rest/v1/profiles?select=id,email,phone,display_name&id=eq.${encodeURIComponent(input.customerUserId)}&limit=1`,
      { headers: headers(config.serviceRoleKey), cache: "no-store" }
    );
    if (response.ok) {
      const rows = (await response.json()) as Array<{ id?: string; email?: string; phone?: string; display_name?: string }>;
      const profile = rows[0];
      if (profile?.id) {
        return {
          userId: String(profile.id),
          email: String(profile.email ?? email),
          phone: String(profile.phone ?? phone),
          displayName: String(profile.display_name ?? displayName),
          created: false
        };
      }
    }
  }

  const byEmail = await findProfileByEmail(email, env);
  if (byEmail?.id) {
    return {
      userId: String(byEmail.id),
      email: String(byEmail.email ?? email),
      phone: String(byEmail.phone ?? phone),
      displayName: String(byEmail.display_name ?? displayName),
      created: false
    };
  }

  const byPhone = phone ? await findProfileByPhone(phone, env) : null;
  if (byPhone?.id) {
    return {
      userId: String(byPhone.id),
      email: String(byPhone.email ?? email),
      phone: String(byPhone.phone ?? phone),
      displayName: String(byPhone.display_name ?? displayName),
      created: false
    };
  }

  if (!input.createAccountIfMissing) {
    return { userId: null, email, phone, displayName, created: false };
  }

  const supabase = serviceClient(env);
  const existingAuth = await findAuthUserByEmail(supabase, email);
  if (existingAuth) {
    await provisionAuthenticatedUser({
      userId: existingAuth.id,
      email,
      displayName,
      phone,
      preferredRole: "user",
      actorId: input.actorId
    }, env).catch(() => undefined);

    return {
      userId: existingAuth.id,
      email,
      phone,
      displayName,
      created: false
    };
  }

  const password = generatedTemporaryPassword();
  const created = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
    app_metadata: { role: "user", governance_status: "active" }
  });
  if (created.error || !created.data.user) {
    throw new Error(`Failed to create customer account: ${created.error?.message ?? "missing auth user"}`);
  }

  await provisionAuthenticatedUser({
    userId: created.data.user.id,
    email,
    displayName,
    phone,
    preferredRole: "user",
    actorId: input.actorId
  }, env);

  return {
    userId: created.data.user.id,
    email,
    phone,
    displayName,
    created: true
  };
}
