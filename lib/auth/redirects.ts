import {
  canAccessProtectedPath,
  defaultPathForRole,
  isAuthPublicPath,
  isControlPanelPath,
  isControlPanelRole,
  normalizeCmsRole,
  type CmsRole
} from "./access-control";

const AUTH_LOCAL_ORIGIN = "http://mithron.local";

/** Paths that only exist to bounce users through auth — never use them as the final `next`. */
const AUTH_BOUNCE_PATH_PREFIXES = [
  "/login",
  "/account/complete-profile",
  "/auth/callback",
  "/auth/confirm",
  "/auth/logout",
  "/logout",
  "/forgot-password",
  "/reset-password",
  "/invite"
] as const;

const TRANSIENT_AUTH_QUERY_KEYS = [
  "next",
  "access_status",
  "admin_status",
  "auth_status",
  "auth_error",
  "logout_status",
  "logout_reason",
  "logout_notice",
  "code",
  "error",
  "error_description",
  "error_code"
] as const;

function normalizePathname(pathname: string) {
  if (!pathname || pathname === "/") return "/";
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function isAuthBouncePath(pathname: string) {
  const normalized = normalizePathname(pathname);
  return AUTH_BOUNCE_PATH_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`)
  );
}

export function getSafeAuthRedirectPath(value: string | null | undefined, fallback = "/admin") {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;

  try {
    const parsed = new URL(value, AUTH_LOCAL_ORIGIN);
    if (parsed.origin !== AUTH_LOCAL_ORIGIN) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

/**
 * Unwrap nested `next` chains and reject auth bounce destinations so redirects
 * cannot grow into `/admin?next=/admin?next=/login?next=...`.
 */
export function unwrapAuthNextPath(value: string | null | undefined, fallback = "/") {
  let current = typeof value === "string" ? value.trim() : "";
  if (!current) return fallback;

  for (let depth = 0; depth < 8; depth += 1) {
    const safe = getSafeAuthRedirectPath(current, "");
    if (!safe) return fallback;

    let parsed: URL;
    try {
      parsed = new URL(safe, AUTH_LOCAL_ORIGIN);
    } catch {
      return fallback;
    }

    if (!isAuthBouncePath(parsed.pathname)) {
      const cleaned = buildCleanPath(parsed.pathname, parsed.searchParams);
      return `${cleaned}${parsed.hash}`;
    }

    const nested = parsed.searchParams.get("next");
    if (!nested) return fallback;
    current = nested;
  }

  return fallback;
}

function buildCleanPath(pathname: string, searchParams: URLSearchParams) {
  const params = new URLSearchParams(searchParams);
  for (const key of TRANSIENT_AUTH_QUERY_KEYS) {
    params.delete(key);
  }
  const qs = params.toString();
  const path = normalizePathname(pathname);
  return qs ? `${path}?${qs}` : path;
}

/**
 * Single source of truth for the post-login destination taken from the current request.
 * Never nests a new `next` when one already exists.
 */
export function resolveIntendedAuthNext(
  pathname: string,
  searchParams: URLSearchParams,
  fallback = "/"
) {
  const existingNext = searchParams.get("next");
  if (existingNext) {
    return unwrapAuthNextPath(existingNext, fallback);
  }

  if (isAuthBouncePath(pathname) || isAuthPublicPath(pathname)) {
    return fallback;
  }

  return getSafeAuthRedirectPath(buildCleanPath(pathname, searchParams), fallback);
}

export function buildLoginRedirectPath(nextPath: string, extraParams?: Record<string, string>) {
  const safeNext = unwrapAuthNextPath(nextPath, "/account");
  const params = new URLSearchParams(extraParams);
  params.set("next", safeNext);
  return `/login?${params.toString()}`;
}

export function buildProfileCompletionRedirectPath(nextPath: string) {
  const safeNext = unwrapAuthNextPath(nextPath, "/account");
  const params = new URLSearchParams({ next: safeNext });
  return `/account/complete-profile?${params.toString()}`;
}

export function resolveClientAuthRedirectPath(path: string | null | undefined, fallback = "/account") {
  const value = typeof path === "string" ? path.trim() : "";
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

export function getRoleAwareAuthRedirectPath(value: string | null | undefined, roleValue: CmsRole | string | null | undefined) {
  const role = normalizeCmsRole(roleValue);
  if (!role) return "/login?auth_status=role_required";

  const roleHome = defaultPathForRole(role);
  const requestedPath = unwrapAuthNextPath(value, "");

  // Staff always land on their panel — only honor next when it is their control panel.
  if (isControlPanelRole(role)) {
    if (
      requestedPath
      && canAccessProtectedPath(role, requestedPath)
      && isControlPanelPath(requestedPath)
    ) {
      return requestedPath;
    }
    return roleHome;
  }

  // Customers: /account by default; allow safe storefront next; never staff shells.
  if (!requestedPath || requestedPath === "/login") return roleHome;
  if (isControlPanelPath(requestedPath)) return roleHome;
  const pathOnly = normalizePathname(requestedPath.split("?")[0] ?? requestedPath);
  if (pathOnly === "/account/complete-profile") return roleHome;
  return requestedPath;
}
