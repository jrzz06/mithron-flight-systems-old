import { fetchAdminRecordsByColumn } from "@/services/admin-actions";
import type { PaymentEvent, PaymentProviderId } from "./types";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readInternalOrderIdFromEvent(event: PaymentEvent) {
  const raw = asRecord(event.raw);
  if (!raw) return null;

  const directNotes = asRecord(raw.notes);
  const directOrderId = readString(directNotes?.order_id);
  if (directOrderId) return directOrderId;

  const payload = asRecord(raw.payload);
  const payment = asRecord(payload?.payment);
  const entity = asRecord(payment?.entity);
  const entityNotes = asRecord(entity?.notes);
  const entityOrderId = readString(entityNotes?.order_id);
  if (entityOrderId) return entityOrderId;

  const cashfreeData = asRecord(raw.data);
  const cashfreeOrder = asRecord(cashfreeData?.order);
  const orderNote = readString(cashfreeOrder?.order_note);
  if (orderNote) return orderNote;

  return readString(raw.order_note);
}

export async function resolvePaymentRecordForEvent(
  provider: PaymentProviderId,
  event: PaymentEvent
): Promise<JsonRecord | null> {
  const intentMatches = await fetchAdminRecordsByColumn("payments", "provider_intent_id", event.intentId);
  const intentPayment =
    intentMatches.find((row) => String(row.provider ?? "") === provider) ?? intentMatches[0];
  if (intentPayment) return intentPayment;

  if (event.paymentId) {
    const paymentMatches = await fetchAdminRecordsByColumn("payments", "provider_payment_id", event.paymentId);
    const paymentMatch =
      paymentMatches.find((row) => String(row.provider ?? "") === provider) ?? paymentMatches[0];
    if (paymentMatch) return paymentMatch;
  }

  const internalOrderId = readInternalOrderIdFromEvent(event);
  if (internalOrderId) {
    const orderPayments = await fetchAdminRecordsByColumn("payments", "order_id", internalOrderId);
    const orderPayment = orderPayments.find((row) => String(row.provider ?? "") === provider) ?? orderPayments[0];
    if (orderPayment) return orderPayment;
  }

  return null;
}
