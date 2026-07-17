import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("login auth gateway UX", () => {
  it("uses production sign-in language on the login page", () => {
    const page = source("app/login/page.tsx");

    expect(page).toContain("Log in to Mithron");
    expect(page).toContain("LoginHeroBackground");
    expect(page).toContain("MithronBrandMark");
    expect(page).not.toContain("Firebase");
    expect(page).not.toContain("Supabase");
    expect(page).not.toContain("Hybrid sign-in");
    expect(page).not.toContain("Guests use Google");
    expect(page).not.toContain("Team access");
    expect(page).not.toContain("Authorized");
    expect(page).not.toContain("trustGrid");
  });

  it("renders the interactive login form without a non-interactive loading skeleton", () => {
    const page = source("app/login/page.tsx");
    const client = source("app/login/login-form-client.tsx");
    const form = source("app/login/login-form.tsx");

    expect(page).toContain("LoginFormClient");
    expect(page).toContain("getAuthProviderAvailability");
    expect(page).toContain("MithronBrandMark");
    expect(client).toContain("providers");
    expect(form).toContain('type="email"');
    expect(form).toContain('"password"');
    expect(form).toContain("methodDivider");
    expect(form).toContain("passwordToggle");
  });

  it("keeps the role-aware authentication contract", () => {
    const form = source("app/login/login-form.tsx");
    const loginRoute = source("app/api/auth/login/route.ts");
    const callbackRoute = source("app/auth/callback/route.ts");

    expect(form).toContain("signInWithOAuth");
    expect(form).not.toContain("signInAnonymously");
    expect(form).not.toContain("Firebase quick sign-in");
    expect(form).not.toContain("powered by Firebase");
    expect(form).not.toContain("stored in Supabase");
    expect(form).not.toContain("not configured");
    expect(form).toContain("Continue With Google");
    expect(form).not.toContain("Continue with Phone");
    expect(form).toContain("Log In");
    expect(form).not.toContain("Team access");
    expect(form).not.toContain("Authorized work account");
    expect(form).not.toContain("Shop or browse");
    expect(form).toContain("/auth/callback");
    expect(loginRoute).toContain("mapAuthErrorForClient");
    expect(loginRoute).toContain("resolvePostAuthRedirect");
    expect(loginRoute).toContain("recordLoginFailure");
    expect(callbackRoute).toContain("exchangeCodeForSession");
    expect(callbackRoute).toContain("resolvePostAuthRedirectWithProfileCheck");
    expect(form).toContain("signupStep");
  });

  it("defines production-grade auth card geometry", () => {
    const css = source("app/login/login.module.css");

    expect(css).toContain(".loginRoot");
    expect(css).toContain(".card");
    expect(css).toContain("@media (min-width: 768px) and (max-width: 1023px)");
    expect(css).toContain("@media (max-width: 767px)");
    expect(css).toContain(".authCard");
    expect(css).toContain(".authInput");
    expect(css).toContain("--login-control-h");
    expect(css).toContain("justify-content: flex-end");
    expect(css).toContain(".authSubmit");
    expect(css).toContain(".methodDivider");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("object-fit: cover");
  });
});
