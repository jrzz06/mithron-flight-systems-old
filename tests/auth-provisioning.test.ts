import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("auth provisioning and google login", () => {
  it("ships auth provisioning service and callback wiring", () => {
    const root = process.cwd();
    expect(existsSync(join(root, "services/auth-provisioning.ts"))).toBe(true);
    expect(readFileSync(join(root, "app/auth/callback/route.ts"), "utf8")).toContain("provisionAuthenticatedUserIfMissing");
  });

  it("routes password login through the server login API and keeps Google OAuth", () => {
    const loginForm = readFileSync(join(process.cwd(), "app/login/login-form.tsx"), "utf8");
    expect(loginForm).toContain('fetch("/api/auth/login"');
    expect(loginForm).not.toContain("signInWithPassword");
    expect(loginForm).toContain("signInWithOAuth");
    expect(loginForm).toContain('provider: "google"');
  });

  it("stores full_name and avatar_url during provisioning", () => {
    const provisioning = readFileSync(join(process.cwd(), "services/auth-provisioning.ts"), "utf8");
    expect(provisioning).toContain("full_name");
    expect(provisioning).toContain("avatar_url");
  });

  it("ships email confirm route for OTP verification", () => {
    expect(existsSync(join(process.cwd(), "app/auth/confirm/route.ts"))).toBe(true);
  });

  it("allows settings.write to write governance activity logs", () => {
    const adminActions = readFileSync(join(process.cwd(), "services/admin-actions.ts"), "utf8");
    expect(adminActions).toContain('"settings.write"');
  });
});
