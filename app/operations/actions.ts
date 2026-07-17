"use server";

import { revalidatePath } from "next/cache";
import { assertSupabaseAdminConfig } from "@/lib/env";
import {
  createActivityLogRecord,
  createDeploymentRequestRecord,
  createNotificationRecord,
  createStaffTaskRecord,
  recordEntityRevisionSnapshot,
  updateDeploymentRequestRecord,
  updateStaffTaskRecord
} from "@/services/admin-actions";
import {
  buildDeploymentRequestPayload,
  buildStaffTaskPayload
} from "@/services/operations-actions";
import {
  DEPLOYMENT_REQUEST_STATUSES,
  STAFF_TASK_STATUSES,
  buildDeploymentRequestLifecycleUpdateFromFormData,
  buildDeploymentRequestWorkflowFromFormData,
  buildNotificationWorkflowFromFormData,
  buildStaffTaskWorkflowFromFormData,
  type DeploymentRequestStatus,
  type StaffTaskStatus
} from "@/services/enterprise-admin-forms";
import { requireAdminPermission } from "@/services/auth";

type JsonRecord = Record<string, unknown>;

const operationsReadColumns = {
  notificationDedupe: "select=id,recipient_id,status,payload,created_at",
  deploymentRequest: "select=id,status,assigned_to,payload,updated_at",
  staffTask: "select=id,title,status,priority,assigned_to,related_request_id,updated_at"
};

const deploymentRequestTransitions: Record<DeploymentRequestStatus, DeploymentRequestStatus[]> = {
  pending: ["triaged", "approved", "rejected", "blocked", "escalated", "cancelled"],
  triaged: ["approved", "rejected", "scheduled", "blocked", "escalated", "cancelled"],
  approved: ["scheduled", "deployed", "rejected", "blocked", "cancelled"],
  rejected: ["pending", "cancelled"],
  scheduled: ["deployed", "completed", "blocked", "cancelled"],
  deployed: ["completed", "rolled_back"],
  rolled_back: ["pending", "cancelled"],
  blocked: ["pending", "triaged", "escalated", "cancelled"],
  escalated: ["approved", "rejected", "blocked", "cancelled"],
  completed: ["rolled_back"],
  cancelled: []
};

function assertStaffTaskStatus(status: string): StaffTaskStatus {
  if (!(STAFF_TASK_STATUSES as readonly string[]).includes(status)) {
    throw new Error(`Task status must be one of: ${STAFF_TASK_STATUSES.join(", ")}.`);
  }
  return status as StaffTaskStatus;
}

function assertDeploymentRequestStatus(status: string): DeploymentRequestStatus {
  if (!(DEPLOYMENT_REQUEST_STATUSES as readonly string[]).includes(status)) {
    throw new Error(`Deployment request status must be one of: ${DEPLOYMENT_REQUEST_STATUSES.join(", ")}.`);
  }
  return status as DeploymentRequestStatus;
}

function assertDeploymentRequestTransition(current: string | null | undefined, next: DeploymentRequestStatus) {
  const currentStatus = assertDeploymentRequestStatus(String(current ?? "pending"));
  if (currentStatus === next) {
    throw new Error(`Deployment request is already ${next}; duplicate transition blocked.`);
  }

  const allowed = deploymentRequestTransitions[currentStatus] ?? [];
  if (!allowed.includes(next)) {
    throw new Error(`Invalid deployment request transition: ${currentStatus} -> ${next}.`);
  }
}

async function currentActorId() {
  const context = await requireOperationsActor();
  return context.userId;
}

async function requireOperationsActor() {
  return requireAdminPermission("operations.write");
}

