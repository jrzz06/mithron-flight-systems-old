import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getRequiredPermissionForAdminTable } from "@/services/admin-actions";

const root = process.cwd();

function readWorkspaceFile(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("enterprise auditability and security observability hardening", () => {
  it("adds an additive security_events table with RLS, indexes, realtime readiness, and audit permissions", () => {
    const migrationPath = join(root, "supabase/migrations/20260524001600_auditability_security_observability.sql");

    expect(existsSync(migrationPath)).toBe(true);
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("create table if not exists public.security_events");
    expect(migration).toContain("attempted_resource text not null");
    expect(migration).toContain("denial_reason text");
    expect(migration).toContain("actor_role text");
    expect(migration).toContain("severity text not null");
    expect(migration).toContain("alter table public.security_events enable row level security");
    expect(migration).toContain("security_events audit read");
    expect(migration).toContain("security_events service role manage");
    expect(migration).toContain("security_events_resource_idx");
    expect(migration).toContain("alter publication supabase_realtime add table public.security_events");
    expect(getRequiredPermissionForAdminTable("security_events")).toBe("audit.read");
  });

  it("captures before-state snapshots for generic admin mutations including products", () => {
    const adminActions = readWorkspaceFile("services/admin-actions.ts");

    expect(adminActions).toContain("beforeData");
    expect(adminActions).toContain("fetchExistingAdminRecord");
    expect(adminActions).toContain("diffBeforeAfter");
    expect(adminActions).toContain("before_data");
    expect(adminActions).toContain("after_data");
    expect(adminActions).toContain("changed_fields");
  });

  it("retries content revision inserts when concurrent or retried server actions collide on revision numbers", () => {
    const adminActions = readWorkspaceFile("services/admin-actions.ts");

    expect(adminActions).toContain("recordEntityRevisionSnapshot");
    expect(adminActions).toContain("maxRevisionAttempts");
    expect(adminActions).toContain("isContentRevisionConflict");
    expect(adminActions).toContain("Failed to create content revision after");
  });

  it("records inventory movement rows before applying unified inventory writes", () => {
    const warehouseActions = readWorkspaceFile("app/warehouse/actions.ts");
    const warehouseMovements = readWorkspaceFile("services/warehouse-movements.ts");

    expect(warehouseActions).toContain("saveProductInventory");
    expect(warehouseActions).toContain("upsertProductInventoryRecord");

    const stockWorkflowMovement = warehouseMovements.indexOf("const movement = await recordInventoryMovementForStockChange");
    const stockWorkflowInventoryUpsert = warehouseMovements.indexOf("await upsertProductInventoryRecord");

    expect(stockWorkflowMovement).toBeGreaterThan(-1);
    expect(stockWorkflowInventoryUpsert).toBeGreaterThan(-1);
    expect(stockWorkflowMovement).toBeLessThan(stockWorkflowInventoryUpsert);
  });

  it("records product activity, revisions, and audit snapshots for all product workflows", () => {
    const productActions = readWorkspaceFile("app/admin/products/actions.ts");

    for (const action of [
      "products.draft",
      "products.media_link",
      "products.variants",
      "products.seo",
      "products.publish",
      "products.inventory_link"
    ]) {
      expect(productActions).toContain(action);
    }

    expect(productActions).toContain("recordProductAuditTrail");
    expect(productActions).toContain("recordEntityRevisionSnapshot");
    expect(productActions).toContain("createActivityLogRecord");
    expect(productActions).toContain("actor_role");
  });

  it("logs auth and route-denial security events without moving enforcement out of RBAC/RLS", () => {
    const authAuditRoute = readWorkspaceFile("app/api/auth/audit/route.ts");
    const loginForm = readWorkspaceFile("app/login/login-form.tsx");
    const forgotForm = readWorkspaceFile("app/forgot-password/forgot-password-form.tsx");
    const resetForm = readWorkspaceFile("app/reset-password/reset-password-form.tsx");
    const logoutRoute = readWorkspaceFile("app/auth/logout/route.ts");
    const proxy = readWorkspaceFile("proxy.ts");

    expect(authAuditRoute).toContain("recordAuthActivityEvent");
    expect(authAuditRoute).toContain("auth.failed_login");
    expect(loginForm).toContain("auth.failed_login");
    expect(loginForm).not.toContain('recordClientAuthEvent("auth.login"');
    expect(forgotForm).toContain("auth.password_reset");
    expect(resetForm).toContain("auth.password_reset");
    expect(loginForm).toContain("auth.invite_accept");
    expect(logoutRoute).toContain("auth.logout");
    expect(proxy).toContain("recordSecurityEventFromMiddleware");
    expect(proxy).toContain("security.route_denied");
    expect(proxy).toContain("security.auth_required");
  });

  it("creates invite notifications and exposes forensic feeds in the admin audit surface", () => {
    const settingsActions = readWorkspaceFile("app/admin/settings/actions.ts");
    const adminService = readWorkspaceFile("services/admin.ts");
    const auditPage = readWorkspaceFile("app/admin/audit/page.tsx");

    expect(settingsActions).toContain("createInviteNotificationIfMissing");
    expect(settingsActions).toContain("users.invite_notification");
    expect(settingsActions).toContain("entity_table: \"admin_invites\"");
    expect(adminService).toContain("getAuditObservabilitySnapshot");
    expect(adminService).toContain("security_events");
    expect(adminService).toContain("authEvents");
    expect(adminService).toContain("productActivity");
    expect(auditPage).toContain("Security events");
    expect(auditPage).toContain("Auth events");
    expect(auditPage).toContain("Product activity");
    expect(auditPage).toContain("Governance timeline");
  });
});
