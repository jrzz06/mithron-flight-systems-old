import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  normalizeSignupEmail,
  rejectClientSuppliedRole,
  validateSignupFullName,
  validateSignupPassword,
  validateSignupPhone
} from "@/lib/auth/signup-validation";

describe("unified auth login form", () => {
  const loginForm = readFileSync(join(process.cwd(), "app/login/login-form.tsx"), "utf8");

  it("supports sign in and create account modes on one page", () => {
    expect(loginForm).toContain('data-testid="auth-mode-signin"');
    expect(loginForm).toContain('data-testid="auth-mode-signup"');
    expect(loginForm).toContain('data-testid="signup-auth-form"');
    expect(loginForm).toContain('data-testid="login-auth-form"');
  });

  it("routes email sign in through the server login API", () => {
    expect(loginForm).toContain('fetch("/api/auth/login"');
    expect(loginForm).not.toContain("signInWithPassword");
    expect(loginForm).not.toContain('/api/auth/provision"');
  });

  it("collects registration fields including required phone", () => {
    expect(loginForm).toContain("Full name");
    expect(loginForm).toContain("Confirm password");
    expect(loginForm).toContain("Phone number");
    expect(loginForm).toContain('fetch("/api/auth/signup"');
  });

  it("shows verification pending actions", () => {
    expect(loginForm).toContain("auth-verification-pending");
    expect(loginForm).toContain("auth-resend-verification");
    expect(loginForm).toContain("auth-change-email");
    expect(loginForm).toContain('fetch("/api/auth/change-email"');
    expect(loginForm).toContain("verification_pending");
  });

  it("does not emit blocked client auth.login audit events", () => {
    expect(loginForm).not.toContain('recordClientAuthEvent("auth.login"');
    expect(loginForm).toContain('recordClientAuthEvent("auth.failed_login"');
  });

  it("supports email OTP verification and passwordless sign-in", () => {
    expect(loginForm).toContain('data-testid="auth-otp-input"');
    expect(loginForm).toContain('data-testid="auth-send-otp"');
    expect(loginForm).toContain('data-testid="auth-verify-otp"');
    expect(loginForm).toContain('data-testid="auth-signin-otp-mode"');
    expect(loginForm).toContain('fetch("/api/auth/send-otp"');
    expect(loginForm).toContain('fetch("/api/auth/verify-otp"');
    expect(loginForm).toContain("Sign in with email code");
  });
});

describe("signup validation helpers", () => {
  it("normalizes email and validates phone", () => {
    expect(normalizeSignupEmail("  User@Example.COM ")).toBe("user@example.com");
    expect(validateSignupPhone("8939123421").ok).toBe(true);
    expect(validateSignupPhone("12").ok).toBe(false);
  });

  it("validates password confirmation and full name", () => {
    expect(validateSignupPassword("password1", "password1").ok).toBe(true);
    expect(validateSignupPassword("password1", "password2").ok).toBe(false);
    expect(validateSignupFullName("A").ok).toBe(false);
    expect(validateSignupFullName("Mithron User").ok).toBe(true);
  });

  it("rejects client-supplied roles", () => {
    expect(rejectClientSuppliedRole({ role: "admin" })).toMatch(/not allowed/i);
    expect(rejectClientSuppliedRole({ email: "a@b.com" })).toBeNull();
  });
});