async function findExistingNotification(input: {
  title: string;
  channel: string;
  recipientId: string | null;
  entityTable: string | null;
  entityId: string | null;
}) {
  const config = assertSupabaseAdminConfig(process.env);
  const query = input.entityTable && input.entityId
    ? `${operationsReadColumns.notificationDedupe}&entity_table=eq.${encodeURIComponent(input.entityTable)}&entity_id=eq.${encodeURIComponent(input.entityId)}&title=eq.${encodeURIComponent(input.title)}&channel=eq.${encodeURIComponent(input.channel)}&limit=20`
    : `${operationsReadColumns.notificationDedupe}&title=eq.${encodeURIComponent(input.title)}&channel=eq.${encodeURIComponent(input.channel)}&limit=20`;
  const response = await fetch(`${config.url}/rest/v1/notifications?${query}`, {
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Failed to check existing notifications: ${response.status} ${response.statusText}`);
  }

  const rows = await response.json() as JsonRecord[];
  return rows.find((row) => String(row.recipient_id ?? "") === String(input.recipientId ?? "")) ?? null;
}

async function fetchOperationsRecord(table: "deployment_requests" | "staff_tasks", id: string) {
  const config = assertSupabaseAdminConfig(process.env);
  const select = table === "deployment_requests" ? operationsReadColumns.deploymentRequest : operationsReadColumns.staffTask;
  const response = await fetch(`${config.url}/rest/v1/${table}?${select}&id=eq.${encodeURIComponent(id)}&limit=1`, {
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Failed to load ${table} ${id}: ${response.status} ${response.statusText}`);
  }

  const rows = await response.json() as JsonRecord[];
  const row = rows[0];
  if (!row) {
    throw new Error(`${table} ${id} was not found.`);
  }
  return row;
}

async function createOperationsEventNotification(input: {
  actorId: string | null;
  title: string;
  body: string;
  priority?: string;
  recipientId?: string | null;
  entityTable: string;
  entityId: string;
  eventType: string;
  payload?: JsonRecord;
}) {
  const existing = await findExistingNotification({
    title: input.title,
    channel: "operations",
    recipientId: input.recipientId ?? null,
    entityTable: input.entityTable,
    entityId: input.entityId
  });

  if (existing) {
    await createActivityLogRecord(
      {
        actor_id: input.actorId,
        action: "operations.notification_duplicate",
        entity_table: "notifications",
        entity_id: String(existing.id ?? ""),
        severity: "warning",
        metadata: {
          event_type: input.eventType,
          source_entity_table: input.entityTable,
          source_entity_id: input.entityId,
          title: input.title
        }
      },
      input.actorId
    );
    return existing;
  }

  return createNotificationRecord(
    {
      recipient_id: input.recipientId ?? input.actorId,
      channel: "operations",
      title: input.title,
      body: input.body,
      status: "unread",
      priority: input.priority ?? "normal",
      entity_table: input.entityTable,
      entity_id: input.entityId,
      payload: {
        ...(input.payload ?? {}),
        event_type: input.eventType
      },
      created_at: new Date().toISOString()
    },
    input.actorId
  );
}

export async function createDeploymentRequestFormAction(formData: FormData) {
  const input = buildDeploymentRequestWorkflowFromFormData(formData);
  const actorId = await currentActorId();
  const payload = buildDeploymentRequestPayload(input);
  const now = new Date().toISOString();

  const requestRecord = await createDeploymentRequestRecord(
    {
      ...payload,
      order_id: input.orderId,
      assigned_to: input.assignedTo,
      updated_at: now
    },
    actorId
  );

  await createActivityLogRecord(
    {
      actor_id: actorId,
      action: "operations.deployment_request_create",
      entity_table: "deployment_requests",
      entity_id: String(requestRecord.id ?? ""),
      severity: input.priority === "critical" ? "warning" : "info",
      metadata: {
        requester_email: payload.requester_email,
        region: payload.region,
        mission_profile: payload.mission_profile,
        priority: input.priority,
        order_id: input.orderId
      }
    },
    actorId
  );

  await recordEntityRevisionSnapshot(
    "deployment_requests",
    String(requestRecord.id ?? ""),
    requestRecord as JsonRecord,
    actorId,
    input.changeSummary
  );

  await createOperationsEventNotification({
    actorId,
    title: `Deployment request ${String(requestRecord.id ?? "")} pending`,
    body: `Deployment request from ${payload.requester_email} is ready for operations review.`,
    priority: input.priority ?? "normal",
    recipientId: input.assignedTo ?? actorId,
    entityTable: "deployment_requests",
    entityId: String(requestRecord.id ?? ""),
    eventType: "operations.deployment_request_created",
    payload: {
      status: requestRecord.status,
      requester_email: payload.requester_email,
      region: payload.region,
      mission_profile: payload.mission_profile
    }
  });

  revalidatePath("/operations");
  revalidatePath("/operations/deployments");
}

