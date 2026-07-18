import { assertSupabaseAdminConfig } from "@/lib/env";
import {
  transitionOrderWithServerCasRetry,
  appendOrderTimelineWithServerCasRetry
} from "@/lib/admin/order-transition-server";
import {
  AdminRecordConflictError,
  createActivityLogRecord,
  createAdminRecord,
  createNotificationRecord,
  deleteAdminRecord,
  fetchAdminRecordsByColumn,
  notificationDedupeKey,
  updateAdminRecord
} from "@/services/admin-actions";
import { getAdminSettingsPolicy } from "@/services/admin-settings-policy";
import { isCancellableOrderStatus } from "@/lib/orders/status";
import {
  buildOrderTimelineEntry,
  buildWarehouseAssignmentUpdate,
  transitionOrderStatus,
  type OrderStatus
} from "@/services/orders";
import { assertValidWarehouseCode } from "@/services/warehouses";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

type JsonRecord = Record<string, unknown>;
type EnvSource = Record<string, string | undefined>;

function headers(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json"
  };
}

function isPlainRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function listWarehouseUserIds(env: EnvSource = process.env) {
  const config = assertSupabaseAdminConfig(env);
  const response = await fetchWithTimeout(
    `${config.url}/rest/v1/user_roles?select=user_id&role_key=eq.warehouse&limit=50`,
    { headers: headers(config.serviceRoleKey), cache: "no-store" }
  );
  if (!response.ok) return [];
  const rows = (await response.json()) as Array<{ user_id?: string }>;
  return rows.map((row) => String(row.user_id ?? "")).filter(Boolean);
}

async function syncLinkedEnquiryStatus(
  orderId: string,
  status: "won" | "lost" | "converted" | "contacted",
  actorId: string,
  env: EnvSource
) {
  const enquiries = await fetchAdminRecordsByColumn("enquiries", "converted_order_id", orderId, env);
  for (const enquiry of enquiries) {
    const enquiryId = String(enquiry.id ?? "");
    if (!enquiryId) continue;
    await updateAdminRecord(
      "enquiries",
      "id",
      enquiryId,
      { status, updated_at: new Date().toISOString() },
      actorId,
      env
    );
  }
}

async function resolveAssignmentWarehouseCode(
  order: JsonRecord,
  explicitCode: string | undefined,
  env: EnvSource
) {
  const policy = await getAdminSettingsPolicy(env);
  if (explicitCode?.trim()) {
    return assertValidWarehouseCode(explicitCode.trim(), env);
  }
  const metadata = isPlainRecord(order.metadata) ? order.metadata : {};
  const fromMetadata = typeof metadata.assigned_warehouse_code === "string" ? metadata.assigned_warehouse_code : "";
  if (fromMetadata) return assertValidWarehouseCode(fromMetadata, env);
  return assertValidWarehouseCode(policy.defaultWarehouseCode, env);
}

async function notifyWarehouseAboutOrder(
  order: JsonRecord,
  actorId: string,
  env: EnvSource
) {
  const policy = await getAdminSettingsPolicy(env);
  if (!policy.warehouseAlertsEnabled) return;
  const orderId = String(order.id ?? "");
  const orderNumber = String(order.order_number ?? orderId);
  const warehouseUsers = await listWarehouseUserIds(env);
  const metadata = isPlainRecord(order.metadata) ? order.metadata : {};
  const customerName = typeof metadata.customer_full_name === "string" && metadata.customer_full_name.trim()
    ? metadata.customer_full_name.trim()
    : typeof metadata.customer_name === "string" && metadata.customer_name.trim()
      ? metadata.customer_name.trim()
      : "";
  const phone = typeof metadata.customer_phone === "string" ? metadata.customer_phone.trim() : "";
  const warehouseCode = typeof metadata.assigned_warehouse_code === "string" ? metadata.assigned_warehouse_code : "";
  const customerEmail = String(order.customer_email ?? "").trim();
  const body = [
    `Order ${orderNumber} is ready for fulfillment.`,
    warehouseCode ? `Warehouse: ${warehouseCode}` : null,
    customerName ? `Customer: ${customerName}` : null,
    customerEmail ? `Email: ${customerEmail}` : null,
    phone ? `Phone: ${phone}` : null
  ].filter(Boolean).join(" ");

  for (const recipientId of warehouseUsers) {
    await createNotificationRecord(
      {
        recipient_id: recipientId,
        channel: "in_app",
        title: "New warehouse assignment",
        body,
        status: "unread",
        priority: "high",
        entity_table: "orders",
        entity_id: orderId,
        payload: {
          order_number: orderNumber,
          customer_full_name: customerName || null,
          customer_email: customerEmail || null,
          customer_phone: phone || null,
          assigned_warehouse_code: warehouseCode || null
        },
        dedupe_key: notificationDedupeKey("order-fulfillment-ready", orderId, recipientId)
      },
      actorId,
      env
    ).catch(() => undefined);
  }
}

