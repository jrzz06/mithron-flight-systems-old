import { describe, expect, it } from "vitest";
import { isInternetDeployedEnvironment, isLocalStubPaymentAllowed } from "@/lib/auth/deploy-environment";
import { assertValidCmsHref, sanitizePublicCmsHref } from "@/lib/cms/safe-href";
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

  it("blocks dangerous CMS href schemes", () => {
    expect(() => assertValidCmsHref("javascript:alert(1)", "Navigation")).toThrow(/blocked URL scheme/i);
    expect(() => assertValidCmsHref("//evil.example/phish", "Navigation")).toThrow(/protocol-relative/i);
    expect(assertValidCmsHref("/category/video-drones", "Navigation")).toBe("/category/video-drones");
    expect(assertValidCmsHref("https://final-mithron-deploy.vercel.app/about", "Navigation"))
      .toBe("https://final-mithron-deploy.vercel.app/about");
    expect(sanitizePublicCmsHref("javascript:alert(1)", "/")).toBe("/");
  });

  it("adds baseline CSP hardening directives", () => {
    const policy = buildContentSecurityPolicy("test-nonce");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("form-action 'self'");
  });
});
