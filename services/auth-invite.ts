import { createHash } from "node:crypto";
import { createClient as createSupabaseServiceClient } from "@supabase/supabase-js";
import { assertSupabaseAdminConfig } from "@/lib/env";
import { normalizeCmsRole, type CmsRole } from "@/lib/auth/permissions";
import { provisionAuthenticatedUser } from "@/services/auth-provisioning";

type EnvSource = Record<string, string | undefined>;

function headers(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json"
  };
}

function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function resolveInviteRoleForUser(input: {
  userId: string;
  email: string;
  inviteToken?: string | null;
  /** @deprecated Ignored for security — roles require a validated invite token hash. */
  invitedRole?: string | null;
}, env: EnvSource = process.env): Promise<CmsRole | null> {
  const config = assertSupabaseAdminConfig(env);
  const email = input.email.trim().toLowerCase();
  const inviteToken = input.inviteToken?.trim();
  if (!email || !inviteToken) return null;

  const query = `${config.url}/rest/v1/admin_invites?select=id,email,role_key,status,expires_at,token_hash&email=eq.${encodeURIComponent(email)}&status=eq.pending&order=expires_at.desc&limit=5`;
  const response = await fetch(query, {
    headers: headers(config.serviceRoleKey),
    cache: "no-store"
  });
  if (!response.ok) return null;

  const rows = (await response.json()) as Array<{
    id?: string;
    role_key?: string;
    expires_at?: string;
    token_hash?: string;
  }>;

  const now = Date.now();
  const hashed = hashInviteToken(inviteToken);
  const invite = rows.find((row) => {
    if (row.token_hash !== hashed) return false;
    const expires = row.expires_at ? Date.parse(row.expires_at) : NaN;
    return !Number.isFinite(expires) || expires > now;
  });

  const role = normalizeCmsRole(invite?.role_key);
  if (!invite?.id || !role || role === "user") {
    return null;
  }

  await provisionAuthenticatedUser({
    userId: input.userId,
    email,
    preferredRole: role
  }, env);

  if (invite?.id) {
    const supabase = createSupabaseServiceClient(config.url, config.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { error: inviteError } = await supabase
      .from("admin_invites")
      .update({
        status: "accepted",
        accepted_by: input.userId,
        accepted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", invite.id);
    if (inviteError) {
      console.warn("[mithron-auth] Failed to mark invite accepted.", inviteError.message);
    }
  }

  return role;
}
