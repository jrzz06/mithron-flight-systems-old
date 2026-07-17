export type PendingRazorpayVerification = {
  orderId: string;
  orderNumber: string;
  provider: "razorpay";
  email: string;
  signedIn: boolean;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  savedAt: number;
};

const STORAGE_KEY = "mithron.pendingPaymentVerification";

export function savePendingPaymentVerification(payload: Omit<PendingRazorpayVerification, "savedAt">) {
  if (typeof window === "undefined") return;
  const record: PendingRazorpayVerification = { ...payload, savedAt: Date.now() };
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(record));
}

export function readPendingPaymentVerification(): PendingRazorpayVerification | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PendingRazorpayVerification;
    if (!parsed?.orderId || !parsed?.razorpayPaymentId || !parsed?.razorpaySignature) return null;
    if (Date.now() - Number(parsed.savedAt ?? 0) > 30 * 60 * 1000) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingPaymentVerification() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(STORAGE_KEY);
}
