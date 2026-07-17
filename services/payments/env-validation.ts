import { cashfreeApiBase, cashfreeCheckoutMode, isCashfreeConfigured, isRazorpayConfigured, type EnvSource } from "./config";
import { razorpayKeyMode } from "./razorpay-payment-resolution";

export type PaymentEnvIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
};

function pushIssue(
  issues: PaymentEnvIssue[],
  severity: PaymentEnvIssue["severity"],
  code: string,
  message: string
) {
  issues.push({ severity, code, message });
}

export function collectPaymentEnvironmentIssues(env: EnvSource = process.env): PaymentEnvIssue[] {
  const issues: PaymentEnvIssue[] = [];
  const isProduction = env.NODE_ENV === "production";
  const allowLiveInDev = env.PAYMENT_ALLOW_LIVE_IN_DEV?.trim().toLowerCase() === "true";

  if (isRazorpayConfigured(env)) {
    const keyId = env.RAZORPAY_KEY_ID?.trim() ?? "";
    const keySecret = env.RAZORPAY_KEY_SECRET?.trim() ?? "";
    const mode = razorpayKeyMode(keyId);

    if (!env.RAZORPAY_WEBHOOK_SECRET?.trim()) {
      pushIssue(
        issues,
        "error",
        "razorpay_webhook_secret_missing",
        "RAZORPAY_WEBHOOK_SECRET is missing. Webhooks will fail signature verification and UPI QR payments may not mark orders paid when the checkout modal is closed."
      );
    }

    if (keySecret.startsWith("rzp_")) {
      pushIssue(
        issues,
        "error",
        "razorpay_secret_looks_like_key_id",
        "RAZORPAY_KEY_SECRET looks like a Key ID (starts with rzp_). Key ID and Key Secret are likely swapped."
      );
    }

    if (isProduction && mode === "test") {
      pushIssue(
        issues,
        "error",
        "razorpay_test_keys_in_production",
        "RAZORPAY_KEY_ID uses rzp_test_ prefix but NODE_ENV=production. Use live keys or deploy to a non-production environment."
      );
    }

    if (!isProduction && mode === "live" && !allowLiveInDev) {
      pushIssue(
        issues,
        "error",
        "razorpay_live_keys_in_development",
        "RAZORPAY_KEY_ID uses rzp_live_ prefix in local development. Use rzp_test_ keys for sandbox, or set PAYMENT_ALLOW_LIVE_IN_DEV=true if you intentionally accept live charges locally."
      );
    }

    if (mode === "unknown") {
      pushIssue(
        issues,
        "warning",
        "razorpay_key_mode_unknown",
        "RAZORPAY_KEY_ID does not start with rzp_test_ or rzp_live_. Confirm the value copied from the Razorpay dashboard."
      );
    }
  }

  if (isCashfreeConfigured(env)) {
    const appId = env.CASHFREE_APP_ID?.trim() ?? "";
    const secretKey = env.CASHFREE_SECRET_KEY?.trim() ?? "";
    const cashfreeEnv = cashfreeCheckoutMode(env);
    const apiBase = cashfreeApiBase(env);

    if (!env.CASHFREE_WEBHOOK_SECRET?.trim()) {
      pushIssue(
        issues,
        "error",
        "cashfree_webhook_secret_missing",
        "CASHFREE_WEBHOOK_SECRET is missing. Cashfree server webhooks will be rejected."
      );
    }

    if (secretKey === appId) {
      pushIssue(
        issues,
        "error",
        "cashfree_credentials_duplicated",
        "CASHFREE_SECRET_KEY matches CASHFREE_APP_ID. App ID and secret key are likely swapped or mis-copied."
      );
    }

    if (isProduction && cashfreeEnv === "sandbox") {
      pushIssue(
        issues,
        "error",
        "cashfree_sandbox_in_production",
        "CASHFREE_ENV=sandbox while NODE_ENV=production. Set CASHFREE_ENV=production with production credentials."
      );
    }

    if (!isProduction && cashfreeEnv === "production" && !allowLiveInDev) {
      pushIssue(
        issues,
        "warning",
        "cashfree_production_in_development",
        `CASHFREE_ENV=production in local development (API base: ${apiBase}). Use CASHFREE_ENV=sandbox for sandbox credentials, or set PAYMENT_ALLOW_LIVE_IN_DEV=true.`
      );
    }
  }

  return issues;
}

export function assertPaymentEnvironment(env: EnvSource = process.env) {
  const issues = collectPaymentEnvironmentIssues(env);
  const errors = issues.filter((issue) => issue.severity === "error");
  if (!errors.length) return;

  throw new Error(
    `Payment environment misconfigured:\n${errors.map((issue) => `- ${issue.message}`).join("\n")}`
  );
}

export function logPaymentEnvironmentWarnings(env: EnvSource = process.env) {
  for (const issue of collectPaymentEnvironmentIssues(env)) {
    if (issue.severity !== "warning") continue;
    console.warn(`[payments] ${issue.code}: ${issue.message}`);
  }
}