export async function notifyCustomerAboutOrder(
  order: JsonRecord,
  title: string,
  body: string,
  actorId: string,
  env: EnvSource
) {
  const metadata = isPlainRecord(order.metadata) ? order.metadata : {};
  const userId = typeof order.created_by_user_id === "string"
    ? order.created_by_user_id
    : typeof metadata.created_by_user_id === "string"
      ? metadata.created_by_user_id
      : null;
  const customerEmail = String(order.customer_email ?? "").trim();
  if (!userId && !customerEmail) return;

  await createNotificationRecord(
    {
      recipient_id: userId,
      channel: "customer",
      title,
      body,
      status: "unread",
      entity_table: "orders",
      entity_id: String(order.id ?? ""),
      payload: { recipient_email: customerEmail || undefined },
      // Title identifies the business event ("Order confirmed", "Payment
      // received", ...) so retried transitions dedupe while distinct
      // lifecycle events still notify.
      dedupe_key: notificationDedupeKey("order-customer", String(order.id ?? ""), title, userId ?? customerEmail)
    },
    actorId,
    env
  ).catch(() => undefined);
}

export async function confirmAdminOrderWorkflow(
  input: { orderId: string; actorId: string; expectedUpdatedAt?: string | null },
  env: EnvSource = process.env
) {
  let nextStatus: OrderStatus | null = null;

  const rows = await fetchAdminRecordsByColumn("orders", "id", input.orderId, env);
  const currentOrder = rows[0];
  if (!currentOrder) throw new Error("Order was not found.");
  const currentStatus = String(currentOrder.status ?? "pending_payment");
  if (currentStatus === "admin_review") {
    await verifyExistingOrderStock(input.orderId, env);
  }

  const updated = await transitionOrderWithServerCasRetry(input.orderId, input.actorId, env, (order) => {
    const statusAtTransition = String(order.status ?? "pending_payment");
    let status: OrderStatus;
    let event: string;
    let note: string;

    if (statusAtTransition === "paid") {
      status = transitionOrderStatus(statusAtTransition, "admin_review");
      event = "admin_review";
      note = "Order moved to admin review after payment verification.";
    } else if (statusAtTransition === "admin_review") {
      status = transitionOrderStatus(statusAtTransition, "confirmed");
      event = "admin_confirm";
      note = "Order confirmed by admin.";
    } else {
      throw new Error(`Order cannot be confirmed from status ${statusAtTransition}.`);
    }

    nextStatus = status;
    const idempotencyKey = `${event}:${input.orderId}`;
    return {
      timelineEntry: buildOrderTimelineEntry({
        status,
        event,
        note,
        actorId: input.actorId,
        metadata: { idempotency_key: idempotencyKey }
      }),
      status,
      idempotencyKey
    };
  });

  if (nextStatus === "confirmed") {
    await syncLinkedEnquiryStatus(input.orderId, "won", input.actorId, env);
    await Promise.all([
      notifyCustomerAboutOrder(
        updated,
        "Order confirmed",
        "Your order has been approved. We will notify you when it ships.",
        input.actorId,
        env
      ).catch((error) => console.error("[order-workflow] Failed to notify customer about confirmation.", error)),
      createActivityLogRecord(
        {
          actor_id: input.actorId,
          action: "admin_confirm",
          entity_table: "orders",
          entity_id: input.orderId,
          severity: "info",
          metadata: { status: nextStatus }
        },
        input.actorId,
        env
      )
    ]);
    return updated;
  }

  await createActivityLogRecord(
    {
      actor_id: input.actorId,
      action: "admin_review",
      entity_table: "orders",
      entity_id: input.orderId,
      severity: "info",
      metadata: { status: nextStatus }
    },
    input.actorId,
    env
  );

  return updated;
}

