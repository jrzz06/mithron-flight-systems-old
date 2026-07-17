import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function readWorkspaceFile(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("iteration 1 production hardening contracts", () => {
  it("uses the Next proxy convention while preserving protected route guards", () => {
    expect(existsSync(join(root, "proxy.ts"))).toBe(true);
    expect(existsSync(join(root, "middleware.ts"))).toBe(false);

    const proxy = readWorkspaceFile("proxy.ts");
    expect(proxy).toContain("export async function proxy");
    expect(proxy).toContain("maybeRedirectObsoleteDeploymentHost");
    expect(proxy).toContain("current_enterprise_role");
    expect(proxy).toContain("recordSecurityEventFromMiddleware");
    expect(proxy).toContain("authorizeRoute(role, pathname");
    expect(proxy).toContain("resolveApiRoutePolicy");
    expect(proxy).toContain("authorization.eventType");
    expect(proxy).toContain("favicon.ico");
    expect(proxy).toContain("robots.txt");
    expect(proxy).toContain("sitemap.xml");
    expect(proxy).toContain("woff2");
    expect(proxy).toContain("api/health");

    expect(proxy).toContain('pathname === "/auth/callback"');
    expect(proxy).toContain("code_verifier");
  });

  it("exposes stable QA anchors for operational route families", () => {
    const auditPage = readWorkspaceFile("app/admin/audit/page.tsx");
    const cmsPage = readWorkspaceFile("app/admin/cms/page.tsx");
    const warehousePage = readWorkspaceFile("app/warehouse/page.tsx");
    const warehouseDashboardPage = readWorkspaceFile("app/warehouse/dashboard/page.tsx");
    const warehouseFulfillmentPage = readWorkspaceFile("app/warehouse/fulfillment/page.tsx");
    const warehouseActivityPage = readWorkspaceFile("app/warehouse/activity/page.tsx");
    const operationsPage = readWorkspaceFile("app/operations/page.tsx");
    const operationsDeploymentsPage = readWorkspaceFile("app/operations/deployments/page.tsx");
    const operationsTasksPage = readWorkspaceFile("app/operations/tasks/page.tsx");
    const cmsWorkspace = readWorkspaceFile("features/admin/cms/cms-visual-workspace.tsx");

    expect(auditPage).toContain("data-admin-audit-route");
    expect(auditPage).toContain("data-security-events-feed");
    expect(cmsPage).toContain("data-admin-cms-route");
    expect(cmsWorkspace).toContain("data-cms-visual-editor");
    expect(cmsPage).toContain("hero-banner");
    expect(cmsPage).not.toContain("data-cms-workflow-grid");
    expect(warehousePage).toContain('redirect("/warehouse/dashboard")');
    expect(warehouseDashboardPage).toContain("data-warehouse-operational-dashboard");
    expect(warehouseFulfillmentPage).toContain("data-warehouse-fulfillment-route");
    expect(warehouseActivityPage).toContain("data-warehouse-activity-timeline");
    expect(operationsPage).toContain("data-operations-route");
    expect(operationsPage).toContain("data-operations-command-center");
    expect(operationsDeploymentsPage).toContain("data-operations-deployments-route");
    expect(operationsTasksPage).toContain("data-operations-tasks-route");
  });

  it("threads correlation identifiers through security denial telemetry", () => {
    const observability = readWorkspaceFile("services/security-observability.ts");
    const denialRoute = readWorkspaceFile("app/api/security/denials/route.ts");
    const proxy = readWorkspaceFile("proxy.ts");

    expect(observability).toContain("createSecurityCorrelationId");
    expect(observability).toContain("extractSecurityCorrelationId");
    expect(observability).toContain("correlation_id");
    expect(denialRoute).toContain("x-correlation-id");
    expect(denialRoute).toContain("correlationId");
    expect(proxy).toContain("x-correlation-id");
  });
});

