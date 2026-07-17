import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy, buildPaymentContentSecurityPolicy } from "@/lib/csp";

describe("CSP headers", () => {
  it("generates URL-safe CSP nonces without slash or plus", async () => {
    const { generateCspNonce } = await import("@/lib/csp");
    for (let i = 0; i < 20; i += 1) {
      const nonce = generateCspNonce();
      expect(nonce).not.toMatch(/[+/]/);
      expect(nonce).toMatch(/^[A-Za-z0-9_-]+={0,2}$/);
    }
  });

  it("configures enforcing CSP via proxy nonce and HSTS in next.config", () => {
    const config = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
    const proxy = readFileSync(join(process.cwd(), "proxy.ts"), "utf8");
    const policy = buildContentSecurityPolicy("test-nonce");

    expect(config).not.toContain("Content-Security-Policy-Report-Only");
    expect(config).not.toContain("script-src");
    expect(config).toContain("Strict-Transport-Security");
    expect(proxy).toContain("buildContentSecurityPolicyForPath");
    expect(proxy).toContain("generateCspNonce");
    expect(policy).toContain("checkout.razorpay.com");
    expect(policy).toContain("cdn.razorpay.com");
    expect(policy).toContain("lumberjack.razorpay.com");
    expect(policy).toContain("https://*.razorpay.com");
    expect(policy).toContain("https://*.cashfree.com");
    expect(policy).toContain("/api/csp-report");
    expect(policy).toContain("script-src 'self' 'nonce-test-nonce'");
    expect(policy).toContain("frame-src 'self'");
    expect(policy).not.toContain("script-src 'self' 'unsafe-inline'");

    const paymentPolicyFrame = buildPaymentContentSecurityPolicy("test-nonce", { NODE_ENV: "production" });
    expect(paymentPolicyFrame).toContain("frame-src 'self'");

    const devPolicy = buildContentSecurityPolicy("test-nonce", { NODE_ENV: "development" });
    expect(devPolicy).toContain("'unsafe-eval'");
    const prodPolicy = buildContentSecurityPolicy("test-nonce", { NODE_ENV: "production" });
    expect(prodPolicy).not.toContain("'unsafe-eval'");
    expect(prodPolicy).not.toContain("img-src 'self' data: https: blob:");
    expect(prodPolicy).toContain("img-src 'self' data: blob:");
  });

  it("uses a payment-surface CSP that allows gateway inline scripts and QR assets", () => {
    const paymentPolicy = buildPaymentContentSecurityPolicy("test-nonce", { NODE_ENV: "production" });
    expect(paymentPolicy).toContain("script-src 'self' 'unsafe-inline'");
    expect(paymentPolicy).toContain("style-src 'self' 'unsafe-inline'");
    expect(paymentPolicy).toContain("font-src 'self' data:");
    expect(paymentPolicy).toContain("connect-src 'self' https:");
    expect(paymentPolicy).toContain("img-src 'self' data: blob: https:");
    expect(paymentPolicy).toContain("worker-src 'self' blob:");
    expect(paymentPolicy).toContain("media-src 'self' blob: data:");
    expect(paymentPolicy).toContain("checkout.razorpay.com");
    expect(paymentPolicy).not.toContain("'nonce-test-nonce'");
  });
});
