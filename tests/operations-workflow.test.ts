import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildDeploymentRequestLifecycleUpdateFromFormData,
  buildDeploymentRequestWorkflowFromFormData,
  buildNotificationWorkflowFromFormData,
  buildStaffTaskWorkflowFromFormData
} from "@/services/enterprise-admin-forms";

function formData(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

describe("enterprise operations workflow", () => {
  it("normalizes deployment requests, task assignments, and notifications for remote persistence", () => {
    expect(buildDeploymentRequestWorkflowFromFormData(formData({
      requester_email: "ops@example.com",
      region: "IN-WEST",
      mission_profile: "agriculture",
      notes: "Field deployment",
      priority: "critical",
      payload: "{\"approval_required\":true}",
      order_id: "11111111-1111-1111-1111-111111111111",
      assigned_to: "00000000-0000-0000-0000-000000000001"
    }))).toMatchObject({
      requesterEmail: "ops@example.com",
      region: "IN-WEST",
      missionProfile: "agriculture",
      priority: "critical",
      orderId: "11111111-1111-1111-1111-111111111111",
      assignedTo: "00000000-0000-0000-0000-000000000001",
      payload: { approval_required: true }
    });

    expect(buildStaffTaskWorkflowFromFormData(formData({
      title: "Approve field kit",
      body: "Confirm stock, pilot, and service window.",
      priority: "high",
      assigned_to: "00000000-0000-0000-0000-000000000001",
      related_request_id: "22222222-2222-2222-2222-222222222222",
      due_at: "2026-05-25T10:00:00.000Z",
      status: "open"
    }))).toMatchObject({
      title: "Approve field kit",
      priority: "high",
      assignedTo: "00000000-0000-0000-0000-000000000001",
      relatedRequestId: "22222222-2222-2222-2222-222222222222",
      status: "open"
    });

    expect(buildNotificationWorkflowFromFormData(formData({
      title: "Deployment escalated",
      body: "Critical field deployment needs approval.",
      priority: "critical",
      channel: "operations",
      entity_table: "deployment_requests",
      entity_id: "22222222-2222-2222-2222-222222222222",
      payload: "{\"reason\":\"approval\"}"
    }))).toMatchObject({
      title: "Deployment escalated",
      priority: "critical",
      channel: "operations",
      entityTable: "deployment_requests",
      entityId: "22222222-2222-2222-2222-222222222222",
      payload: { reason: "approval" }
    });
  });

  it("normalizes deployment request approval and escalation transitions", () => {
    expect(buildDeploymentRequestLifecycleUpdateFromFormData(formData({
      request_id: "22222222-2222-2222-2222-222222222222",
      status: "escalated",
      assigned_to: "00000000-0000-0000-0000-000000000001",
      payload: "{\"approval_state\":\"needs_director\",\"escalation_reason\":\"weather window\"}",
      note: "Escalated for director approval",
      change_summary: "Escalate deployment request"
    }))).toEqual({
      requestId: "22222222-2222-2222-2222-222222222222",
      status: "escalated",
      assignedTo: "00000000-0000-0000-0000-000000000001",
      payload: {
        approval_state: "needs_director",
        escalation_reason: "weather window"
      },
      note: "Escalated for director approval",
      changeSummary: "Escalate deployment request"
    });
  });

  it("wires operations pages to deployment, task, notification, approval, and activity workflows", () => {
    const operationsPage = readFileSync(join(process.cwd(), "app/operations/page.tsx"), "utf8");
    const deploymentsPage = readFileSync(join(process.cwd(), "app/operations/deployments/page.tsx"), "utf8");
    const notificationsPage = readFileSync(join(process.cwd(), "app/operations/notifications/page.tsx"), "utf8");
    const tasksPage = readFileSync(join(process.cwd(), "app/operations/tasks/page.tsx"), "utf8");
    const actions = readFileSync(join(process.cwd(), "app/operations/actions.ts"), "utf8");

    expect(actions).toContain("updateDeploymentRequestStatusFormAction");
    expect(actions).toContain("findExistingNotification");
    expect(actions).toContain("operations.notification_duplicate");
    expect(deploymentsPage).toContain("createDeploymentRequestFormAction");
    expect(deploymentsPage).toContain("updateDeploymentRequestStatusFormAction");
    expect(tasksPage).toContain("createStaffTaskFormAction");
    expect(tasksPage).toContain("updateStaffTaskStatusFormAction");
    expect(notificationsPage).toContain("createOperationsNotificationFormAction");
    expect(deploymentsPage).toContain("data-deployment-requests-table=\"deployment_requests\"");
    expect(tasksPage).toContain("data-staff-tasks-table=\"staff_tasks\"");
    expect(notificationsPage).toContain("data-notifications-table=\"notifications\"");
    expect(operationsPage).toContain("Activity");
  });
});
