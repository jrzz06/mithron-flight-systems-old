export const PAYMENT_LIFECYCLE_STATES = [
  "PENDING",
  "PAYMENT_INITIATED",
  "PAYMENT_PROCESSING",
  "PAYMENT_VERIFIED",
  "CONFIRMED",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
  "REFUNDED"
] as const;

export type PaymentLifecycleState = (typeof PAYMENT_LIFECYCLE_STATES)[number];

const transitions: Record<PaymentLifecycleState, PaymentLifecycleState[]> = {
  PENDING: ["PAYMENT_INITIATED", "CANCELLED", "EXPIRED"],
  PAYMENT_INITIATED: ["PAYMENT_PROCESSING", "PAYMENT_VERIFIED", "FAILED", "CANCELLED", "EXPIRED"],
  PAYMENT_PROCESSING: ["PAYMENT_VERIFIED", "FAILED", "CANCELLED"],
  PAYMENT_VERIFIED: ["CONFIRMED", "REFUNDED"],
  CONFIRMED: ["REFUNDED"],
  FAILED: [],
  CANCELLED: [],
  EXPIRED: [],
  REFUNDED: []
};

export function canTransitionPaymentLifecycle(from: PaymentLifecycleState, to: PaymentLifecycleState) {
  return transitions[from]?.includes(to) ?? false;
}

export function transitionPaymentLifecycle(from: PaymentLifecycleState, to: PaymentLifecycleState) {
  if (!canTransitionPaymentLifecycle(from, to)) {
    throw new Error(`Invalid payment lifecycle transition from ${from} to ${to}.`);
  }
  return to;
}

export function readPaymentLifecycle(metadata: unknown): PaymentLifecycleState {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "PENDING";
  const lifecycle = (metadata as { payment_lifecycle?: unknown }).payment_lifecycle;
  if (!lifecycle || typeof lifecycle !== "object" || Array.isArray(lifecycle)) return "PENDING";
  const state = (lifecycle as { state?: unknown }).state;
  if (typeof state === "string" && (PAYMENT_LIFECYCLE_STATES as readonly string[]).includes(state)) {
    return state as PaymentLifecycleState;
  }
  return "PENDING";
}

export function mergePaymentLifecycleMetadata(
  metadata: Record<string, unknown>,
  patch: {
    state: PaymentLifecycleState;
    provider?: string;
    providerIntentId?: string;
    providerPaymentId?: string;
    source?: "checkout" | "verify" | "webhook" | "expire";
    note?: string;
  }
) {
  const current = readPaymentLifecycle(metadata);
  const next = current === patch.state ? current : transitionPaymentLifecycle(current, patch.state);
  const now = new Date().toISOString();
  const existing =
    metadata.payment_lifecycle && typeof metadata.payment_lifecycle === "object" && !Array.isArray(metadata.payment_lifecycle)
      ? (metadata.payment_lifecycle as Record<string, unknown>)
      : {};

  return {
    ...metadata,
    payment_lifecycle: {
      ...existing,
      state: next,
      provider: patch.provider ?? existing.provider ?? null,
      provider_intent_id: patch.providerIntentId ?? existing.provider_intent_id ?? null,
      provider_payment_id: patch.providerPaymentId ?? existing.provider_payment_id ?? null,
      updated_at: now,
      ...(patch.state === "PAYMENT_INITIATED" ? { initiated_at: existing.initiated_at ?? now } : {}),
      ...(patch.state === "PAYMENT_VERIFIED" || patch.state === "CONFIRMED"
        ? { verified_at: now }
        : {}),
      ...(patch.source ? { last_source: patch.source } : {}),
      ...(patch.note ? { last_note: patch.note } : {})
    }
  };
}

function paymentEventToLifecycleState(status: string): PaymentLifecycleState {
  switch (status) {
    case "requires_payment":
      return "PAYMENT_INITIATED";
    case "processing":
      return "PAYMENT_PROCESSING";
    case "succeeded":
      return "PAYMENT_VERIFIED";
    case "failed":
      return "FAILED";
    case "refunded":
      return "REFUNDED";
    default:
      return "PENDING";
  }
}