export async function markOrderPaidWorkflow(
  input: { orderId: string; actorId: string; note?: string; expectedUpdatedAt?: string | null },
  env: EnvSource = process.env
) {
  let nextStatus: OrderStatus | null = null;

  const updated = await transitionOrderWithServerCasRetry(input.orderId, input.actorId, env, (order) => {
    const currentStatus = String(order.status ?? "");
    if (currentStatus !== "pending_payment") {
      throw new Error(`Only orders awaiting payment can be marked as paid (current: ${currentStatus}).`);
    }

    const status = transitionOrderStatus(currentStatus, "paid");
    nextStatus = status;
    const idempotencyKey = `admin_mark_paid:${input.orderId}`;
    return {
      timelineEntry: buildOrderTimelineEntry({
        status,
        event: "admin_mark_paid",
        note: input.note?.trim() || "Payment received — marked as paid manually by admin.",
        actorId: input.actorId,
        metadata: { idempotency_key: idempotencyKey }
      }),
      status,
      paymentStatus: "succeeded",
      idempotencyKey
    };
  });

  await createAdminRecord(
    "payments",
    {
      order_id: input.orderId,
      provider: "manual",
      provider_intent_id: `manual-mark-paid-${input.orderId}`,
      provider_payment_id: `manual-mark-paid-${String(updated.order_number ?? input.orderId)}`,
      amount: Number(updated.total ?? 0),
      currency: String(updated.currency ?? "INR"),
      status: "succeeded",
      verified_at: new Date().toISOString()
    },
    input.actorId,
    env
  ).catch(() => undefined);

  await Promise.all([
    notifyCustomerAboutOrder(
      updated,
      "Payment received",
      "We have confirmed your payment. Your order will now be reviewed for processing.",
      input.actorId,
      env
    ).catch((error) => console.error("[order-workflow] Failed to notify customer about payment.", error)),
    createActivityLogRecord(
      {
        actor_id: input.actorId,
        action: "admin_mark_paid",
        entity_table: "orders",
        entity_id: input.orderId,
        severity: "info",
        metadata: { status: nextStatus }
      },
      input.actorId,
      env
    )
  ]);

  return updated;
}

export async function markOrderRefundedWorkflow(
  input: { orderId: string; actorId: string; note?: string; expectedUpdatedAt?: string | null },
  env: EnvSource = process.env
) {
  let nextStatus: OrderStatus | null = null;

  const updated = await transitionOrderWithServerCasRetry(input.orderId, input.actorId, env, (order) => {
    const currentStatus = String(order.status ?? "");
    const status = transitionOrderStatus(currentStatus, "refunded");
    nextStatus = status;
    const idempotencyKey = `admin_mark_refunded:${input.orderId}`;
    return {
      timelineEntry: buildOrderTimelineEntry({
        status,
        event: "admin_mark_refunded",
        note: input.note?.trim() || "Order refunded — marked manually by admin.",
        actorId: input.actorId,
        metadata: { idempotency_key: idempotencyKey }
      }),
      status,
      paymentStatus: "refunded",
      idempotencyKey
    };
  });

  await createAdminRecord(
    "payments",
    {
      order_id: input.orderId,
      provider: "manual",
      provider_intent_id: `manual-mark-refunded-${input.orderId}`,
      provider_payment_id: `manual-mark-refunded-${String(updated.order_number ?? input.orderId)}`,
      amount: Number(updated.total ?? 0),
      currency: String(updated.currency ?? "INR"),
      status: "refunded",
      verified_at: new Date().toISOString()
    },
    input.actorId,
    env
  ).catch(() => undefined);

  await createActivityLogRecord(
    {
      actor_id: input.actorId,
      action: "admin_mark_refunded",
      entity_table: "orders",
      entity_id: input.orderId,
      severity: "warning",
      metadata: { status: nextStatus }
    },
    input.actorId,
    env
  );

  return updated;
}

export async function rejectAdminOrderWorkflow(
  input: { orderId: string; actorId: string; reason?: string; expectedUpdatedAt?: string | null },
  env: EnvSource = process.env
) {
  const updated = await transitionOrderWithServerCasRetry(input.orderId, input.actorId, env, (order) => {
    const currentStatus = String(order.status ?? "");
    if (currentStatus !== "admin_review") {
      throw new Error(`Only orders in admin review can be rejected (current: ${currentStatus}).`);
    }

    const idempotencyKey = `admin_reject:${input.orderId}`;
    return {
      timelineEntry: buildOrderTimelineEntry({
        status: "cancelled",
        event: "admin_reject",
        note: input.reason?.trim() || "Order rejected by admin.",
        actorId: input.actorId,
        metadata: { idempotency_key: idempotencyKey }
      }),
      status: "cancelled",
      fulfillmentStatus: "cancelled",
      idempotencyKey
    };
  });

  await syncLinkedEnquiryStatus(input.orderId, "lost", input.actorId, env);
  await Promise.all([
    notifyCustomerAboutOrder(
      updated,
      "Order not approved",
      input.reason?.trim() || "Your enquiry/order request was not approved. Contact support for details.",
      input.actorId,
      env
    ).catch((error) => console.error("[order-workflow] Failed to notify customer about rejection.", error)),
    createActivityLogRecord(
      {
        actor_id: input.actorId,
        action: "admin_reject",
        entity_table: "orders",
        entity_id: input.orderId,
        severity: "warning",
        metadata: { reason: input.reason ?? null }
      },
      input.actorId,
      env
    )
  ]);

  return updated;
}