export async function updateDeploymentRequestStatusFormAction(formData: FormData) {
  const input = buildDeploymentRequestLifecycleUpdateFromFormData(formData);
  const actorId = await currentActorId();
  const now = new Date().toISOString();
  const beforeRecord = await fetchOperationsRecord("deployment_requests", input.requestId);
  assertDeploymentRequestTransition(String(beforeRecord.status ?? "pending"), input.status);

  const requestRecord = await updateDeploymentRequestRecord(
    input.requestId,
    {
      status: input.status,
      assigned_to: input.assignedTo,
      payload: input.payload,
      updated_at: now
    },
    actorId
  );

  await createActivityLogRecord(
    {
      actor_id: actorId,
      action: "operations.deployment_request_status_update",
      entity_table: "deployment_requests",
      entity_id: input.requestId,
      severity: input.status === "blocked" || input.status === "escalated" ? "warning" : "info",
      metadata: {
        status: input.status,
        assigned_to: input.assignedTo,
        note: input.note
      }
    },
    actorId
  );

  await recordEntityRevisionSnapshot(
    "deployment_requests",
    input.requestId,
    requestRecord as JsonRecord,
    actorId,
    input.changeSummary
  );

  await createOperationsEventNotification({
    actorId,
    title: `Deployment request ${input.requestId} ${input.status}`,
    body: input.note ?? `Deployment request moved to ${input.status}.`,
    priority: input.status === "blocked" || input.status === "escalated" || input.status === "rolled_back" ? "high" : "normal",
    recipientId: (input.assignedTo ?? String(beforeRecord.assigned_to ?? "")) || actorId,
    entityTable: "deployment_requests",
    entityId: input.requestId,
    eventType: `operations.deployment_request_${input.status}`,
    payload: {
      before_status: beforeRecord.status ?? null,
      after_status: input.status,
      note: input.note,
      assigned_to: input.assignedTo
    }
  });

  revalidatePath("/operations");
  revalidatePath("/operations/deployments");
}

export async function createStaffTaskFormAction(formData: FormData) {
  const input = buildStaffTaskWorkflowFromFormData(formData);
  const actorId = await currentActorId();
  const payload = buildStaffTaskPayload(input);
  const now = new Date().toISOString();

  const taskRecord = await createStaffTaskRecord(
    {
      ...payload,
      status: input.status ?? payload.status,
      created_by: actorId,
      updated_at: now
    },
    actorId
  );

  await createActivityLogRecord(
    {
      actor_id: actorId,
      action: "operations.staff_task_create",
      entity_table: "staff_tasks",
      entity_id: String(taskRecord.id ?? ""),
      severity: input.priority === "critical" ? "warning" : "info",
      metadata: {
        title: payload.title,
        priority: payload.priority,
        status: input.status ?? payload.status,
        related_request_id: payload.related_request_id
      }
    },
    actorId
  );

  await recordEntityRevisionSnapshot(
    "staff_tasks",
    String(taskRecord.id ?? ""),
    taskRecord as JsonRecord,
    actorId,
    input.changeSummary
  );

  await createOperationsEventNotification({
    actorId,
    title: `Task ${String(taskRecord.id ?? "")} assigned`,
    body: `${payload.title} is ${String(taskRecord.status ?? "open")}.`,
    priority: input.priority ?? "normal",
    recipientId: payload.assigned_to ?? actorId,
    entityTable: "staff_tasks",
    entityId: String(taskRecord.id ?? ""),
    eventType: "operations.staff_task_created",
    payload: {
      status: taskRecord.status,
      priority: taskRecord.priority,
      related_request_id: taskRecord.related_request_id
    }
  });

  revalidatePath("/operations");
  revalidatePath("/operations/tasks");
}

