export const ENTERPRISE_ROLES = [
  "admin",
  "warehouse",
  "supplier",
  "user"
] as const;

export type CmsRole = (typeof ENTERPRISE_ROLES)[number];

export const ENTERPRISE_PERMISSIONS = [
  "cms.write",
  "products.write",
  "products.permanent_delete",
  "products.submit",
  "inventory.update_own",
  "media.write",
  "warehouse.write",
  "warehouse.read",
  "orders.write",
  "orders.permanent_delete",
  "orders.checkout",
  "orders.lifecycle",
  "account.read.self",
  "settings.write",
  "audit.read",
  "notifications.write",
  "enquiries.read",
  "enquiries.write",
  "payments.write",
  "operations.write",
  "reports.read"
] as const;

export type EnterprisePermission = (typeof ENTERPRISE_PERMISSIONS)[number];

export class PermissionDeniedError extends Error {
  constructor(message = "The current user does not have permission to perform this action.") {
    super(message);
    this.name = "PermissionDeniedError";
  }
}

const rolePermissions: Record<CmsRole, EnterprisePermission[]> = {
  admin: [...ENTERPRISE_PERMISSIONS],
  warehouse: ["warehouse.write", "warehouse.read", "orders.write", "orders.lifecycle", "notifications.write"],
  supplier: ["products.submit", "inventory.update_own", "media.write", "notifications.write"],
  user: ["orders.checkout", "payments.write", "account.read.self"]
};

const legacyRoleAliases: Record<string, CmsRole> = {
  super_admin: "admin",
  editor: "supplier",
  warehouse_manager: "warehouse",
  warehouse_staff: "warehouse",
  operations_manager: "user",
  staff: "user",
  reviewer: "user",
  support: "user"
};

export function isCmsRole(value: unknown): value is CmsRole {
  return typeof value === "string" && (ENTERPRISE_ROLES as readonly string[]).includes(value);
}

export function normalizeCmsRole(value: unknown): CmsRole | null {
  if (isCmsRole(value)) return value;
  if (typeof value !== "string") return null;
  return legacyRoleAliases[value] ?? null;
}

export function roleHasPermission(role: CmsRole | string | null | undefined, permission: EnterprisePermission) {
  const normalized = normalizeCmsRole(role);
  if (!normalized) return false;
  return rolePermissions[normalized]?.includes(permission) ?? false;
}

export function roleHasAnyPermission(
  role: CmsRole | string | null | undefined,
  permissions: readonly EnterprisePermission[]
) {
  return permissions.some((permission) => roleHasPermission(role, permission));
}

export function assertAnyRolePermission(
  role: CmsRole | string | null | undefined,
  permissions: readonly EnterprisePermission[]
) {
  if (!roleHasAnyPermission(role, permissions)) {
    throw new PermissionDeniedError(
      `Role ${role ?? "anonymous"} cannot perform any of: ${permissions.join(", ")}.`
    );
  }
}

export function assertRolePermission(role: CmsRole | string | null | undefined, permission: EnterprisePermission) {
  if (!roleHasPermission(role, permission)) {
    throw new PermissionDeniedError(`Role ${role ?? "anonymous"} cannot perform ${permission}.`);
  }
}

export function getRolePermissions(role: CmsRole | string) {
  const normalized = normalizeCmsRole(role);
  return normalized ? [...rolePermissions[normalized]] : [];
}
