import {
  buildRazorpayCheckoutClientConfig,
  loadRazorpayCheckoutScript,
  logRazorpayClientEvent
} from "@/lib/payments/razorpay-checkout";

let cashfreeScriptPromise: Promise<boolean> | null = null;

export async function ensureRazorpayCheckoutScript() {
  const loaded = await loadRazorpayCheckoutScript();
  logRazorpayClientEvent("script_load_on_payment", { loaded, provider: "razorpay" });
  return loaded;
}

export async function ensureCashfreeCheckoutScript() {
  if (typeof window === "undefined") return false;
  if (window.Cashfree) return true;
  if (cashfreeScriptPromise) return cashfreeScriptPromise;

  cashfreeScriptPromise = new Promise<boolean>((resolve) => {
    const existing = document.querySelector('script[data-cashfree-checkout="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(Boolean(window.Cashfree)), { once: true });
      existing.addEventListener("error", () => resolve(false), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
    script.async = true;
    script.dataset.cashfreeCheckout = "true";
    script.onload = () => resolve(Boolean(window.Cashfree));
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

  return cashfreeScriptPromise;
}

export { buildRazorpayCheckoutClientConfig };
