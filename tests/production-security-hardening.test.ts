import { describe, expect, it } from "vitest";
import { isInternetDeployedEnvironment, isLocalStubPaymentAllowed } from "@/lib/auth/deploy-environment";
import { safeSecretEquals } from "@/lib/auth/timing-safe-bearer";
import { isPaymentGatewayConfigured } from "@/services/payments/gateway";
import { buildContentSecurityPolicy } from "@/lib/csp";

describe("production security hardening", () => {
  it("treats Vercel and production NODE_ENV as deployed environments", () => {
    expect(isInternetDeployedEnvironment({ NODE_ENV: "development", VERCEL: "1" })).toBe(true);
    expect(isInternetDeployedEnvironment({ NODE_ENV: "production" })).toBe(true);
    expect(isInternetDeployedEnvironment({ NODE_ENV: "development" })).toBe(false);
  });

  it("disables stub payments on deployed environments", () => {
    expect(isLocalStubPaymentAllowed({ PAYMENT_PROVIDER: "stub", VERCEL: "1" })).toBe(false);
    expect(isPaymentGatewayConfigured({ PAYMENT_PROVIDER: "stub", VERCEL: "1" })).toBe(false);
    expect(isLocalStubPaymentAllowed({ PAYMENT_PROVIDER: "stub", NODE_ENV: "development" })).toBe(true);
  });

  it("compares webhook secrets in constant time", () => {
    expect(safeSecretEquals("top-secret", "top-secret")).toBe(true);
    expect(safeSecretEquals("top-secret", "top-secrex")).toBe(false);
    expect(safeSecretEquals("", "top-secret")).toBe(false);
  });

  it("adds baseline CSP hardening directives", () => {
    const policy = buildContentSecurityPolicy("test-nonce");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("form-action 'self'");
  });
});