export async function updateStaffTaskStatusFormAction(formData: FormData) {
  const taskId = String(formData.get("task_id") ?? "").trim();
  if (!taskId) {
    throw new Error("Task task_id is required.");
  }

  const status = assertStaffTaskStatus(String(formData.get("status") ?? "").trim());
  if (!status) {
    throw new Error("Task status is required.");
  }

  const note = String(formData.get("note") ?? "").trim();
  const actorId = await currentActorId();
  const now = new Date().toISOString();
  const beforeRecord = await fetchOperationsRecord("staff_tasks", taskId);
  if (String(beforeRecord.status ?? "open") === status) {
    throw new Error(`Staff task is already ${status}; duplicate status update blocked.`);
  }

  const taskRecord = await updateStaffTaskRecord(
    taskId,
    {
      status,
      updated_at: now
    },
    actorId
  );

  await createActivityLogRecord(
    {
      actor_id: actorId,
      action: "operations.staff_task_status_update",
      entity_table: "staff_tasks",
      entity_id: taskId,
      severity: status === "blocked" ? "warning" : "info",
      metadata: {
        status,
        note: note || null
      }
    },
    actorId
  );

  await recordEntityRevisionSnapshot(
    "staff_tasks",
    taskId,
    taskRecord as JsonRecord,
    actorId,
    note || `Update staff task ${taskId} to ${status}`
  );

  await createOperationsEventNotification({
    actorId,
    title: `Task ${taskId} ${status}`,
    body: note || `Task moved from ${String(beforeRecord.status ?? "open")} to ${status}.`,
    priority: status === "blocked" ? "high" : String(taskRecord.priority ?? "normal"),
    recipientId: String(taskRecord.assigned_to ?? "") || actorId,
    entityTable: "staff_tasks",
    entityId: taskId,
    eventType: `operations.staff_task_${status}`,
    payload: {
      before_status: beforeRecord.status ?? null,
      after_status: status,
      note: note || null
    }
  });

  revalidatePath("/operations");
  revalidatePath("/operations/tasks");
}

export async function createOperationsNotificationFormAction(formData: FormData) {
  const input = buildNotificationWorkflowFromFormData(formData);
  const actorId = await currentActorId();
  const now = new Date().toISOString();
  const existing = await findExistingNotification(input);

  if (existing) {
    await createActivityLogRecord(
      {
        actor_id: actorId,
        action: "operations.notification_duplicate",
        entity_table: "notifications",
        entity_id: String(existing.id ?? ""),
        severity: "warning",
        metadata: {
          channel: input.channel,
          priority: input.priority,
          entity_table: input.entityTable,
          entity_id: input.entityId,
          title: input.title
        }
      },
      actorId
    );
    revalidatePath("/operations");
    revalidatePath("/operations/notifications");
    return;
  }

  const notification = await createNotificationRecord(
    {
      recipient_id: input.recipientId,
      channel: input.channel,
      title: input.title,
      body: input.body,
      status: "unread",
      priority: input.priority,
      entity_table: input.entityTable,
      entity_id: input.entityId,
      payload: input.payload,
      created_at: now
    },
    actorId
  );

  await createActivityLogRecord(
    {
      actor_id: actorId,
      action: "operations.notification_create",
      entity_table: "notifications",
      entity_id: String(notification.id ?? ""),
      severity: input.priority === "critical" ? "warning" : "info",
      metadata: {
        channel: input.channel,
        priority: input.priority,
        entity_table: input.entityTable,
        entity_id: input.entityId
      }
    },
    actorId
  );

  revalidatePath("/operations");
  revalidatePath("/operations/notifications");
}
