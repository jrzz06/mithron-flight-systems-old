import { createClient as createSupabaseServiceClient } from "@supabase/supabase-js";
import { assertSupabaseAdminConfig } from "@/lib/env";
import { buildProfileCompletionRedirectPath } from "@/lib/auth/redirects";
import { validateSignupFullName, validateSignupPhone } from "@/lib/auth/signup-validation";

export type ProfileIdentityFields = {
  display_name?: string | null;
  full_name?: string | null;
  phone?: string | null;
};

export const PROFILE_COMPLETION_PATH = "/account/complete-profile";

const PROFILE_COMPLETION_ALLOW_PREFIXES = [
  PROFILE_COMPLETION_PATH,
  "/login",
  "/auth/logout",
  "/api/auth/",
  "/auth/callback",
  "/auth/confirm",
  "/forgot-password",
  "/reset-password"
] as const;

export function isProfileIdentityComplete(profile: ProfileIdentityFields): boolean {
  const name = (profile.full_name?.trim() || profile.display_name?.trim() || "");
  const nameResult = validateSignupFullName(name);
  if (!nameResult.ok) return false;

  const phoneResult = validateSignupPhone(profile.phone?.trim() || "");
  return phoneResult.ok;
}

export function isProfileCompletionExemptPath(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  return PROFILE_COMPLETION_ALLOW_PREFIXES.some((prefix) => {
    if (prefix.endsWith("/")) {
      return normalized.startsWith(prefix);
    }
    return normalized === prefix || normalized.startsWith(`${prefix}/`);
  });
}

export function buildProfileCompletionRedirect(nextPath: string): string {
  return buildProfileCompletionRedirectPath(nextPath);
}

function serviceClient(env: Record<string, string | undefined> = process.env) {
  const config = assertSupabaseAdminConfig(env);
  return createSupabaseServiceClient(config.url, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

export async function fetchProfileIdentityFields(
  userId: string,
  env: Record<string, string | undefined> = process.env
): Promise<ProfileIdentityFields | null> {
  const supabase = serviceClient(env);
  const { data, error } = await supabase
    .from("profiles")
    .select("display_name,full_name,phone")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.warn("[mithron-auth] Failed to load profile identity fields.", error.message);
    return null;
  }

  return data;
}

export async function isUserProfileIdentityComplete(
  userId: string,
  env: Record<string, string | undefined> = process.env
): Promise<boolean> {
  const profile = await fetchProfileIdentityFields(userId, env);
  if (!profile) return false;
  return isProfileIdentityComplete(profile);
}

export async function completeProfileIdentity(
  input: {
    userId: string;
    fullName: string;
    phone: string;
  },
  env: Record<string, string | undefined> = process.env
) {
  const nameResult = validateSignupFullName(input.fullName);
  if (!nameResult.ok) {
    throw new Error(nameResult.error);
  }

  const phoneResult = validateSignupPhone(input.phone);
  if (!phoneResult.ok) {
    throw new Error(phoneResult.error);
  }

  const supabase = serviceClient(env);
  const now = new Date().toISOString();
  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      display_name: nameResult.value,
      full_name: nameResult.value,
      phone: phoneResult.value,
      updated_at: now
    })
    .eq("id", input.userId);

  if (profileError) {
    throw new Error(`Failed to update profile: ${profileError.message}`);
  }

  const authUser = await supabase.auth.admin.getUserById(input.userId);
  if (authUser.error || !authUser.data.user) {
    throw new Error("Unable to load your account.");
  }

  const { error: metadataError } = await supabase.auth.admin.updateUserById(input.userId, {
    user_metadata: {
      ...(authUser.data.user.user_metadata ?? {}),
      full_name: nameResult.value,
      display_name: nameResult.value,
      phone: phoneResult.value
    }
  });

  if (metadataError) {
    throw new Error(`Failed to sync account metadata: ${metadataError.message}`);
  }
}