export async function cancelAdminOrderWorkflow(
  input: { orderId: string; actorId: string; reason: string; expectedUpdatedAt?: string | null },
  env: EnvSource = process.env
) {
  const reason = input.reason.trim();
  if (!reason) throw new Error("A cancellation reason is required.");

  const updated = await transitionOrderWithServerCasRetry(input.orderId, input.actorId, env, (order) => {
    const currentStatus = String(order.status ?? "");
    const fulfillmentStatus = String(order.fulfillment_status ?? "");
    const terminalFulfillment = ["cancelled", "delivered", "returned", "shipped"];
    if (!isCancellableOrderStatus(currentStatus) || terminalFulfillment.includes(fulfillmentStatus)) {
      if (["dispatched", "in_transit", "delivered"].includes(currentStatus) || fulfillmentStatus === "shipped") {
        throw new Error("Order cannot be cancelled after dispatch — use return/refund instead.");
      }
      throw new Error(`Order cannot be cancelled in its current state (${currentStatus || "unknown"}).`);
    }

    const idempotencyKey = `admin_cancel:${input.orderId}`;
    return {
      timelineEntry: buildOrderTimelineEntry({
        status: "cancelled",
        event: "admin_cancel",
        note: reason,
        actorId: input.actorId,
        metadata: { idempotency_key: idempotencyKey }
      }),
      status: "cancelled",
      fulfillmentStatus: "cancelled",
      idempotencyKey
    };
  });

  await syncLinkedEnquiryStatus(input.orderId, "lost", input.actorId, env);
  await Promise.all([
    notifyCustomerAboutOrder(
      updated,
      "Order cancelled",
      reason,
      input.actorId,
      env
    ).catch((error) => console.error("[order-workflow] Failed to notify customer about cancellation.", error)),
    createActivityLogRecord(
      {
        actor_id: input.actorId,
        action: "admin_cancel",
        entity_table: "orders",
        entity_id: input.orderId,
        severity: "warning",
        metadata: { reason }
      },
      input.actorId,
      env
    )
  ]);

  return updated;
}

export async function assignOrderToWarehouseWorkflow(
  input: { orderId: string; actorId: string; warehouseCode?: string; expectedUpdatedAt?: string | null },
  env: EnvSource = process.env
) {
  await verifyExistingOrderStock(input.orderId, env);

  let warehouseCode = "";
  let nextFulfillment = "";

  const updated = await transitionOrderWithServerCasRetry(input.orderId, input.actorId, env, async (order) => {
    warehouseCode = await resolveAssignmentWarehouseCode(order, input.warehouseCode, env);
    const currentStatus = String(order.status ?? "confirmed");

    let assignment: ReturnType<typeof buildWarehouseAssignmentUpdate>;
    try {
      assignment = buildWarehouseAssignmentUpdate(
        currentStatus,
        String(order.fulfillment_status ?? "pending")
      );
    } catch (error) {
      // Status already moved past "confirmed" (race / double-submit / other tab).
      // Surface as a soft conflict so the client auto-syncs instead of a hard error toast.
      if (error instanceof Error && /cannot be assigned to warehouse/i.test(error.message)) {
        throw new AdminRecordConflictError(
          "This order was already sent to warehouse. Refreshing the latest status.",
          order
        );
      }
      throw error;
    }

    nextFulfillment = assignment.nextFulfillment;

    const idempotencyKey = `warehouse_assigned:${input.orderId}`;
    return {
      timelineEntry: buildOrderTimelineEntry({
        status: assignment.nextStatus,
        event: "warehouse_assigned",
        note: `Order assigned to warehouse ${warehouseCode}.`,
        actorId: input.actorId,
        metadata: {
          idempotency_key: idempotencyKey,
          fulfillment_status: assignment.nextFulfillment,
          warehouse_code: warehouseCode
        }
      }),
      status: assignment.nextStatus,
      fulfillmentStatus: assignment.nextFulfillment,
      idempotencyKey
    };
  });

  const existingMetadata = isPlainRecord(updated.metadata) ? updated.metadata : {};
  await updateAdminRecord(
    "orders",
    "id",
    input.orderId,
    {
      metadata: {
        ...existingMetadata,
        assigned_warehouse_code: warehouseCode,
        admin_fulfillment_released_at: new Date().toISOString()
      },
      updated_at: new Date().toISOString()
    },
    input.actorId,
    env
  );

  await syncLinkedEnquiryStatus(input.orderId, "converted", input.actorId, env);
  await Promise.all([
    notifyWarehouseAboutOrder(
      {
        ...updated,
        metadata: {
          ...(isPlainRecord(updated.metadata) ? updated.metadata : existingMetadata),
          assigned_warehouse_code: warehouseCode
        }
      },
      input.actorId,
      env
    ).catch((error) => console.error("[order-workflow] Failed to notify warehouse about assignment.", error)),
    createActivityLogRecord(
      {
        actor_id: input.actorId,
        action: "warehouse_assigned",
        entity_table: "orders",
        entity_id: input.orderId,
        severity: "info",
        metadata: { fulfillment_status: nextFulfillment, warehouse_code: warehouseCode }
      },
      input.actorId,
      env
    )
  ]);

  return updated;
}

