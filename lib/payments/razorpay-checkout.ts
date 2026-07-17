const RAZORPAY_CHECKOUT_SCRIPT_URL = "https://checkout.razorpay.com/v1/checkout.js";

type RazorpayLogContext = Record<string, string | number | boolean | null | undefined>;

let scriptLoadPromise: Promise<boolean> | null = null;

function sanitizeLogContext(context: RazorpayLogContext) {
  const safe: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(context)) {
    if (value === undefined) continue;
    const lower = key.toLowerCase();
    if (lower.includes("secret") || lower.includes("signature") || lower.includes("token")) {
      continue;
    }
    safe[key] = value;
  }
  return safe;
}

export function logRazorpayClientEvent(
  event: string,
  context: RazorpayLogContext = {},
  level: "info" | "warn" | "error" = "info"
) {
  const payload = { event, ...sanitizeLogContext(context) };
  if (level === "error") {
    console.error("[razorpay-checkout]", payload);
    return;
  }
  if (level === "warn") {
    console.warn("[razorpay-checkout]", payload);
    return;
  }
  console.info("[razorpay-checkout]", payload);
}

/** Normalize phone for Razorpay prefill — Indian numbers as +91XXXXXXXXXX. */
export function normalizeRazorpayContact(phone: string) {
  const digits = phone.replace(/[\s\-().+]/g, "");
  if (!digits) return "";

  if (digits.length >= 12 && digits.startsWith("91")) {
    return `+91${digits.slice(-10)}`;
  }

  const local = digits.length >= 10 ? digits.slice(-10) : digits;
  if (local.length === 10) {
    return `+91${local}`;
  }

  return local.startsWith("+") ? local : `+${local}`;
}

export function buildRazorpayCheckoutDisplayConfig() {
  return {
    display: {
      blocks: {
        upi: {
          name: "Pay via UPI",
          instruments: [{ method: "upi" }]
        }
      },
      sequence: ["block.upi"],
      preferences: { show_default_blocks: true }
    }
  };
}

/** Skip runtime display config when a dashboard checkout_config_id is set on the order. */
export function buildRazorpayCheckoutClientConfig(useDashboardConfig: boolean) {
  if (useDashboardConfig) return undefined;
  return buildRazorpayCheckoutDisplayConfig();
}

export function isRazorpayQrEligibleViewport() {
  if (typeof window === "undefined") return false;
  return window.innerWidth >= 485;
}

export function loadRazorpayCheckoutScript() {
  if (typeof window === "undefined") {
    return Promise.resolve(false);
  }

  if (window.Razorpay) {
    return Promise.resolve(true);
  }

  if (scriptLoadPromise) {
    return scriptLoadPromise;
  }

  const startedAt = Date.now();
  scriptLoadPromise = new Promise<boolean>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${RAZORPAY_CHECKOUT_SCRIPT_URL}"]`
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(Boolean(window.Razorpay)), { once: true });
      existing.addEventListener("error", () => {
        scriptLoadPromise = null;
        resolve(false);
      }, { once: true });
      if (window.Razorpay) {
        resolve(true);
      }
      return;
    }

    const script = document.createElement("script");
    script.src = RAZORPAY_CHECKOUT_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      const loaded = Boolean(window.Razorpay);
      logRazorpayClientEvent("script_loaded", {
        loaded,
        durationMs: Date.now() - startedAt
      }, loaded ? "info" : "error");
      resolve(loaded);
    };
    script.onerror = () => {
      scriptLoadPromise = null;
      logRazorpayClientEvent("script_load_failed", { durationMs: Date.now() - startedAt }, "error");
      resolve(false);
    };
    document.head.appendChild(script);
  });

  return scriptLoadPromise;
}

/** Reset script loader state — for tests only. */
export function resetRazorpayCheckoutScriptLoaderForTests() {
  scriptLoadPromise = null;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, handler: (response: Record<string, unknown>) => void) => void;
    };
  }
}
