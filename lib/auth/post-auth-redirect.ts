import {
  defaultPathForRole,
  isControlPanelRole,
  normalizeCmsRole
} from "@/lib/auth/access-control";
import { resolveGuestPostAuthRedirect } from "@/lib/auth/guest-auth";
import { getRoleAwareAuthRedirectPath } from "@/lib/auth/redirects";
import { adminUserNeedsMfaEnrollment, getAdminMfaRedirectPath } from "@/lib/auth/admin-mfa";
import {
  buildProfileCompletionRedirect,
  isUserProfileIdentityComplete
} from "@/lib/auth/profile-identity";
import type { User } from "@supabase/supabase-js";

export function resolvePostAuthRedirect(input: {
  user: User;
  role: string;
  nextPath: string;
}) {
  const role = normalizeCmsRole(input.role);

  // Staff: always their panel (MFA may wrap). Never storefront next.
  if (role && isControlPanelRole(role)) {
    const panelHome = defaultPathForRole(role);
    const target = getRoleAwareAuthRedirectPath(input.nextPath, role);
    if (adminUserNeedsMfaEnrollment(input.user)) {
      return getAdminMfaRedirectPath(target);
    }
    return target || panelHome;
  }

  // Customers: /account or safe storefront next.
  if (adminUserNeedsMfaEnrollment(input.user)) {
    return getAdminMfaRedirectPath(resolveGuestPostAuthRedirect(input.nextPath));
  }
  return resolveGuestPostAuthRedirect(input.nextPath);
}

export async function resolvePostAuthRedirectWithProfileCheck(input: {
  user: User;
  role: string;
  nextPath: string;
}) {
  const target = resolvePostAuthRedirect(input);
  const role = normalizeCmsRole(input.role);

  // Profile completion is customers only — staff skip the gate entirely.
  if (role && isControlPanelRole(role)) {
    return target;
  }

  const complete = await isUserProfileIdentityComplete(input.user.id);
  if (complete) return target;
  return buildProfileCompletionRedirect(target);
}

/**
 * Already signed-in visitors hitting /login.
 * Sync destination only — customer profile gate is enforced in proxy / post-auth with profile check.
 */
export function resolveLoginPageRedirect(input: {
  user: User;
  role: string;
  nextPath: string;
}) {
  return resolvePostAuthRedirect(input);
}

export { resolveGuestPostAuthRedirect, GUEST_AUTH_HOME, CUSTOMER_AUTH_HOME } from "@/lib/auth/guest-auth";