/** Fallback when only timeline append is needed without status change. */
export async function appendOrderTimelineEntryWorkflow(
  input: { orderId: string; entry: JsonRecord; actorId: string; expectedUpdatedAt?: string | null },
  env: EnvSource = process.env
) {
  return appendOrderTimelineWithServerCasRetry(input.orderId, input.actorId, env, () => input.entry);
}

const deletableOrderStatuses = new Set([
  "draft",
  "pending_payment",
  "admin_review",
  "cancelled"
]);

const activeFulfillmentStatuses = ["processing", "picked", "packed", "ready_to_dispatch", "shipped", "delivered", "assigned"];
const activeOrderStatuses = ["assigned", "processing", "packed", "dispatched", "delivered"];

function assertOrderCanBeRemoved(order: JsonRecord) {
  const status = String(order.status ?? "");
  const fulfillmentStatus = String(order.fulfillment_status ?? "");
  if (activeFulfillmentStatuses.includes(fulfillmentStatus) || activeOrderStatuses.includes(status)) {
    throw new Error("Orders in active fulfillment cannot be deleted. Cancel the order instead.");
  }
}

export async function archiveAdminOrderWorkflow(
  input: { orderId: string; actorId: string; reason?: string },
  env: EnvSource = process.env
) {
  const rows = await fetchAdminRecordsByColumn("orders", "id", input.orderId, env);
  const order = rows[0];
  if (!order) throw new Error("Order not found.");
  if (order.deleted_at) throw new Error("Deleted orders must be restored before archiving.");

  const now = new Date().toISOString();
  const updated = await updateAdminRecord(
    "orders",
    "id",
    input.orderId,
    { archived_at: now, updated_at: now },
    input.actorId,
    env
  );

  await createActivityLogRecord(
    {
      actor_id: input.actorId,
      action: "admin_archive",
      entity_table: "orders",
      entity_id: input.orderId,
      severity: "info",
      metadata: { reason: input.reason?.trim() ?? null }
    },
    input.actorId,
    env
  );

  return updated;
}

export async function softDeleteAdminOrderWorkflow(
  input: { orderId: string; actorId: string; reason: string },
  env: EnvSource = process.env
) {
  const rows = await fetchAdminRecordsByColumn("orders", "id", input.orderId, env);
  const order = rows[0];
  if (!order) throw new Error("Order not found.");

  const status = String(order.status ?? "");
  const channel = String(order.channel ?? "checkout");
  assertOrderCanBeRemoved(order);
  if (!deletableOrderStatuses.has(status) && channel !== "enquiry") {
    throw new Error(`Order cannot be moved to trash in its current state (${status}).`);
  }

  const reason = input.reason.trim();
  if (!reason) throw new Error("A deletion reason is required.");

  const now = new Date().toISOString();
  const updated = await updateAdminRecord(
    "orders",
    "id",
    input.orderId,
    {
      deleted_at: now,
      deleted_by: input.actorId,
      updated_at: now
    },
    input.actorId,
    env
  );

  await createActivityLogRecord(
    {
      actor_id: input.actorId,
      action: "admin_soft_delete",
      entity_table: "orders",
      entity_id: input.orderId,
      severity: "warning",
      metadata: {
        reason,
        order_number: String(order.order_number ?? ""),
        customer_email: String(order.customer_email ?? "")
      }
    },
    input.actorId,
    env
  );

  return { deleted: true, orderId: input.orderId, row: updated };
}

export async function restoreAdminOrderWorkflow(
  input: { orderId: string; actorId: string },
  env: EnvSource = process.env
) {
  const rows = await fetchAdminRecordsByColumn("orders", "id", input.orderId, env);
  const order = rows[0];
  if (!order) throw new Error("Order not found.");

  const now = new Date().toISOString();
  const updated = await updateAdminRecord(
    "orders",
    "id",
    input.orderId,
    {
      deleted_at: null,
      deleted_by: null,
      archived_at: null,
      updated_at: now
    },
    input.actorId,
    env
  );

  await createActivityLogRecord(
    {
      actor_id: input.actorId,
      action: "admin_restore",
      entity_table: "orders",
      entity_id: input.orderId,
      severity: "info"
    },
    input.actorId,
    env
  );

  return updated;
}

