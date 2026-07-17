import { createClient as createSupabaseServiceClient } from "@supabase/supabase-js";
import { assertSupabaseAdminConfig } from "@/lib/env";
import { ProfileDisabledError } from "@/lib/auth/profile-disabled";
import { normalizeCmsRole, type CmsRole } from "@/lib/auth/permissions";
import { linkGuestOrdersToUser } from "@/services/customer-orders";
import { linkGuestEnquiriesToUser } from "@/services/enquiries";
import { resolveOperatorRoleForEmail } from "@/services/demo-access-accounts";

type EnvSource = Record<string, string | undefined>;

const canonicalRoleRows: Record<CmsRole, { label: string; description: string; sort_order: number }> = {
  admin: {
    label: "Admin",
    description: "Full admin, CMS, product, media, order, warehouse, settings, and audit access.",
    sort_order: 1
  },
  warehouse: {
    label: "Warehouse",
    description: "Inventory, shipment, stock, and order-fulfillment access.",
    sort_order: 2
  },
  supplier: {
    label: "Supplier",
    description: "Submit and manage own products pending admin approval.",
    sort_order: 3
  },
  user: {
    label: "User",
    description: "Storefront customer access with orders, enquiries, and profile.",
    sort_order: 4
  }
};

function serviceClient(env: EnvSource = process.env) {
  const config = assertSupabaseAdminConfig(env);
  return createSupabaseServiceClient(config.url, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

export async function ensureAllCanonicalRoles(env: EnvSource = process.env) {
  const supabase = serviceClient(env);
  for (const [key, row] of Object.entries(canonicalRoleRows) as Array<[CmsRole, (typeof canonicalRoleRows)[CmsRole]]>) {
    const { error } = await supabase.from("roles").upsert({ key, ...row }, { onConflict: "key" });
    if (error) {
      throw new Error(`Failed to ensure role ${key}: ${error.message}`);
    }
  }
}

async function syncProfileIdentityFields(
  supabase: ReturnType<typeof serviceClient>,
  input: {
    userId: string;
    email?: string | null;
    displayName?: string | null;
    fullName?: string | null;
    avatarUrl?: string | null;
    firebaseUid?: string | null;
    phone?: string | null;
  }
) {
  const patch: Record<string, string | null> = {
    updated_at: new Date().toISOString()
  };
  if (input.firebaseUid) patch.firebase_uid = input.firebaseUid;
  if (input.phone) patch.phone = input.phone;
  if (input.email) patch.email = input.email.trim().toLowerCase();
  const resolvedName = input.fullName?.trim() || input.displayName?.trim();
  if (resolvedName) {
    patch.full_name = resolvedName;
    patch.display_name = resolvedName;
  }
  if (input.avatarUrl?.trim()) patch.avatar_url = input.avatarUrl.trim();

  if (Object.keys(patch).length <= 1) return;

  const { error } = await supabase.from("profiles").update(patch).eq("id", input.userId);
  if (error) {
    throw new Error(`Failed to sync profile identity for ${input.userId}: ${error.message}`);
  }
}

function resolveAvatarUrl(user: { user_metadata?: Record<string, unknown> | null }) {
  const metadata = user.user_metadata ?? {};
  if (typeof metadata.avatar_url === "string" && metadata.avatar_url.trim()) {
    return metadata.avatar_url.trim();
  }
  if (typeof metadata.picture === "string" && metadata.picture.trim()) {
    return metadata.picture.trim();
  }
  return null;
}

export async function syncGuestProfileFromIdentity(
  input: {
    userId: string;
    email?: string | null;
    displayName?: string | null;
    fullName?: string | null;
    avatarUrl?: string | null;
    firebaseUid?: string | null;
    phone?: string | null;
  },
  env: EnvSource = process.env
) {
  const supabase = serviceClient(env);
  await syncProfileIdentityFields(supabase, input);

  if (input.email?.trim()) {
    await linkGuestOrdersToUser(input.userId, input.email, env).catch((error) => {
      console.warn("[mithron-auth] Guest order linking failed.", error);
    });
    await linkGuestEnquiriesToUser(input.userId, input.email, env).catch((error) => {
      console.warn("[mithron-auth] Guest enquiry linking failed.", error);
    });
  }

  const authUser = await supabase.auth.admin.getUserById(input.userId);
  if (authUser.error || !authUser.data.user) return;

  const user = authUser.data.user;
  const metadataPatch: Record<string, string> = {};
  if (input.displayName?.trim()) metadataPatch.display_name = input.displayName.trim();
  if (input.displayName?.trim()) metadataPatch.full_name = input.displayName.trim();

  if (!Object.keys(metadataPatch).length) return;

  const { error } = await supabase.auth.admin.updateUserById(input.userId, {
    user_metadata: {
      ...(user.user_metadata ?? {}),
      ...metadataPatch
    }
  });
  if (error) {
    throw new Error(`Failed to sync auth metadata for ${input.userId}: ${error.message}`);
  }
}

export async function provisionAuthenticatedUser(input: {
  userId: string;
  email?: string | null;
  displayName?: string | null;
  fullName?: string | null;
  avatarUrl?: string | null;
  preferredRole?: string | null;
  assignedWarehouseCode?: string | null;
  firebaseUid?: string | null;
  phone?: string | null;
  actorId?: string | null;
}, env: EnvSource = process.env) {
  const userId = input.userId.trim();
  if (!userId) throw new Error("Authenticated user provisioning requires a user id.");

  await ensureAllCanonicalRoles(env);
  const supabase = serviceClient(env);
  const authUser = await supabase.auth.admin.getUserById(userId);
  if (authUser.error || !authUser.data.user) {
    throw new Error(`Failed to load auth user ${userId}: ${authUser.error?.message ?? "missing user"}`);
  }

  const user = authUser.data.user;
  const email = (input.email ?? user.email ?? "").trim().toLowerCase();

  const { data: existingProfile, error: existingProfileError } = await supabase
    .from("profiles")
    .select("governance_status")
    .eq("id", userId)
    .maybeSingle();
  if (existingProfileError) {
    throw new Error(`Failed to inspect profile for ${userId}: ${existingProfileError.message}`);
  }
  if (existingProfile?.governance_status === "disabled") {
    throw new ProfileDisabledError();
  }

  const metadataRole = normalizeCmsRole(
    input.preferredRole ?? "user"
  ) ?? "user";
  const displayName = input.fullName?.trim()
    || input.displayName?.trim()
    || (typeof user.user_metadata?.display_name === "string" ? user.user_metadata.display_name : null)
    || (typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null)
    || email
    || "Mithron user";
  const avatarUrl = input.avatarUrl?.trim() || resolveAvatarUrl(user);
  const phone = input.phone?.trim()
    || (typeof user.user_metadata?.phone === "string" ? user.user_metadata.phone.trim() : null);
  const now = new Date().toISOString();

  const { data: existingRoles, error: rolesError } = await supabase
    .from("user_roles")
    .select("role_key")
    .eq("user_id", userId);
  if (rolesError) {
    throw new Error(`Failed to read user roles for ${userId}: ${rolesError.message}`);
  }

  const roleKeys = (existingRoles ?? [])
    .map((row) => normalizeCmsRole(row.role_key))
    .filter(Boolean) as CmsRole[];
  const explicitRole = input.preferredRole ? normalizeCmsRole(input.preferredRole) : null;
  const assignedRole = explicitRole ?? roleKeys[0] ?? metadataRole;

  const profileRow: Record<string, string | null> = {
    id: userId,
    email: email || null,
    display_name: displayName,
    full_name: displayName,
    default_role: assignedRole,
    governance_status: "active",
    updated_at: now
  };
  if (avatarUrl) profileRow.avatar_url = avatarUrl;
  if (input.firebaseUid) profileRow.firebase_uid = input.firebaseUid;
  if (phone) profileRow.phone = phone;
  if (input.assignedWarehouseCode) {
    profileRow.assigned_warehouse_code = input.assignedWarehouseCode.trim();
  }

  const { error: profileError } = await supabase.from("profiles").upsert(profileRow, { onConflict: "id" });
  if (profileError) {
    throw new Error(`Failed to upsert profile for ${userId}: ${profileError.message}`);
  }

  if (explicitRole) {
    const { error: clearRolesError } = await supabase.from("user_roles").delete().eq("user_id", userId);
    if (clearRolesError) {
      throw new Error(`Failed to reset roles for ${userId}: ${clearRolesError.message}`);
    }
  }

  if (explicitRole || !roleKeys.length) {
    const { error: userRoleError } = await supabase.from("user_roles").upsert(
      { user_id: userId, role_key: assignedRole },
      { onConflict: "user_id,role_key" }
    );
    if (userRoleError) {
      throw new Error(`Failed to assign role ${assignedRole} to ${userId}: ${userRoleError.message}`);
    }
  }

  const existingAppRole = normalizeCmsRole(user.app_metadata?.role);
  if (existingAppRole !== assignedRole) {
    const { error: metadataError } = await supabase.auth.admin.updateUserById(userId, {
      app_metadata: {
        ...(user.app_metadata ?? {}),
        role: assignedRole,
        governance_status: "active"
      }
    });
    if (metadataError) {
      throw new Error(`Failed to sync auth metadata for ${userId}: ${metadataError.message}`);
    }
  }

  return { userId, email, role: assignedRole };
}

export async function provisionAuthenticatedUserIfMissing(input: {
  userId: string;
  email?: string | null;
  emailConfirmedAt?: string | null;
  displayName?: string | null;
  fullName?: string | null;
  avatarUrl?: string | null;
  preferredRole?: string | null;
  firebaseUid?: string | null;
  phone?: string | null;
}, env: EnvSource = process.env) {
  const supabase = serviceClient(env);
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id,governance_status")
    .eq("id", input.userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to inspect profile for ${input.userId}: ${error.message}`);
  }

  if (profile?.governance_status === "disabled") {
    throw new ProfileDisabledError();
  }

  const { count, error: roleCountError } = await supabase
    .from("user_roles")
    .select("role_key", { count: "exact", head: true })
    .eq("user_id", input.userId);
  if (roleCountError) {
    throw new Error(`Failed to inspect user roles for ${input.userId}: ${roleCountError.message}`);
  }

  if (profile && (count ?? 0) > 0 && profile.governance_status !== "disabled") {
    const operatorRole = await resolveOperatorRoleForEmail(input.email, env).catch(() => null);
    if (operatorRole) {
      await provisionAuthenticatedUser({
        userId: input.userId,
        email: input.email,
        displayName: input.displayName,
        fullName: input.fullName ?? input.displayName,
        avatarUrl: input.avatarUrl,
        preferredRole: operatorRole
      }, env);
    }

    await syncProfileIdentityFields(supabase, {
      userId: input.userId,
      email: input.email,
      displayName: input.displayName,
      fullName: input.fullName ?? input.displayName,
      avatarUrl: input.avatarUrl,
      firebaseUid: input.firebaseUid,
      phone: input.phone
    });
    if (input.email?.trim() && input.emailConfirmedAt) {
      await linkGuestOrdersToUser(input.userId, input.email, env).catch((error) => {
        console.warn("[mithron-auth] Guest order linking failed.", error);
      });
    }
    return null;
  }

  const provisioned = await provisionAuthenticatedUser(input, env);
  if (input.email?.trim() && input.emailConfirmedAt) {
    await linkGuestOrdersToUser(input.userId, input.email, env).catch((error) => {
      console.warn("[mithron-auth] Guest order linking failed.", error);
    });
    await linkGuestEnquiriesToUser(input.userId, input.email, env).catch((error) => {
      console.warn("[mithron-auth] Guest enquiry linking failed.", error);
    });
  }
  return provisioned;
}
