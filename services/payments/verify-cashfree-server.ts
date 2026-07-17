import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { inrAmountsMatch } from "./amount";
import { createCashfreeGateway } from "./cashfree";
import { logPaymentEvent } from "./logger";
import { scheduleGatewayReconcileFollowUp } from "./reconcile-gateway-payment";
import type { PaymentEvent } from "./types";

export type VerifyCashfreeServerInput = {
  internalOrderId: string;
  cashfreeOrderId: string;
  expectedAmountInr: number;
  expectedCurrency: string;
};

/**
 * One gateway status fetch per verify invocation. Pending payments are left for
 * status-poll / expire-pending / follow-up reconcile rather than a 10× sleep loop.
 */
export async function verifyCashfreePaymentOnServer(
  input: VerifyCashfreeServerInput,
  env: Record<string, string | undefined> = process.env
): Promise<PaymentEvent> {
  const intentId = input.cashfreeOrderId.trim();
  if (!intentId) {
    throw new Error("Cashfree order id is required.");
  }

  const gateway = createCashfreeGateway(env);
  const expectedCurrency = input.expectedCurrency.trim().toUpperCase();
  const event = await gateway.fetchPaymentStatus(intentId);

  const eventCurrency = String(event.currency ?? "INR").trim().toUpperCase();
  if (eventCurrency !== expectedCurrency) {
    throw new Error("Payment currency mismatch.");
  }

  if (
    event.amount > 0
    && !inrAmountsMatch(input.expectedAmountInr, event.amount)
    && event.status === "succeeded"
  ) {
    throw new Error("Payment amount mismatch.");
  }

  logPaymentEvent("cashfree_gateway_status_resolved", {
    orderId: input.internalOrderId,
    providerIntentId: intentId,
    gatewayStatus: event.status,
    mappedStatus: event.status,
    attempt: 0
  });

  if (event.status === "processing" || event.status === "requires_payment") {
    scheduleGatewayReconcileFollowUp({
      provider: "cashfree",
      intentId,
      expectedAmountInr: input.expectedAmountInr,
      expectedCurrency
    }, env);
  }

  return event;
}
