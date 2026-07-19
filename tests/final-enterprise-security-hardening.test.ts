import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canAccessAdminSection, sectionFromPath } from "@/lib/auth/access-control";

const root = process.cwd();

function readWorkspaceFile(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("final enterprise security hardening", () => {
  it("strictly isolates the admin shell from warehouse and operations roles", () => {
    const accessControl = readWorkspaceFile("lib/auth/access-control.ts");
    const proxy = readWorkspaceFile("proxy.ts");
    const adminLayout = readWorkspaceFile("app/admin/layout.tsx");

    expect(canAccessAdminSection("admin", "overview")).toBe(true);
    expect(canAccessAdminSection("warehouse_manager", "overview")).toBe(false);
    expect(canAccessAdminSection("operations_manager", "overview")).toBe(false);
    expect(sectionFromPath("/operations/orders")).toBe("orders");

    expect(accessControl).toContain("isStrictAdminRole");
    expect(accessControl).toContain("defaultPathForRole");
    expect(accessControl).toContain("canAccessProtectedPath");
    expect(proxy).toContain("security.admin_shell_denied");
    expect(proxy).toContain("security.invalid_jwt");
    expect(proxy).toContain("defaultPathForRole");
    expect(adminLayout).toContain("getCurrentAuthContext");
    expect(adminLayout).toContain("canAccessProtectedPath");
    expect(adminLayout).toContain('canAccessProtectedPath(context.role, "/admin")');
    expect(readWorkspaceFile("services/auth.ts")).toContain("security.admin_shell_denied");
    expect(readWorkspaceFile("services/auth.ts")).toContain("readSessionHandoff");
    expect(readWorkspaceFile("app/admin/@shell/default.tsx")).toContain("readSessionHandoff");
  });

  it("adds app-level direct REST/RLS denial telemetry without weakening Supabase RLS", () => {
    const routePath = join(root, "app/api/security/denials/route.ts");
    expect(existsSync(routePath)).toBe(true);

    const route = readFileSync(routePath, "utf8");
    const observability = readWorkspaceFile("services/security-observability.ts");
    const securityVerifier = readWorkspaceFile("tools/validate-security-boundaries.mjs");

    expect(route).toContain("recordObservedRestDenial");
    expect(route).toContain("security.invalid_jwt");
    expect(route).toContain("security.rest_denied");
    expect(observability).toContain("recordObservedRestDenial");
    expect(observability).toContain("retryWithoutActorForeignKeys");
    expect(observability).toContain("original_actor_user_id");
    expect(securityVerifier).toContain("/api/security/denials");
    expect(securityVerifier).toContain("directRlsDeniedAttemptAppLogs");
    expect(securityVerifier).toContain("VERIFIED_TELEMETRY_FORBIDDEN");
    expect(securityVerifier).toContain("expectedUploadDeniedStatuses");
    expect(securityVerifier).toContain("MITHRON_UPLOAD_API_RETIRED");
  });

  it("keeps the security boundary verifier on canonical roles and current warehouse selectors", () => {
    const securityVerifier = readWorkspaceFile("tools/validate-security-boundaries.mjs");

    expect(securityVerifier).toContain('{ key: "warehouse", role: "warehouse"');
    expect(securityVerifier).toContain('{ key: "user", role: "user"');
    expect(securityVerifier).toContain("byKey.user");
    expect(securityVerifier).toContain("[data-inventory-system]");
    expect(securityVerifier).toContain("role_key=eq.user");
    expect(securityVerifier).toContain("userInventoryWrite");
    expect(securityVerifier).not.toContain("warehouse_manager");
    expect(securityVerifier).not.toContain("operations_manager");
    expect(securityVerifier).not.toContain("byKey.operations");
    expect(securityVerifier).not.toContain("data-warehouse-movement-form");
  });

  it("hardens session revocation and invite recovery state through additive governance schema", () => {
    const migrationPath = join(root, "supabase/migrations/20260524001700_final_security_hardening.sql");
    expect(existsSync(migrationPath)).toBe(true);

    const migration = readFileSync(migrationPath, "utf8");
    const settingsActions = readWorkspaceFile("app/admin/settings/actions.ts");

    expect(migration).toContain("add column if not exists governance_status");
    expect(migration).toContain("add column if not exists session_revoked_at");
    expect(migration).toContain("current_enterprise_role()");
    expect(migration).toContain("p.governance_status is distinct from 'disabled'");
    expect(settingsActions).toContain("invalidateManagedInviteAction");
    expect(settingsActions).toContain("session_revoked_at");
    expect(settingsActions).toContain("users.invite_invalidate");
  });

  it("exposes realtime security diagnostics and security monitoring feeds to admin only", () => {
    const realtime = readWorkspaceFile("services/enterprise-realtime.ts");
    const adminService = readWorkspaceFile("services/admin.ts");
    const auditFeeds = readWorkspaceFile("components/admin/admin-audit-live-feeds.tsx");
    const storefrontPage = readWorkspaceFile("app/(storefront)/page.tsx");

    expect(realtime).toContain('"security_events"');
    expect(realtime).toContain("subscriptionErrors");
    expect(realtime).toContain("securityAnomalies");
    expect(adminService).toContain("restDenials");
    expect(adminService).toContain("realtimeAnomalies");
    expect(auditFeeds).toContain("Privilege escalation attempts");
    expect(auditFeeds).toContain("Realtime anomalies");
    expect(storefrontPage).not.toContain("security_events");
    expect(storefrontPage).not.toContain("useEnterpriseRealtime");
  });
});
