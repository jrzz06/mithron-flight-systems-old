/** Razorpay UPI QR sessions expire quickly; reuse stale intents shows "Refresh QR". */
export const STALE_CHECKOUT_PAYMENT_MS = 15 * 60 * 1000;

export function isStaleCheckoutPayment(createdAt: string | Date | null | undefined): boolean {
  if (!createdAt) return true;
  const timestamp = new Date(createdAt).getTime();
  if (!Number.isFinite(timestamp)) return true;
  return Date.now() - timestamp > STALE_CHECKOUT_PAYMENT_MS;
}
