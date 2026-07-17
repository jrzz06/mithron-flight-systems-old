import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  shouldExposeSignInOtpSendError,
  mapOtpSendErrorForClient
} from "@/lib/auth/otp-send-errors";
import { resolveApiRoutePolicy } from "@/lib/auth/access-control";
import { isAuthPublicPath } from "@/lib/auth/access-control";

describe("email verification auth routes", () => {
  it("ships confirm route with verifyOtp handling and invite role resolution", () => {
    const confirmRoute = readFileSync(join(process.cwd(), "app/auth/confirm/route.ts"), "utf8");
    expect(confirmRoute).toContain("verifyOtp");
    expect(confirmRoute).toContain("provisionAuthenticatedUserIfMissing");
    expect(confirmRoute).toContain("resolveInviteRoleForUser");
    expect(confirmRoute).toContain("preferredRole: inviteRole ?? operatorRole ?? \"user\"");
  });

  it("blocks unverified email/password login server-side", () => {
    const loginRoute = readFileSync(join(process.cwd(), "app/api/auth/login/route.ts"), "utf8");
    expect(loginRoute).toContain("email_confirmed_at");
    expect(loginRoute).toContain("verification_pending");
    expect(loginRoute).toContain("signOut");
    expect(loginRoute).toContain("email_not_confirmed");
  });

  it("ships resend and change-email APIs with role rejection", () => {
    const resendRoute = readFileSync(join(process.cwd(), "app/api/auth/resend-verification/route.ts"), "utf8");
    const changeEmailRoute = readFileSync(join(process.cwd(), "app/api/auth/change-email/route.ts"), "utf8");

    expect(resendRoute).toContain('type: "signup"');
    expect(resendRoute).toContain("rejectClientSuppliedRole");
    expect(changeEmailRoute).toContain("findAuthUserByEmail");
    expect(changeEmailRoute).toContain("rejectClientSuppliedRole");
  });

  it("allows auth confirm path through public auth routing", () => {
    expect(isAuthPublicPath("/auth/confirm")).toBe(true);
  });

  it("bypasses proxy session mutation for auth confirm", () => {
    const proxy = readFileSync(join(process.cwd(), "proxy.ts"), "utf8");
    expect(proxy).toContain('pathname === "/auth/confirm"');
  });

  it("exposes verification and OTP auth APIs as public routes", () => {
    expect(resolveApiRoutePolicy("/api/auth/resend-verification")).toEqual({ kind: "public" });
    expect(resolveApiRoutePolicy("/api/auth/change-email")).toEqual({ kind: "public" });
    expect(resolveApiRoutePolicy("/api/auth/send-otp")).toEqual({ kind: "public" });
    expect(resolveApiRoutePolicy("/api/auth/verify-otp")).toEqual({ kind: "public" });
    expect(resolveApiRoutePolicy("/api/auth/hooks/send-email")).toEqual({ kind: "public" });
  });

  it("ships send-email hook route with signature verification and provider fallback", () => {
    const hookRoute = readFileSync(join(process.cwd(), "app/api/auth/hooks/send-email/route.ts"), "utf8");
    expect(hookRoute).toContain("verifySupabaseSendEmailHook");
    expect(hookRoute).toContain("sendEmailWithFallback");
    expect(hookRoute).toContain("checkDistributedRateLimit");
  });

  it("ships OTP verify route with verifyOtp and provisioning", () => {
    const verifyOtpRoute = readFileSync(join(process.cwd(), "app/api/auth/verify-otp/route.ts"), "utf8");
    expect(verifyOtpRoute).toContain("verifyOtp");
    expect(verifyOtpRoute).toContain("provisionAuthenticatedUserIfMissing");
  });

  it("ships send-otp route for signin and signup purposes with honest signup errors", () => {
    const sendOtpRoute = readFileSync(join(process.cwd(), "app/api/auth/send-otp/route.ts"), "utf8");
    expect(sendOtpRoute).toContain("signInWithOtp");
    expect(sendOtpRoute).toContain('"signup"');
    expect(sendOtpRoute).toContain("shouldExposeSignInOtpSendError");
    expect(sendOtpRoute).toContain("mapOtpSendErrorForClient");
  });

  it("classifies sign-in OTP send failures without account enumeration", () => {
    expect(shouldExposeSignInOtpSendError({ message: "User not found" })).toBe(false);
    expect(shouldExposeSignInOtpSendError({ message: "Error sending confirmation email" })).toBe(true);
    expect(mapOtpSendErrorForClient({ message: "over_email_send_rate_limit" })).toMatch(/too many/i);
  });
});
