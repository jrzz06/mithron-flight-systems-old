import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildRazorpayCheckoutClientConfig,
  buildRazorpayCheckoutDisplayConfig,
  loadRazorpayCheckoutScript,
  logRazorpayClientEvent,
  normalizeRazorpayContact,
  resetRazorpayCheckoutScriptLoaderForTests
} from "@/lib/payments/razorpay-checkout";

describe("razorpay checkout helpers", () => {
  beforeEach(() => {
    resetRazorpayCheckoutScriptLoaderForTests();
    document.head.innerHTML = "";
    delete (window as { Razorpay?: unknown }).Razorpay;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetRazorpayCheckoutScriptLoaderForTests();
  });

  it("builds UPI-first display config with default blocks enabled", () => {
    const config = buildRazorpayCheckoutDisplayConfig();
    expect(config.display.blocks.upi).toEqual({
      name: "Pay via UPI",
      instruments: [{ method: "upi" }]
    });
    expect(config.display.sequence).toEqual(["block.upi"]);
    expect(config.display.preferences.show_default_blocks).toBe(true);
  });

  it("skips runtime display config when dashboard config is enabled", () => {
    expect(buildRazorpayCheckoutClientConfig(true)).toBeUndefined();
    expect(buildRazorpayCheckoutClientConfig(false)).toEqual(buildRazorpayCheckoutDisplayConfig());
  });

  it("normalizes Indian phone numbers to +91 E.164", () => {
    expect(normalizeRazorpayContact("+91 98765 43210")).toBe("+919876543210");
    expect(normalizeRazorpayContact("09876543210")).toBe("+919876543210");
    expect(normalizeRazorpayContact("919876543210")).toBe("+919876543210");
    expect(normalizeRazorpayContact("87654321")).toBe("+87654321");
  });

  it("logs client events without secrets", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    logRazorpayClientEvent("checkout_init", {
      orderId: "order-1",
      razorpaySignature: "hidden"
    });
    expect(infoSpy).toHaveBeenCalledWith(
      "[razorpay-checkout]",
      expect.objectContaining({ event: "checkout_init", orderId: "order-1" })
    );
    const payload = infoSpy.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("razorpaySignature");
  });

  it("returns the same script load promise for concurrent calls", async () => {
    const first = loadRazorpayCheckoutScript();
    const second = loadRazorpayCheckoutScript();
    expect(first).toBe(second);

    const script = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    expect(script).not.toBeNull();

    (window as { Razorpay?: unknown }).Razorpay = class {};
    script?.dispatchEvent(new Event("load"));

    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
  });

  it("resolves immediately when Razorpay is already on window", async () => {
    (window as { Razorpay?: unknown }).Razorpay = class {};
    await expect(loadRazorpayCheckoutScript()).resolves.toBe(true);
    expect(document.querySelectorAll('script[src="https://checkout.razorpay.com/v1/checkout.js"]').length).toBe(0);
  });
});
