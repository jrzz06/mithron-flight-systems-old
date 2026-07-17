import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("operations operational UX maturity", () => {
  it("turns the operations dashboard into a workspace with operational visibility", () => {
    const operationsPage = source("app/operations/page.tsx");
    const adminService = source("services/admin.ts");
    const operationsLayout = source("app/operations/layout.tsx");

    expect(operationsLayout).toContain("AdminShell");
    expect(operationsPage).toContain("data-operations-command-center");
    expect(operationsPage).not.toContain("EnterpriseRealtimePanel");
    expect(adminService).toContain("shipments: [] as AdminRow[]");
    expect(adminService).toContain("orders: [] as AdminRow[]");
  });

  it("makes staff tasks actionable with task status, priority, assignment, and reopen controls", () => {
    const tasksPage = source("app/operations/tasks/page.tsx");
    const forms = source("services/enterprise-admin-forms.ts");
    const actions = source("app/operations/actions.ts");

    expect(tasksPage).toContain("AdminFormSection");
    expect(tasksPage).toContain("AdminStickyActionFooter");
    expect(tasksPage).toContain("data-task-dashboard");
    expect(tasksPage).toContain("data-pending-tasks");
    expect(tasksPage).toContain("data-in-progress-tasks");
    expect(tasksPage).toContain("data-completed-tasks");
    expect(tasksPage).toContain("data-overdue-tasks");
    expect(tasksPage).toContain("data-task-priority-indicators");
    expect(tasksPage).toContain("data-task-action-controls");
    expect(tasksPage).toContain("data-task-metadata-grid");
    expect(tasksPage).toContain("data-task-reopen-option");
    expect(forms).toContain("STAFF_TASK_STATUSES");
    expect(actions).toContain("assertStaffTaskStatus");
  });

  it("makes deployment approvals visible with requested enterprise lifecycle states", () => {
    const deploymentsPage = source("app/operations/deployments/page.tsx");
    const forms = source("services/enterprise-admin-forms.ts");
    const actions = source("app/operations/actions.ts");

    expect(deploymentsPage).toContain("data-deployment-command-workflow");
    expect(deploymentsPage).toContain("data-deployment-approval-actions");
    expect(deploymentsPage).toContain("data-deployment-audit-visibility");
    expect(deploymentsPage).toContain("data-deployment-status-pending");
    expect(deploymentsPage).toContain("data-deployment-status-approved");
    expect(deploymentsPage).toContain("data-deployment-status-rejected");
    expect(deploymentsPage).toContain("data-deployment-status-deployed");
    expect(deploymentsPage).toContain("data-deployment-status-rolled-back");
    expect(deploymentsPage).toContain("approver");
    expect(forms).toContain("DEPLOYMENT_REQUEST_STATUSES");
    expect(actions).toContain("assertDeploymentRequestTransition");
  });

  it("couples operations events to notifications without duplicate event spam", () => {
    const operationsPage = source("app/operations/page.tsx");
    const actions = source("app/operations/actions.ts");

    expect(operationsPage).toContain("data-operations-notification-actions");
    expect(actions).toContain("createOperationsEventNotification");
    expect(actions).toContain("operations.notification_duplicate");
  });
});
