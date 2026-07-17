import { createCashfreeGateway } from "./cashfree";
import { logPaymentEvent } from "./logger";
import { reconcileRazorpayOrderPayment } from "./razorpay-payment-resolution";
import type { PaymentEvent, PaymentProviderId } from "./types";

export type ReconcileGatewayPaymentInput = {
  provider: PaymentProviderId;
  intentId: string;
  expectedAmountInr?: number;
  expectedCurrency?: string;
  /** @deprecated Prefer one attempt + follow-up job. Kept for callers that still pass it. */
  maxAttempts?: number;
  delayMs?: number;
  /** When true, skip scheduling another follow-up (prevents amplify loops). */
  isFollowUp?: boolean;
};

const FOLLOW_UP_DELAY_MS = 2_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run at most one gateway poll per invocation. Pending results can be retried by a
 * follow-up job (cron, status poll, or scheduleGatewayReconcileFollowUp) rather than
 * blocking the request on synchronous 10–15× sleep loops.
 */
export async function reconcilePaymentWithGateway(
  input: ReconcileGatewayPaymentInput,
  env: Record<string, string | undefined> = process.env
): Promise<PaymentEvent | null> {
  const intentId = input.intentId.trim();
  if (!intentId) return null;

  // Force a single attempt per invocation; extra attempts belong in follow-up jobs.
  const maxAttempts = 1;
  void input.maxAttempts;
  void input.delayMs;

  if (input.provider === "razorpay") {
    return reconcileRazorpayOrderPayment(intentId, env, {
      expectedAmountInr: input.expectedAmountInr,
      expectedCurrency: input.expectedCurrency,
      maxAttempts
    });
  }

  if (input.provider === "cashfree") {
    const gateway = createCashfreeGateway(env);
    const event = await gateway.fetchPaymentStatus(intentId);

    if (event.status === "succeeded" || event.status === "failed" || event.status === "refunded") {
      logPaymentEvent("cashfree_reconcile_resolved", {
        intentId,
        status: event.status,
        attempt: 0
      });
    }

    return event;
  }

  return null;
}

/**
 * Schedule one deferred reconcile attempt after the current request/cron finishes.
 * Safe to call from Route Handlers / Server Actions (uses next/server `after` when available).
 */
export function scheduleGatewayReconcileFollowUp(
  input: Omit<ReconcileGatewayPaymentInput, "maxAttempts">,
  env: Record<string, string | undefined> = process.env
) {
  if (input.isFollowUp) return;

  const run = async () => {
    try {
      await sleep(FOLLOW_UP_DELAY_MS);
      const event = await reconcilePaymentWithGateway({ ...input, isFollowUp: true, maxAttempts: 1 }, env);
      logPaymentEvent("gateway_reconcile_follow_up", {
        provider: input.provider,
        intentId: input.intentId,
        status: event?.status ?? null
      });
    } catch (error) {
      logPaymentEvent("gateway_reconcile_follow_up_failed", {
        provider: input.provider,
        intentId: input.intentId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };

  try {
    // Dynamic import keeps this module usable from non-Next contexts (tests/tools).
    void import("next/server").then((mod) => {
      if (typeof mod.after === "function") {
        mod.after(run);
        return;
      }
      void run();
    }).catch(() => {
      void run();
    });
  } catch {
    void run();
  }
}

export function hasSuccessfulGatewayPayment(event: PaymentEvent | null | undefined) {
  return event?.status === "succeeded";
}

export function isPendingGatewayPayment(event: PaymentEvent | null | undefined) {
  return event?.status === "requires_payment" || event?.status === "processing";
}
