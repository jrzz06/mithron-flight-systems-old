import { isControlPanelPath } from "@/lib/auth/access-control";
import { unwrapAuthNextPath } from "@/lib/auth/redirects";

/** Customer post-auth home (Google + email + OTP). */
export const GUEST_AUTH_HOME = "/account";
export const CUSTOMER_AUTH_HOME = GUEST_AUTH_HOME;

function isSafeCustomerNextPath(pathnameWithSearch: string) {
  const pathname = pathnameWithSearch.split("?")[0] || "/";
  const normalized = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;

  if (!normalized || normalized === "/login") return false;
  if (isControlPanelPath(normalized)) return false;
  if (normalized === "/account/complete-profile" || normalized.startsWith("/account/complete-profile/")) {
    return false;
  }
  // /account hub, storefront catalog, checkout, etc.
  return true;
}

/** Storefront customers land on /account unless a safe storefront next was requested. */
export function resolveGuestPostAuthRedirect(nextPath: string) {
  const requested = unwrapAuthNextPath(nextPath, "");
  if (!requested) return CUSTOMER_AUTH_HOME;
  if (!isSafeCustomerNextPath(requested)) return CUSTOMER_AUTH_HOME;
  return requested;
}
