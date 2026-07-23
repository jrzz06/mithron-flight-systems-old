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

/** Decode a `next` value at most once when the whole string is still percent-encoded. */
function decodeAuthNextOnce(value: string) {
  let current = value.trim();
  if (!current) return "";

  // Whole-string encoding (e.g. "%2Fadmin%3Fnext%3D%2Faccount") — decode once only.
  if (!current.startsWith("/") && /%[0-9A-Fa-f]{2}/.test(current)) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded.startsWith("/") && !decoded.startsWith("//")) {
        current = decoded;
      }
    } catch {
      return "";
    }
  }

  return current;
}

/**
 * Unwrap nested `next` chains and reject auth bounce destinations so redirects
 * cannot grow into `/admin?next=/admin?next=/login?next=...`.
 *
 * Sanitizes once: peels auth bounce wrappers, strips a nested `next` off a real
 * destination, and falls back when depth is exceeded or the chain is circular.
 */
export function unwrapAuthNextPath(value: string | null | undefined, fallback = "/") {
  let current = decodeAuthNextOnce(typeof value === "string" ? value : "");
  if (!current) return fallback;

  const seen = new Set<string>();

  for (let depth = 0; depth < 8; depth += 1) {
    if (seen.has(current)) return fallback;
    seen.add(current);

    const safe = getSafeAuthRedirectPath(current, "");
    if (!safe) return fallback;

    let parsed: URL;
    try {
      parsed = new URL(safe, AUTH_LOCAL_ORIGIN);
    } catch {
      return fallback;
    }

    const nested = parsed.searchParams.get("next");

    // Real destination: never keep a nested `next` on it — consume once and stop.
    if (!isAuthBouncePath(parsed.pathname)) {
      const cleaned = buildCleanPath(parsed.pathname, parsed.searchParams);
      return `${cleaned}${parsed.hash}`;
    }

    // Auth bounce with no further next → safe default (do not redirect to the bounce itself).
    if (!nested) return fallback;

    // Nested next on a bounce path: peel one layer (already decoded by URLSearchParams).
    current = nested.trim();
    if (!current) return fallback;
  }

  // Depth exceeded — refuse to keep wrapping.
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

/** RBAC denial: role home + forbidden status + a single sanitized `next`. */
export function buildAccessDeniedRedirectPath(
  roleHome: string,
  attemptedPath: string,
  options?: { statusKey?: "access_status" | "admin_status"; fallbackNext?: string }
) {
  const statusKey = options?.statusKey ?? "access_status";
  const fallbackNext = options?.fallbackNext ?? roleHome;
  const safeNext = unwrapAuthNextPath(attemptedPath, fallbackNext);
  const params = new URLSearchParams({
    [statusKey]: "forbidden",
    next: safeNext
  });
  return `${roleHome}?${params.toString()}`;
}

export function resolveClientAuthRedirectPath(path: string | null | undefined, fallback = "/account") {
  return unwrapAuthNextPath(path, fallback);
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
