import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("auth callback route", () => {
  it("detects oauth provider from user identities for audit logging", () => {
    const callbackRoute = readFileSync(join(process.cwd(), "app/auth/callback/route.ts"), "utf8");
    expect(callbackRoute).toContain("resolveOAuthProvider");
    expect(callbackRoute).not.toContain('authProvider: "google"');
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
    expect(resetForm).toContain("setSession");
    expect(resetForm).toContain("/forgot-password");
    expect(resetForm).toContain("mapAuthErrorForClient");
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
