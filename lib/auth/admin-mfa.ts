import type { User } from "@supabase/supabase-js";
import { normalizeCmsRole } from "@/lib/auth/permissions";

type EnvSource = Record<string, string | undefined>;

export function isAdminMfaRequired(env: EnvSource = process.env) {
  return env.AUTH_ADMIN_MFA_REQUIRED?.trim().toLowerCase() === "true";
}

export function adminUserNeedsMfaEnrollment(user: User, env: EnvSource = process.env) {
  if (!isAdminMfaRequired(env)) return false;

  const role = normalizeCmsRole(user.app_metadata?.role);
  if (role !== "admin") return false;

  return user.app_metadata?.mfa_enrolled !== true;
}

export function getAdminMfaRedirectPath(nextPath: string) {
  const params = new URLSearchParams({ mfa_required: "1" });
  if (nextPath) params.set("next", nextPath);
  return `/account/security?${params.toString()}`;
}
