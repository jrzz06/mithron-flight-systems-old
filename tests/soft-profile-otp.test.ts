import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("soft complete-profile + OTP email contracts", () => {
  it("uses a welcoming complete-profile shell instead of account admin cards", () => {
    const page = source("app/(storefront)/account/complete-profile/page.tsx");
    const form = source("app/(storefront)/account/complete-profile/complete-profile-form.tsx");
    const css = source("app/(storefront)/account/complete-profile/complete-profile.module.css");

    expect(page).toContain("complete-profile-page");
    expect(page).not.toContain("AccountCard");
    expect(form).toContain("Almost there");
    expect(form).toContain("Continue to Mithron");
    expect(form).toContain("data-phone-only");
    expect(css).toContain("--finish-accent");
  });

  it("keeps signup → send-otp → verify-otp wired for email verification", () => {
    const loginForm = source("app/login/login-form.tsx");
    const sendOtp = source("app/api/auth/send-otp/route.ts");
    const verifyOtp = source("app/api/auth/verify-otp/route.ts");
    const hook = source("app/api/auth/hooks/send-email/route.ts");

    expect(loginForm).toContain('/api/auth/send-otp');
    expect(loginForm).toContain('/api/auth/verify-otp');
    expect(loginForm).toContain('purpose: "signup"');
    expect(sendOtp).toContain("signInWithOtp");
    expect(sendOtp).toContain('type: "signup"');
    expect(verifyOtp).toContain("verifyOtp");
    expect(hook).toContain("mapSendEmailHookToOutbound");
    expect(hook).toContain("sendEmailWithFallback");
  });

  it("fails closed when customer profile identity lookup errors", () => {
    const proxy = source("proxy.ts");
    expect(proxy).toContain("blocking incomplete check");
    expect(proxy).toContain("return { incomplete: true as const };");
  });
});
