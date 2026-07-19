import { normalizeCmsRole, type CmsRole } from "./permissions";

export type { CmsRole } from "./permissions";

export type AdminSection =
  | "overview"
  | "cms"
  | "products"
  | "warehouse"
  | "orders"
  | "operations"
  | "tasks"
  | "audit"
  | "suppliers"
  | "enquiries";

const protectedPrefixes = ["/admin", "/warehouse", "/operations", "/account", "/supplier"] as const;
const authPublicPrefixes = ["/login", "/auth/login", "/auth/callback", "/auth/confirm", "/auth/logout", "/logout"] as const;

const roleAccess: Record<CmsRole, AdminSection[]> = {
  admin: ["overview", "cms", "products", "warehouse", "orders", "operations", "tasks", "audit", "suppliers", "enquiries"],
  warehouse: ["warehouse", "orders"],
  supplier: ["products"],
  user: []
};

function normalizePath(pathname: string) {
  const [path] = pathname.split("?");
  if (!path || path === "/") return "/";
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isAdminProtectedPath(pathname: string) {
  const normalized = normalizePath(pathname);
  return protectedPrefixes.some((prefix) => matchesPrefix(normalized, prefix));
}

export function isAuthPublicPath(pathname: string) {
  const normalized = normalizePath(pathname);
  return authPublicPrefixes.some((prefix) => matchesPrefix(normalized, prefix));
}

export function canAccessAdminSection(role: CmsRole | string | null | undefined, section: AdminSection) {
  const normalized = normalizeCmsRole(role);
  if (!normalized) return false;
  return roleAccess[normalized]?.includes(section) ?? false;
}

export function isStrictAdminRole(role: CmsRole | string | null | undefined) {
  return normalizeCmsRole(role) === "admin";
}

export function defaultPathForRole(role: CmsRole | string | null | undefined) {
  if (isStrictAdminRole(role)) return "/admin";
  if (normalizeCmsRole(role) === "warehouse") return "/warehouse/dashboard";
  if (normalizeCmsRole(role) === "supplier") return "/supplier";
  if (normalizeCmsRole(role) === "user") return "/account";
  return "/login";
}

export function workspaceLabelForRole(role: CmsRole | string | null | undefined) {
  if (isStrictAdminRole(role)) return "Admin";
  if (normalizeCmsRole(role) === "warehouse") return "Warehouse";
  if (normalizeCmsRole(role) === "supplier") return "Supplier";
  return "Customer hub";
}

export function sectionFromPath(pathname: string): AdminSection {
  const normalized = normalizePath(pathname);
  if (normalized.startsWith("/warehouse")) return "warehouse";
  if (normalized.startsWith("/supplier")) return "products";
  if (normalized.startsWith("/operations/orders")) return "orders";
  if (normalized.startsWith("/operations/tasks")) return "tasks";
  if (normalized.startsWith("/operations")) return "operations";
  if (normalized.startsWith("/admin/suppliers")) return "suppliers";
  if (normalized.startsWith("/admin/enquiries")) return "enquiries";
  if (normalized.startsWith("/admin/contact-requests")) return "enquiries";
  if (normalized.startsWith("/admin/cms")) return "cms";
  if (normalized.startsWith("/admin/products")) return "products";
  if (normalized.startsWith("/admin/inventory")) return "warehouse";
  if (normalized.startsWith("/admin/archives")) return "audit";
  if (normalized.startsWith("/admin/audit")) return "audit";
  if (normalized.startsWith("/admin/orders")) return "orders";
  if (normalized.startsWith("/admin/settings") || normalized.startsWith("/admin/users") || normalized.startsWith("/admin/reports")) {
    return "overview";
  }
  return "overview";
}

export function isControlPanelRole(role: CmsRole | string | null | undefined) {
  const normalized = normalizeCmsRole(role);
  return normalized === "admin" || normalized === "warehouse" || normalized === "supplier";
}

export function isControlPanelPath(pathname: string) {
  const normalized = normalizePath(pathname);
  if (normalized.startsWith("/admin")) return true;
  if (normalized.startsWith("/warehouse")) return true;
  if (normalized.startsWith("/supplier")) return true;
  if (normalized.startsWith("/operations")) return true;
  if (normalized.startsWith("/account/security")) return true;
  return false;
}

/** Staff may finish identity setup here without being bounced back to the panel. */
const STAFF_PROFILE_COMPLETION_PATH = "/account/complete-profile";

/** Staff roles must not browse the customer storefront (home, catalog, cart, account, etc.). */
export function shouldConfineRoleToControlPanel(role: CmsRole | string | null | undefined, pathname: string) {
  if (!isControlPanelRole(role)) return false;

  const normalized = normalizePath(pathname);
  if (isAuthPublicPath(normalized)) return false;
  if (normalized.startsWith("/api")) return false;
  if (isControlPanelPath(normalized)) return false;
  // Incomplete staff profiles are sent here by the identity gate. Confining them
  // back to /admin|/warehouse|/supplier creates Admin ↔ Complete-Profile loops.
  if (matchesPrefix(normalized, STAFF_PROFILE_COMPLETION_PATH)) return false;
  // Admin CMS draft preview routes render storefront content for staff only.
  if (matchesPrefix(normalized, "/preview")) return false;

  return true;
}

export function canAccessProtectedPath(role: CmsRole | string | null | undefined, pathname: string) {
  const normalized = normalizePath(pathname);
  const canonicalRole = normalizeCmsRole(role);
  if (!canonicalRole) return false;
  if (normalized.startsWith("/admin")) return canonicalRole === "admin";
  if (normalized.startsWith("/warehouse")) return canonicalRole === "warehouse";
  if (normalized.startsWith("/supplier")) return canonicalRole === "supplier";
  if (normalized.startsWith("/operations")) return canonicalRole === "admin";
  if (normalized.startsWith("/account")) {
    return Boolean(canonicalRole);
  }
  return false;
}

export type RouteAuthorizationResult =
  | { allowed: true }
  | {
    allowed: false;
    httpStatus: 401 | 403;
    reason: string;
    eventType: string;
    redirectPath: string;
  };

export function authorizeRoute(
  role: CmsRole | string | null | undefined,
  pathname: string,
  options: { userId?: string | null } = {}
): RouteAuthorizationResult {
  const normalized = normalizePath(pathname);
  const requiresAuth = isAdminProtectedPath(normalized) && !isAuthPublicPath(normalized);

  if (requiresAuth && !options.userId) {
    return {
      allowed: false,
      httpStatus: 401,
      reason: "Protected route requires an authenticated Supabase session.",
      eventType: "security.auth_required",
      redirectPath: "/login"
    };
  }

  if (!requiresAuth) {
    return { allowed: true };
  }

  if (!canAccessProtectedPath(role, normalized)) {
    const section = sectionFromPath(normalized);
    const isAdminShell = normalized === "/admin" || normalized.startsWith("/admin/");
    return {
      allowed: false,
      httpStatus: 403,
      reason: `Role ${role ?? "anonymous"} cannot access ${section}.`,
      eventType: isAdminShell ? "security.admin_shell_denied" : "security.route_denied",
      redirectPath: defaultPathForRole(role)
    };
  }

  return { allowed: true };
}

export type ApiRoutePolicy =
  | { kind: "public" }
  | { kind: "bearer" }
  | { kind: "upload_token" }
  | { kind: "session" }
  | { kind: "session_or_guest" }
  | { kind: "admin" }
  | { kind: "staff" };

function matchesApiPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function resolveApiRoutePolicy(pathname: string): ApiRoutePolicy | null {
  const normalized = normalizePath(pathname);
  if (!normalized.startsWith("/api")) return null;

  if (
    normalized === "/api/health"
    || normalized === "/api/csp-report"
    || matchesApiPrefix(normalized, "/api/catalog/search")
    || matchesApiPrefix(normalized, "/api/cart/pricing")
    || matchesApiPrefix(normalized, "/api/orders/track")
    || matchesApiPrefix(normalized, "/api/payments/webhooks")
    || normalized === "/api/payments/providers"
    || normalized === "/api/client-verification"
    || matchesApiPrefix(normalized, "/api/auth/login")
    || normalized === "/api/auth/signup"
    || normalized === "/api/auth/forgot-password"
    || normalized === "/api/auth/resend-verification"
    || normalized === "/api/auth/change-email"
    || normalized === "/api/auth/send-otp"
    || normalized === "/api/auth/verify-otp"
    || normalized === "/api/auth/hooks/send-email"
    || normalized === "/api/auth/audit"
    || normalized === "/api/ai/assistant"
    || normalized === "/api/products/summary"
    || (matchesApiPrefix(normalized, "/api/products/") && normalized.includes("/reviews"))
  ) {
    return { kind: "public" };
  }

  // Cron / system admin routes: no user session; handler verifies CRON_SECRET (or equivalent).
  if (
    normalized === "/api/admin/prune-logs"
    || normalized === "/api/admin/prune-redis-ttls"
    || normalized === "/api/admin/archive-movements"
    || normalized === "/api/admin/archive-operational-data"
    || normalized === "/api/admin/publish-scheduled-blog"
    || normalized === "/api/payments/expire-pending"
    || normalized === "/api/notifications/dispatch"
  ) {
    return { kind: "bearer" };
  }

  // Session-backed admin UI APIs: require an admin role at the edge (handlers still enforce RBAC).
  if (matchesApiPrefix(normalized, "/api/admin")) {
    return { kind: "admin" };
  }

  if (normalized === "/api/upload") {
    return { kind: "upload_token" };
  }

  if (normalized === "/api/security/denials") {
    return { kind: "staff" };
  }

  if (
    matchesApiPrefix(normalized, "/api/checkout")
    || matchesApiPrefix(normalized, "/api/invoices")
    || normalized === "/api/contact-requests"
    || normalized === "/api/products/enquiry"
    || normalized === "/api/payments/verify"
  ) {
    return { kind: "session_or_guest" };
  }

  if (
    matchesApiPrefix(normalized, "/api/account")
    || normalized === "/api/notifications"
    || normalized === "/api/notifications/read"
  ) {
    return { kind: "session" };
  }

  if (normalized === "/api/dev/load-test") {
    return { kind: "public" };
  }

  return { kind: "session" };
}

export { normalizeCmsRole };