export async function permanentDeleteAdminOrderWorkflow(
  input: { orderId: string; actorId: string; reason: string; expectedUpdatedAt?: string | null },
  env: EnvSource = process.env
) {
  const rows = await fetchAdminRecordsByColumn("orders", "id", input.orderId, env);
  const order = rows[0];
  if (!order) throw new Error("Order not found.");

  const expectedUpdatedAt = String(input.expectedUpdatedAt ?? order.updated_at ?? "").trim();
  if (expectedUpdatedAt && String(order.updated_at ?? "") !== expectedUpdatedAt) {
    throw new AdminRecordConflictError("Concurrent order update detected. Reload the latest order state and retry.");
  }

  const status = String(order.status ?? "");
  const channel = String(order.channel ?? "checkout");
  assertOrderCanBeRemoved(order);
  if (!deletableOrderStatuses.has(status) && channel !== "enquiry") {
    throw new Error(`Order cannot be permanently deleted in its current state (${status}).`);
  }

  const reason = input.reason.trim();
  if (!reason) throw new Error("A deletion reason is required.");

  const linkedEnquiries = await fetchAdminRecordsByColumn("enquiries", "converted_order_id", input.orderId, env);
  for (const enquiry of linkedEnquiries) {
    const enquiryId = String(enquiry.id ?? "");
    if (!enquiryId) continue;
    const payload = isPlainRecord(enquiry.payload) ? enquiry.payload : {};
    await updateAdminRecord(
      "enquiries",
      "id",
      enquiryId,
      {
        converted_order_id: null,
        payload: {
          ...payload,
          order_id: null,
          order_number: null
        },
        updated_at: new Date().toISOString()
      },
      input.actorId,
      env
    );
  }

  await createActivityLogRecord(
    {
      actor_id: input.actorId,
      action: "admin_delete",
      entity_table: "orders",
      entity_id: input.orderId,
      severity: "warning",
      metadata: {
        reason,
        order_number: String(order.order_number ?? ""),
        customer_email: String(order.customer_email ?? "")
      }
    },
    input.actorId,
    env
  );

  const config = assertSupabaseAdminConfig(env);
  const optimisticQuery = expectedUpdatedAt
    ? `&updated_at=eq.${encodeURIComponent(expectedUpdatedAt)}`
    : "";
  const response = await fetchWithTimeout(
    `${config.url}/rest/v1/orders?id=eq.${encodeURIComponent(input.orderId)}${optimisticQuery}`,
    {
      method: "DELETE",
      headers: { ...headers(config.serviceRoleKey), Prefer: "return=minimal" },
      cache: "no-store"
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to delete orders record: ${response.status} ${response.statusText}`);
  }

  if (expectedUpdatedAt) {
    const remaining = await fetchAdminRecordsByColumn("orders", "id", input.orderId, env);
    if (remaining.length) {
      throw new AdminRecordConflictError("Concurrent order update detected. Reload the latest order state and retry.");
    }
  }

  return { deleted: true, orderId: input.orderId };
}

export async function deleteAdminOrderWorkflow(
  input: { orderId: string; actorId: string; reason: string },
  env: EnvSource = process.env
) {
  return softDeleteAdminOrderWorkflow(input, env);
}

function readOrderMetadata(order: JsonRecord): JsonRecord {
  return isPlainRecord(order.metadata) ? order.metadata : {};
}

function shippingAddressComplete(address: JsonRecord | null | undefined) {
  if (!address) return false;
  return Boolean(
    String(address.line1 ?? "").trim()
    && String(address.city ?? "").trim()
    && String(address.state ?? address.region ?? "").trim()
    && String(address.country ?? "").trim()
    && String(address.postal_code ?? address.postalCode ?? "").trim()
  );
}

async function loadOrderStockItems(orderId: string, env: EnvSource) {
  const items = await fetchAdminRecordsByColumn("order_items", "order_id", orderId, env);
  return items
    .map((item) => ({
      productSlug: String(item.product_slug ?? "").trim(),
      quantity: Math.max(0, Math.trunc(Number(item.quantity ?? 0) || 0))
    }))
    .filter((item) => item.productSlug && item.quantity > 0);
}

async function verifyExistingOrderStock(orderId: string, env: EnvSource) {
  const { verifyOrderStockAvailability } = await import("@/services/inventory");
  const stockItems = await loadOrderStockItems(orderId, env);
  if (!stockItems.length) {
    throw new Error("Add at least one product before continuing.");
  }
  await verifyOrderStockAvailability(stockItems, env);
}

export type OrderShippingAddressInput = {
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  phone?: string | null;
};

export async function updateOrderShippingAddressWorkflow(
  input: {
    orderId: string;
    actorId: string;
    shipping: OrderShippingAddressInput;
    billingSameAsShipping?: boolean;
    billing?: OrderShippingAddressInput | null;
    expectedUpdatedAt?: string | null;
  },
  env: EnvSource = process.env
) {
  const shipping = {
    line1: input.shipping.line1.trim(),
    line2: input.shipping.line2?.trim() || null,
    city: input.shipping.city.trim(),
    state: input.shipping.state.trim(),
    // Keep region alias for address format helpers that prefer region over state.
    region: input.shipping.state.trim(),
    country: input.shipping.country.trim() || "India",
    postal_code: input.shipping.postalCode.trim(),
    phone: input.shipping.phone?.trim() || null
  };

  if (!shipping.line1 || !shipping.city || !shipping.state || !shipping.postal_code) {
    throw new Error("Complete shipping address is required (line1, city, state, postal code).");
  }

  const billingSameAsShipping = input.billingSameAsShipping !== false;
  const billing = billingSameAsShipping
    ? shipping
    : input.billing
      ? {
          line1: input.billing.line1.trim(),
          line2: input.billing.line2?.trim() || null,
          city: input.billing.city.trim(),
          state: input.billing.state.trim(),
          region: input.billing.state.trim(),
          country: input.billing.country.trim() || "India",
          postal_code: input.billing.postalCode.trim(),
          phone: input.billing.phone?.trim() || null
        }
      : null;

  if (!billingSameAsShipping && (!billing || !shippingAddressComplete(billing))) {
    throw new Error("Complete billing address is required, or mark billing same as shipping.");
  }

  const rows = await fetchAdminRecordsByColumn("orders", "id", input.orderId, env);
  const order = rows[0];
  if (!order) throw new Error("Order was not found.");

  const metadata = readOrderMetadata(order);
  const existingItems = await fetchAdminRecordsByColumn("order_items", "order_id", input.orderId, env);
  const hasProducts = existingItems.length > 0 || metadata.needs_products === false;
  const now = new Date().toISOString();
  const currentStatus = String(order.status ?? "draft");
  const nextStatus = currentStatus === "draft" && hasProducts ? "admin_review" : currentStatus;
  const timeline = Array.isArray(order.timeline) ? [...(order.timeline as JsonRecord[])] : [];

  timeline.push(
    buildOrderTimelineEntry({
      status: nextStatus,
      event: "shipping_address_updated",
      note: "Admin updated the shipping address.",
      actorId: input.actorId
    })
  );

  if (hasProducts && metadata.needs_products !== true) {
    timeline.push(
      buildOrderTimelineEntry({
        status: nextStatus,
        event: "order.ready_for_payment",
        note: "Order has address and products and is ready for payment review.",
        actorId: input.actorId
      })
    );
  }

  const concurrencyToken = input.expectedUpdatedAt || String(order.updated_at ?? "") || null;

  return updateAdminRecord(
    "orders",
    "id",
    input.orderId,
    {
      status: nextStatus,
      payment_status: nextStatus === "admin_review" && String(order.payment_status ?? "") === "not_required"
        ? "requires_payment"
        : order.payment_status,
      metadata: {
        ...metadata,
        shipping_address: shipping,
        billing_address: billing,
        billing_same_as_shipping: billingSameAsShipping,
        needs_address: false
      },
      timeline,
      updated_at: now
    },
    input.actorId,
    env,
    { expectedUpdatedAt: concurrencyToken }
  );
}

export async function addOrderItemsToOrderWorkflow(
  input: {
    orderId: string;
    actorId: string;
    items: Array<{ productSlug: string; quantity: number }>;
    expectedUpdatedAt?: string | null;
  },
  env: EnvSource = process.env
) {
  if (!input.items.length) {
    throw new Error("Add at least one product.");
  }

  const rows = await fetchAdminRecordsByColumn("orders", "id", input.orderId, env);
  const order = rows[0];
  if (!order) throw new Error("Order was not found.");

  const currentStatus = String(order.status ?? "draft");
  if (["cancelled", "delivered", "returned", "refunded"].includes(currentStatus)) {
    throw new Error(`Products cannot be added to an order in ${currentStatus} status.`);
  }

  const { resolveCheckoutStockSkus } = await import("@/services/checkout-stock");
  const { verifyOrderStockAvailability } = await import("@/services/inventory");
  const { getCheckoutPricingBySlugs } = await import("@/services/catalog");
  const { buildValidatedOrderDraft } = await import("@/services/orders");

  await verifyOrderStockAvailability(input.items, env);
  const stockItems = await resolveCheckoutStockSkus(input.items, env);
  const catalog = await getCheckoutPricingBySlugs(stockItems.map((item) => item.productSlug));
  for (const item of stockItems) {
    if (!catalog.some((product) => product.slug === item.productSlug)) {
      throw new Error(`Product "${item.productSlug}" was not found in the catalog.`);
    }
  }

  const metadata = readOrderMetadata(order);
  const draft = buildValidatedOrderDraft(
    {
      customerEmail: String(order.customer_email ?? ""),
      items: stockItems.map((item) => ({
        productSlug: item.productSlug,
        quantity: item.quantity,
        sku: item.sku ?? undefined
      })),
      metadata
    },
    catalog
  );

  const now = new Date().toISOString();
  for (const item of draft.orderItems) {
    await createAdminRecord(
      "order_items",
      {
        order_id: input.orderId,
        product_slug: item.product_slug,
        product_name: item.product_name,
        bundle_id: item.bundle_id,
        sku: item.sku,
        quantity: item.quantity,
        unit_price: item.unit_price,
        line_total: item.line_total,
        metadata: item.metadata,
        updated_at: now
      },
      input.actorId,
      env
    );
  }

  const existingItems = await fetchAdminRecordsByColumn("order_items", "order_id", input.orderId, env);
  const itemsJson = existingItems.map((item) => ({
    product_slug: item.product_slug,
    product_name: item.product_name,
    quantity: item.quantity,
    unit_price: item.unit_price,
    line_total: item.line_total,
    sku: item.sku
  }));

  const subtotal = existingItems.reduce((sum, item) => sum + (Number(item.line_total) || 0), 0);
  const hasAddress = shippingAddressComplete(
    isPlainRecord(metadata.shipping_address) ? metadata.shipping_address : null
  ) || metadata.needs_address === false;
  const nextStatus = currentStatus === "draft" && hasAddress ? "admin_review" : currentStatus;
  const timeline = Array.isArray(order.timeline) ? [...(order.timeline as JsonRecord[])] : [];

  timeline.push(
    buildOrderTimelineEntry({
      status: nextStatus,
      event: "order_items_added",
      note: `Admin added ${draft.orderItems.length} product(s).`,
      actorId: input.actorId,
      metadata: { product_count: draft.orderItems.length }
    })
  );

  if (hasAddress) {
    timeline.push(
      buildOrderTimelineEntry({
        status: nextStatus,
        event: "order.ready_for_payment",
        note: "Order has address and products and is ready for payment review.",
        actorId: input.actorId
      })
    );
  }

  const concurrencyToken = input.expectedUpdatedAt || String(order.updated_at ?? "") || null;

  return updateAdminRecord(
    "orders",
    "id",
    input.orderId,
    {
      status: nextStatus,
      payment_status: nextStatus === "admin_review" && String(order.payment_status ?? "") === "not_required"
        ? "requires_payment"
        : order.payment_status,
      subtotal,
      total: subtotal,
      items: itemsJson,
      metadata: {
        ...metadata,
        needs_products: false
      },
      timeline,
      updated_at: now
    },
    input.actorId,
    env,
    { expectedUpdatedAt: concurrencyToken }
  );
}

export async function removeOrderItemFromOrderWorkflow(
  input: {
    orderId: string;
    orderItemId: string;
    actorId: string;
    reason?: string;
    expectedUpdatedAt?: string | null;
  },
  env: EnvSource = process.env
) {
  const rows = await fetchAdminRecordsByColumn("orders", "id", input.orderId, env);
  const order = rows[0];
  if (!order) throw new Error("Order was not found.");

  const currentStatus = String(order.status ?? "draft");
  if (["cancelled", "delivered", "returned", "refunded"].includes(currentStatus)) {
    throw new Error(`Products cannot be removed from an order in ${currentStatus} status.`);
  }

  const itemRows = await fetchAdminRecordsByColumn("order_items", "order_id", input.orderId, env);
  const target = itemRows.find((item) => String(item.id ?? "") === input.orderItemId);
  if (!target) throw new Error("Order line item was not found.");

  await deleteAdminRecord("order_items", "id", input.orderItemId, input.actorId, env);

  const remainingItems = itemRows.filter((item) => String(item.id ?? "") !== input.orderItemId);
  const itemsJson = remainingItems.map((item) => ({
    product_slug: item.product_slug,
    product_name: item.product_name,
    quantity: item.quantity,
    unit_price: item.unit_price,
    line_total: item.line_total,
    sku: item.sku
  }));

  const subtotal = remainingItems.reduce((sum, item) => sum + (Number(item.line_total) || 0), 0);
  const metadata = readOrderMetadata(order);
  const timeline = Array.isArray(order.timeline) ? [...(order.timeline as JsonRecord[])] : [];
  const productName = String(target.product_name ?? target.product_slug ?? "product");

  timeline.push(
    buildOrderTimelineEntry({
      status: currentStatus,
      event: "order_item_removed",
      note: input.reason?.trim()
        ? `Admin removed ${productName}: ${input.reason.trim()}`
        : `Admin removed ${productName}.`,
      actorId: input.actorId,
      metadata: { order_item_id: input.orderItemId, product_slug: target.product_slug }
    })
  );

  const now = new Date().toISOString();
  const concurrencyToken = input.expectedUpdatedAt || String(order.updated_at ?? "") || null;

  return updateAdminRecord(
    "orders",
    "id",
    input.orderId,
    {
      subtotal,
      total: subtotal,
      items: itemsJson,
      metadata: {
        ...metadata,
        needs_products: remainingItems.length === 0
      },
      timeline,
      updated_at: now
    },
    input.actorId,
    env,
    { expectedUpdatedAt: concurrencyToken }
  );
}

export { AdminRecordConflictError };
