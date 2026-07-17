import { AdminRecordConflictError, fetchAdminRecordsByColumn, transitionOrderWithTimelineViaRpc, appendOrderTimelineViaRpc } from "@/services/admin-actions";

type JsonRecord = Record<string, unknown>;
type EnvSource = Record<string, string | undefined>;

export type OrderTransitionPayload = {
  timelineEntry: JsonRecord;
  status?: string | null;
  fulfillmentStatus?: string | null;
  paymentStatus?: string | null;
  idempotencyKey: string;
};

export function serverExpectedUpdatedAt(order: JsonRecord) {
  return String(order.updated_at ?? "").trim() || null;
}

export async function fetchOrderById(orderId: string, env: EnvSource = process.env) {
  const rows = await fetchAdminRecordsByColumn("orders", "id", orderId, env);
  const order = rows[0];
  if (!order) throw new Error("Order not found.");
  return order;
}

export async function transitionOrderWithServerCasRetry(
  orderId: string,
  actorId: string,
  env: EnvSource,
  buildTransition: (order: JsonRecord) => OrderTransitionPayload | Promise<OrderTransitionPayload>
) {
  let lastConflict: AdminRecordConflictError | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const order = await fetchOrderById(orderId, env);
    const transition = await buildTransition(order);

    try {
      return await transitionOrderWithTimelineViaRpc(
        orderId,
        transition.timelineEntry,
        actorId,
        env,
        {
          status: transition.status ?? null,
          fulfillmentStatus: transition.fulfillmentStatus ?? null,
          paymentStatus: transition.paymentStatus ?? null,
          expectedUpdatedAt: serverExpectedUpdatedAt(order),
          idempotencyKey: transition.idempotencyKey
        }
      );
    } catch (error) {
      if (error instanceof AdminRecordConflictError && attempt === 0) {
        lastConflict = error;
        continue;
      }
      throw error;
    }
  }

  throw (
    lastConflict
    ?? new AdminRecordConflictError("Concurrent order update detected. Reload the latest order state and retry.")
  );
}

export async function appendOrderTimelineWithServerCasRetry(
  orderId: string,
  actorId: string,
  env: EnvSource,
  buildEntry: (order: JsonRecord) => JsonRecord
) {
  let lastConflict: AdminRecordConflictError | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const order = await fetchOrderById(orderId, env);
    const entry = buildEntry(order);

    try {
      return await appendOrderTimelineViaRpc(orderId, entry, actorId, env, {
        expectedUpdatedAt: serverExpectedUpdatedAt(order)
      });
    } catch (error) {
      if (error instanceof AdminRecordConflictError && attempt === 0) {
        lastConflict = error;
        continue;
      }
      throw error;
    }
  }

  throw (
    lastConflict
    ?? new AdminRecordConflictError("Concurrent order update detected. Reload the latest order state and retry.")
  );
}
