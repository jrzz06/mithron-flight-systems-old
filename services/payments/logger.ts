type PaymentLogContext = Record<string, string | number | boolean | null | undefined>;

function sanitize(context: PaymentLogContext) {
  const safe: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(context)) {
    if (value === undefined) continue;
    const lower = key.toLowerCase();
    if (
      lower.includes("secret")
      || lower.includes("signature")
      || lower.includes("token")
      || lower.includes("authorization")
    ) {
      continue;
    }
    safe[key] = value;
  }
  return safe;
}

export function logPaymentEvent(event: string, context: PaymentLogContext = {}) {
  console.info(`[payments] ${event}`, sanitize(context));
}

export function logPaymentWarning(event: string, context: PaymentLogContext = {}) {
  console.warn(`[payments] ${event}`, sanitize(context));
}

export function logPaymentError(event: string, error: unknown, context: PaymentLogContext = {}) {
  console.error(`[payments] ${event}`, {
    ...sanitize(context),
    error: error instanceof Error ? error.message : String(error)
  });
}
