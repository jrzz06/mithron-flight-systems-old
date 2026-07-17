import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildProfileCompletionRedirect,
  isProfileIdentityComplete,
  isProfileCompletionExemptPath
} from "@/lib/auth/profile-identity";

describe("profile identity completeness", () => {
  it("requires a valid name and phone", () => {
    expect(isProfileIdentityComplete({
      full_name: "Mithron User",
      phone: "+918939123421"
    })).toBe(true);

    expect(isProfileIdentityComplete({
      display_name: "Mithron User",
      phone: null
    })).toBe(false);

    expect(isProfileIdentityComplete({
      full_name: "A",
      phone: "+918939123421"
    })).toBe(false);
  });

  it("builds a safe completion redirect", () => {
    expect(buildProfileCompletionRedirect("/account/orders")).toBe(
      "/account/complete-profile?next=%2Faccount%2Forders"
    );
  });

  it("allows completion and auth paths through the gate", () => {
    expect(isProfileCompletionExemptPath("/account/complete-profile")).toBe(true);
    expect(isProfileCompletionExemptPath("/login")).toBe(true);
    expect(isProfileCompletionExemptPath("/auth/logout")).toBe(true);
    expect(isProfileCompletionExemptPath("/api/auth/login")).toBe(true);
    expect(isProfileCompletionExemptPath("/account/orders")).toBe(false);
  });
});

describe("signup route repeated registration handling", () => {
  const signupRoute = readFileSync(join(process.cwd(), "app/api/auth/signup/route.ts"), "utf8");

  it("detects repeated signup and returns already_registered", () => {
    expect(signupRoute).toContain("data.user?.identities");
    expect(signupRoute).toContain("Array.isArray(identities)");
    expect(signupRoute).toContain('code: "already_registered"');
    expect(signupRoute).toContain("status: 409");
  });

  it("validates email format on the server before signUp", () => {
    expect(signupRoute).toContain("validateSignupEmail");
    expect(signupRoute).toContain("normalizeSignupEmail");
  });
});

describe("login form repeated registration handling", () => {
  const loginForm = readFileSync(join(process.cwd(), "app/login/login-form.tsx"), "utf8");

  it("switches to sign in when signup email already exists", () => {
    expect(loginForm).toContain('payload.code === "already_registered"');
    expect(loginForm).toContain('switchMode("signin")');
  });
});

describe("profile completion gate wiring", () => {
  const proxy = readFileSync(join(process.cwd(), "proxy.ts"), "utf8");
  const postAuthRedirect = readFileSync(join(process.cwd(), "lib/auth/post-auth-redirect.ts"), "utf8");

  it("redirects incomplete profiles from middleware", () => {
    expect(proxy).toContain("validateProfileIdentityGate");
    expect(proxy).toContain("redirectToProfileCompletion");
    expect(proxy).toContain("profile_incomplete");
  });

  it("checks profile completeness after auth for customers only", () => {
    expect(postAuthRedirect).toContain("resolvePostAuthRedirectWithProfileCheck");
    expect(postAuthRedirect).toContain("isUserProfileIdentityComplete");
    expect(postAuthRedirect).toContain("isControlPanelRole");
  });
});
