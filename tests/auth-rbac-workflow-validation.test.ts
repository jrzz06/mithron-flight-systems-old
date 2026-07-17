import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canAccessAdminSection } from "@/lib/auth/access-control";
import { roleHasPermission } from "@/lib/auth/permissions";

const root = process.cwd();

function readProjectFile(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("enterprise auth and RBAC workflow validation contract", () => {
  it("aligns the admin role with the requested admin plus warehouse access contract", () => {
    expect(canAccessAdminSection("admin", "cms")).toBe(true);
    expect(canAccessAdminSection("admin", "products")).toBe(true);
    expect(canAccessAdminSection("admin", "warehouse")).toBe(true);
    expect(canAccessAdminSection("admin", "enquiries")).toBe(true);
    expect(roleHasPermission("admin", "warehouse.write")).toBe(true);
    expect(roleHasPermission("admin", "settings.write")).toBe(true);
  });

  it("keeps warehouse and user roles isolated from unrelated admin systems", () => {
    expect(canAccessAdminSection("warehouse", "warehouse")).toBe(true);
    expect(canAccessAdminSection("warehouse", "orders")).toBe(true);
    expect(canAccessAdminSection("warehouse", "cms")).toBe(false);
    expect(canAccessAdminSection("user", "warehouse")).toBe(false);
    expect(canAccessAdminSection("user", "operations")).toBe(false);
    expect(roleHasPermission("warehouse", "cms.write")).toBe(false);
    expect(roleHasPermission("user", "warehouse.write")).toBe(false);
  });

  it("adds a DB-backed current role read path without exposing user_roles broadly", () => {
    const migrationPath = "supabase/migrations/20260524001100_auth_rbac_workflow_validation.sql";
    const isolationMigrationPath = "supabase/migrations/20260524001200_auth_rbac_warehouse_isolation.sql";
    const userRoleRepairMigrationPath = "supabase/migrations/20260526000100_restore_user_role_for_three_role_rbac.sql";
    const warehouseRoleRepairMigrationPath = "supabase/migrations/20260526000200_restore_warehouse_role_for_three_role_rbac.sql";
    expect(existsSync(join(root, migrationPath))).toBe(true);
    expect(existsSync(join(root, isolationMigrationPath))).toBe(true);
    expect(existsSync(join(root, userRoleRepairMigrationPath))).toBe(true);
    expect(existsSync(join(root, warehouseRoleRepairMigrationPath))).toBe(true);

    const migration = readProjectFile(migrationPath);
    const isolationMigration = readProjectFile(isolationMigrationPath);
    const userRoleRepairMigration = readProjectFile(userRoleRepairMigrationPath);
    const warehouseRoleRepairMigration = readProjectFile(warehouseRoleRepairMigrationPath);
    const authSource = readProjectFile("services/auth.ts");

    expect(migration).toContain("create or replace function public.current_enterprise_role()");
    expect(migration).toContain("security definer");
    expect(migration).toContain("grant execute on function public.current_enterprise_role() to authenticated");
    expect(migration).not.toContain("for select to authenticated using (true)");
    expect(isolationMigration).toContain("delete from public.role_inheritance");
    expect(isolationMigration).toContain("role_key = 'warehouse_manager'");
    expect(isolationMigration).toContain("inherited_role_key = 'staff'");
    expect(userRoleRepairMigration).toContain("('user', 'User', 'Storefront-only customer access.', 3)");
    expect(warehouseRoleRepairMigration).toContain("('warehouse', 'Warehouse', 'Inventory, shipment, stock, and order-fulfillment access.', 2)");
    expect(warehouseRoleRepairMigration).toContain("('warehouse', 'warehouse.write')");
    expect(authSource).toContain("current_enterprise_role");
    expect(authSource).toContain("claimsRole");
  });

  it("provides a focused real-user workflow verifier for auth, route protection, RLS, and auditability", () => {
    const scriptPath = "tools/verify-auth-rbac-workflows.mjs";
    expect(existsSync(join(root, scriptPath))).toBe(true);

    const script = readProjectFile(scriptPath);
    for (const token of [
      "AUTH_VALIDATION_ADMIN_EMAIL",
      "AUTH_VALIDATION_WAREHOUSE_EMAIL",
      "AUTH_VALIDATION_USER_EMAIL",
      "signInWithPassword",
      "current_enterprise_role",
      "/admin",
      "/warehouse/fulfillment",
      "/operations",
      "activity_logs",
      "audit_logs",
      "authInsertMinimal",
      "return=minimal",
      "directApiDenied",
      "user",
      "user cross-role read"
    ]) {
      expect(script).toContain(token);
    }
    expect(script).not.toContain("AUTH_VALIDATION_OPERATIONS_EMAIL");
    expect(script).not.toContain("operationsIsolation");
  });

  it("keeps the RBAC edge audit aligned with current warehouse UI selectors and canonical role inventory", () => {
    const scriptPath = "tools/audit-rbac-edge-probes.mjs";
    expect(existsSync(join(root, scriptPath))).toBe(true);

    const script = readProjectFile(scriptPath);
    expect(script).toContain("[data-inventory-system]");
    expect(script).toContain("[data-inventory-table]");
    expect(script).toContain("[data-inventory-action-menu] > button");
    expect(script).toContain("[data-inventory-quick-edit]:visible");
    expect(script).toContain("[data-inventory-quick-edit-form]");
    expect(script).toContain("[data-inventory-inline-stock] form");
    expect(script).toContain('{ key: "warehouse", role: "warehouse"');
    expect(script).toContain('{ key: "user", role: "user"');
    expect(script).toContain("byKey.user");
    expect(script).toContain("edgeUser");
    expect(script).toContain("/admin/products?tool=create#create-product");
    expect(script).toContain("/operations/orders");
    expect(script).toContain("[data-order-detail-panel]");
    expect(script).not.toContain("data-warehouse-movement-form");
    expect(script).not.toContain("Save stock adjustment");
    expect(script).not.toContain("warehouse_manager");
    expect(script).not.toContain("operations_manager");
    expect(script).not.toContain('{ key: "operations"');
    expect(script).not.toContain("byKey.operations");
    expect(script).toContain("role_key=in.(admin,warehouse,supplier,user)");
    expect(script).not.toContain("role_key=in.(admin,warehouse_manager,operations_manager)");
  });

  it("keeps the business workflow verifier aligned with canonical roles and current inventory UI", () => {
    const scriptPath = "tools/validate-business-workflows.mjs";
    expect(existsSync(join(root, scriptPath))).toBe(true);

    const script = readProjectFile(scriptPath);
    expect(script).toContain('{ key: "warehouse", role: "warehouse"');
    expect(script).toContain('{ key: "user", role: "user"');
    expect(script).toContain("byKey.user");
    expect(script).toContain("validateOrderOperationsWorkflow(byKey.admin)");
    expect(script).toContain("function acceptNextDialog(page");
    expect(script).toContain("acceptNextDialog(page, \"managed user disable confirmation\");");
    expect(script).toContain("submitAndWaitForAction(page, () => createForm.locator('button[type=\"submit\"]').click(), \"managed user creation\")");
    expect(script).toContain("submitAndWaitForAction(page, () => inviteForm.locator('button[type=\"submit\"]').click(), \"managed user invite\")");
    expect(script).toContain("submitAndWaitForAction(page, () => duplicateInviteForm.locator('button[type=\"submit\"]').click(), \"duplicate user invite\")");
    expect(script).toContain("submitAndWaitForAction(page, () => targetDialog.locator('[data-user-role-form] button[type=\"submit\"]').click(), \"managed user role assignment\")");
    expect(script).toContain("submitAndWaitForAction(page, () => reactivateDialog.locator('[data-user-reactivate-form] button[type=\"submit\"]').click(), \"managed user reactivation\")");
    expect(script).toContain("submitAndWaitForAction(page, () => stockForm.locator(\"button\").filter({ hasText: \"Save\" }).click(), \"inventory inline stock update\")");
    expect(script).toContain("submitAndWaitForAction(page, () => createForm.locator('button[type=\"submit\"]').click(), \"operations order creation\")");
    expect(script).toContain("submitAndWaitForAction(page, () => lifecycleForm.locator('button[type=\"submit\"]').click(), `order lifecycle ${status}`)");
    expect(script).toContain("submitAndWaitForAction(page, () => notificationForm.locator('button[type=\"submit\"]').click(), \"manual order notification\")");
    expect(script).toContain("submitAndWaitForAction(page, () => duplicateForm.locator('button[type=\"submit\"]').click(), \"duplicate order notification\")");
    expect(script).toContain("[data-inventory-system]");
    expect(script).toContain("[data-inventory-row]");
    expect(script).toContain("/admin/users");
    expect(script).toContain("[data-user-access-table]");
    expect(script).toContain("role_key=eq.user");
    expect(script).not.toContain("warehouse_manager");
    expect(script).not.toContain("operations_manager");
    expect(script).not.toContain("byKey.operations");
    expect(script).not.toContain("data-warehouse-movement-form");
    expect(script).not.toContain('[data-user-governance-table="users"]');
    expect(script).not.toContain("data-user-revoke-form");
  });

  it("keeps the audit traceability verifier aligned with canonical roles and current operator routes", () => {
    const scriptPath = "tools/validate-audit-traceability.mjs";
    expect(existsSync(join(root, scriptPath))).toBe(true);

    const script = readProjectFile(scriptPath);
    expect(script).toContain('{ key: "warehouse", role: "warehouse"');
    expect(script).toContain('{ key: "user", role: "user"');
    expect(script).toContain("prepared.user");
    expect(script).toContain("validateOrderTrace(prepared.admin)");
    expect(script).toContain("/admin/products?tool=create#create-product");
    expect(script).toContain("establishBrowserSession");
    expect(script).toContain("/api/auth/login");
    expect(script).toContain("seedInventoryTraceProbe");
    expect(script).toContain("resolveInventoryProbeRow");
    expect(script).toContain("findInventoryRowForSku");
    expect(script).toContain("assertInventoryActionSucceeded");
    expect(script).toContain("[data-inventory-inline-stock] form");
    expect(script).toContain("acceptNextDialog(page);");
    expect(script).toContain("/admin/users");
    expect(script).toContain("[data-user-access-table]");
    expect(script).toContain("role_key=eq.user");
    expect(script).not.toContain("warehouse_manager");
    expect(script).not.toContain("operations_manager");
    expect(script).not.toContain('{ key: "operations"');
    expect(script).not.toContain("prepared.operations");
    expect(script).not.toContain("data-warehouse-movement-form");
    expect(script).not.toContain("Save stock adjustment");
    expect(script).not.toContain('[data-user-governance-table="users"]');
    expect(script).not.toContain("data-user-revoke-form");
  });
});
