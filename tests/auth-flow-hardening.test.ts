import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("auth callback route", () => {
  it("detects oauth provider from user identities for audit logging", () => {
    const callbackRoute = readFileSync(join(process.cwd(), "app/auth/callback/route.ts"), "utf8");
    expect(callbackRoute).toContain("resolveOAuthProvider");
    expect(callbackRoute).not.toContain('authProvider: "google"');
  });

  it("routes recovery next paths to the reset-password form", () => {
    const callbackRoute = readFileSync(join(process.cwd(), "app/auth/callback/route.ts"), "utf8");
    expect(callbackRoute).toContain("isRecoveryNextPath");
    expect(callbackRoute).toContain('"/reset-password"');
    expect(callbackRoute).toContain("recoveryFlow");
  });
});

describe("invite route unification", () => {
  it("redirects invite acceptance to unified login signup flow", () => {
    const invitePage = readFileSync(join(process.cwd(), "app/invite/[token]/page.tsx"), "utf8");
    expect(invitePage).toContain('redirect(`/login?mode=signup&invite=');
    expect(invitePage).not.toContain("SignupForm");
  });
});

describe("reset password recovery guard", () => {
  it("blocks password updates when recovery session is missing", () => {
    const resetForm = readFileSync(join(process.cwd(), "app/reset-password/reset-password-form.tsx"), "utf8");
    expect(resetForm).toContain("readRecoveryTokensFromHash");
    expect(resetForm).toContain("exchangeCodeForSession");
    expect(resetForm).toContain("setSession");
    expect(resetForm).toContain("/forgot-password");
    expect(resetForm).toContain("mapAuthErrorForClient");
  });

  it("lets recovery PKCE codes stay on /reset-password instead of proxy-stealing to callback", () => {
    const proxy = readFileSync(join(process.cwd(), "proxy.ts"), "utf8");
    expect(proxy).toContain('pathname !== "/reset-password"');
    expect(proxy).toContain('pathname === "/reset-password"');
  });

  it("redirects auth confirm recovery OTP to the reset form", () => {
    const confirmRoute = readFileSync(join(process.cwd(), "app/auth/confirm/route.ts"), "utf8");
    expect(confirmRoute).toContain('type === "recovery"');
    expect(confirmRoute).toContain('"/reset-password"');
  });

  it("pins recovery send-email hook links to /reset-password", () => {
    const hook = readFileSync(join(process.cwd(), "lib/auth/send-email-hook.ts"), "utf8");
    expect(hook).toContain('emailActionType === "recovery"');
    expect(hook).toContain('url.searchParams.set("next", "/reset-password")');
  });
});

describe("login page role resolution", () => {
  it("signs out sessions that have no enterprise role", () => {
    const loginPage = readFileSync(join(process.cwd(), "app/login/page.tsx"), "utf8");
    expect(loginPage).toContain("auth_status=role_required");
    expect(loginPage).toContain("signOut");
    expect(loginPage).not.toContain("resolveGuestPostAuthRedirect");
  });
});
