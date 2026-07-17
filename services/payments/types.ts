export type PaymentProviderId = "razorpay" | "cashfree" | "stripe" | "stub";

export type CreateIntentInput = {
  orderId: string;
  amount: number;
  currency: string;
  customerEmail: string;
  customerPhone?: string;
  metadata?: Record<string, string>;
};

export type PaymentIntentResult = {
  intentId: string;
  clientSecret?: string;
  providerOrderId?: string;
  checkoutUrl?: string;
  paymentSessionId?: string;
  amountPaise?: number;
};

export type PaymentEvent = {
  provider: PaymentProviderId;
  intentId: string;
  paymentId?: string;
  status: "requires_payment" | "processing" | "succeeded" | "failed" | "refunded";
  amount: number;
  currency: string;
  raw: unknown;
};

export type RefundResult = {
  refundId: string;
  status: "pending" | "succeeded" | "failed";
};

export type PaymentGateway = {
  id: PaymentProviderId;
  createIntent(input: CreateIntentInput): Promise<PaymentIntentResult>;
  verifyWebhook(payload: unknown, signature: string, rawBody?: string): Promise<PaymentEvent>;
  verifyClientPayment?(input: ClientPaymentVerificationInput): Promise<PaymentEvent>;
  fetchPaymentStatus?(intentId: string): Promise<PaymentEvent>;
  refund(intentId: string, amount?: number): Promise<RefundResult>;
};

export type ClientPaymentVerificationInput = {
  intentId: string;
  paymentId?: string;
  signature?: string;
  orderId?: string;
};

export type CheckoutPaymentResponse = {
  ok: true;
  orderId: string;
  orderNumber: string;
  paymentIntentId: string;
  provider: PaymentProviderId;
  checkoutUrl: string | null;
  clientSecret: string | null;
  paymentSessionId: string | null;
  amount: number;
  currency: string;
  razorpayKeyId: string | null;
  razorpayKeyMode?: "test" | "live" | "unknown" | null;
  razorpayUsesDashboardConfig?: boolean;
  cashfreeMode: "sandbox" | "production" | null;
  amountPaise?: number | null;
};
