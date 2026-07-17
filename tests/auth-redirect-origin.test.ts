import { describe, expect, it } from "vitest";
import {
  buildAuthCallbackUrl,
  buildPasswordResetUrl,
  resolveAuthRedirectUrlFromRequest,
  resolveRequestOrigin
} from "@/lib/auth/request-origin";
import { resolveClientAuthRedirectPath } from "@/lib/auth/redirects";
import {
  CANONICAL_PRODUCTION_ORIGIN,
  getSiteOrigin,
  hasConfiguredSiteUrl,
  isObsoleteAppHost,
  resolveClientAuthOrigin,
  sanitizeAppOrigin,
  VERCEL_PRODUCTION_ORIGIN
} from "@/lib/site-url";

const CANONICAL_ORIGIN = CANONICAL_PRODUCTION_ORIGIN;
const VERCEL_ORIGIN = VERCEL_PRODUCTION_ORIGIN;
const OBSOLETE_HOST = "mithron-flight-systems-kbkbkh.vercel.app";

const productionEnv = {
  VERCEL_ENV: "production",
  MITHRON_PRODUCTION_HOST: CANONICAL_ORIGIN
} as const;

describe("auth redirect origin resolution", () => {
  it("rejects obsolete deployment hosts", () => {
    expect(isObsoleteAppHost(OBSOLETE_HOST)).toBe(true);
    expect(isObsoleteAppHost("mithron-flight-systems-dgoh44xh9-kbkbkh.vercel.app")).toBe(true);
    expect(isObsoleteAppHost("mithron-flight-systems-ngibpl3c0-kbkbkh.vercel.app")).toBe(true);
    expect(isObsoleteAppHost("final-mithron-deploy.vercel.app")).toBe(false);
    expect(isObsoleteAppHost("www.mithron.co")).toBe(false);
    expect(sanitizeAppOrigin(`https://${OBSOLETE_HOST}`)).toBeNull();
    expect(
      getSiteOrigin({
        ...productionEnv,
        NEXT_PUBLIC_SITE_URL: `https://${OBSOLETE_HOST}`
      })
    ).toBe(CANONICAL_ORIGIN);
  });

  it("always resolves production site origin to the canonical host", () => {
    expect(
      getSiteOrigin({
        ...productionEnv,
        VERCEL_URL: "mithron-flight-systems-ngibpl3c0-kbkbkh.vercel.app",
        NEXT_PUBLIC_SITE_URL: `https://${OBSOLETE_HOST}`
      })
    ).toBe(CANONICAL_ORIGIN);
  });

  it("prefers MITHRON_PRODUCTION_HOST over stale env values", () => {
    expect(
      getSiteOrigin({
        VERCEL_ENV: "production",
        MITHRON_PRODUCTION_HOST: CANONICAL_ORIGIN,
        NEXT_PUBLIC_SITE_URL: `https://${OBSOLETE_HOST}`
      })
    ).toBe(CANONICAL_ORIGIN);
  });

  it("falls back to the canonical production origin when production env values are stale", () => {
    expect(
      getSiteOrigin({
        VERCEL_ENV: "production",
        NEXT_PUBLIC_SITE_URL: `https://${OBSOLETE_HOST}`
      })
    ).toBe(CANONICAL_ORIGIN);
  });

  it("resolves auth callback URLs from the incoming request origin", () => {
    const request = new Request(`${VERCEL_ORIGIN}/login`, {
      headers: {
        host: "final-mithron-deploy.vercel.app",
        "x-forwarded-host": "final-mithron-deploy.vercel.app",
        "x-forwarded-proto": "https"
      }
    });

    expect(resolveRequestOrigin(request)).toBe(VERCEL_ORIGIN);
    expect(buildAuthCallbackUrl(resolveRequestOrigin(request), "/warehouse")).toBe(
      `${VERCEL_ORIGIN}/auth/callback?next=%2Fwarehouse`
    );
    expect(buildPasswordResetUrl(resolveRequestOrigin(request))).toBe(
      `${VERCEL_ORIGIN}/reset-password`
    );
  });

  it("falls back to request origin when client redirect targets an obsolete host", () => {
    const request = new Request(`${VERCEL_ORIGIN}/api/auth/signup`, {
      headers: {
        host: "final-mithron-deploy.vercel.app",
        "x-forwarded-proto": "https"
      }
    });

    expect(
      resolveAuthRedirectUrlFromRequest(request, {
        clientRedirectTo: `https://${OBSOLETE_HOST}/auth/callback?next=/onboarding`,
        defaultPath: "/auth/callback",
        defaultNext: "/onboarding"
      })
    ).toBe(`${VERCEL_ORIGIN}/auth/callback?next=%2Fonboarding`);
  });

  it("only allows relative client redirects after login", () => {
    expect(resolveClientAuthRedirectPath("/warehouse")).toBe("/warehouse");
    expect(resolveClientAuthRedirectPath(`${CANONICAL_ORIGIN}/admin`)).toBe("/account");
    expect(resolveClientAuthRedirectPath("//evil.example/admin")).toBe("/account");
  });

  it("accepts Vercel deployment URLs as configured site URLs", () => {
    expect(
      hasConfiguredSiteUrl({
        VERCEL_PROJECT_PRODUCTION_URL: "final-mithron-deploy.vercel.app"
      })
    ).toBe(true);
  });

  it("prefers NEXT_PUBLIC_SITE_URL for client auth redirects", () => {
    expect(
      resolveClientAuthOrigin({
        NEXT_PUBLIC_SITE_URL: CANONICAL_ORIGIN
      })
    ).toBe(CANONICAL_ORIGIN);
  });
});
