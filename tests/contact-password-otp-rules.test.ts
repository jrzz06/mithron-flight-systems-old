import { describe, expect, it } from "vitest";
import {
  composeE164,
  isValidCustomerEmail,
  splitE164ToCountry,
  validateCustomerEmail,
  validatePhoneWithCountry
} from "@/lib/api/customer-contact";
import {
  PASSWORD_RULES_HINT,
  validateSignupPassword
} from "@/lib/auth/signup-validation";
import { isAuthEmailDeliveryConfigured } from "@/lib/auth/email-delivery-ready";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("contact email rules", () => {
  it("accepts normal emails and rejects invalid shapes", () => {
    expect(validateCustomerEmail("Name@Company.com").ok).toBe(true);
    expect(isValidCustomerEmail("bad@@example.com")).toBe(false);
    expect(isValidCustomerEmail("no spaces@x.com")).toBe(false);
    expect(validateCustomerEmail("bad").error).toMatch(/name@company.com/i);
  });
});

describe("phone country rules", () => {
  it("composes E.164 and enforces national length per country", () => {
    expect(composeE164("91", "9876543210")).toBe("+919876543210");
    expect(validatePhoneWithCountry("IN", "9876543210").ok).toBe(true);
    expect(validatePhoneWithCountry("IN", "98765").ok).toBe(false);
    expect(validatePhoneWithCountry("SG", "81234567").ok).toBe(true);
    expect(validatePhoneWithCountry("SG", "812345678").ok).toBe(false);
  });

  it("splits known E.164 back to country + national", () => {
    expect(splitE164ToCountry("+919876543210")).toEqual({
      countryCode: "IN",
      national: "9876543210"
    });
  });
});

describe("password rules", () => {
  it("requires length, letter, digit, and confirm match", () => {
    expect(validateSignupPassword("short1", "short1").ok).toBe(false);
    expect(validateSignupPassword("password", "password").ok).toBe(false);
    expect(validateSignupPassword("password1", "password2").ok).toBe(false);
    expect(validateSignupPassword("password1", "password1").ok).toBe(true);
    expect(PASSWORD_RULES_HINT).toMatch(/letter and a number/i);
  });
});

describe("honest OTP delivery wiring", () => {
  it("refuses signup and send-otp when email delivery is not configured", () => {
    expect(isAuthEmailDeliveryConfigured({
      AUTH_HOOK_SEND_EMAIL_SECRET: "",
      RESEND_API_KEY: ""
    })).toBe(false);

    expect(isAuthEmailDeliveryConfigured({
      AUTH_HOOK_SEND_EMAIL_SECRET: "v1,whsec_test",
      RESEND_API_KEY: "re_test"
    })).toBe(true);

    const signup = readFileSync(join(process.cwd(), "app/api/auth/signup/route.ts"), "utf8");
    const sendOtp = readFileSync(join(process.cwd(), "app/api/auth/send-otp/route.ts"), "utf8");
    expect(signup).toContain("isAuthEmailDeliveryConfigured");
    expect(signup).toContain("authEmailDeliveryUnavailableResponse");
    expect(sendOtp).toContain("isAuthEmailDeliveryConfigured");
    expect(sendOtp).toContain("status: 503");
  });

  it("wires country phone picker and password hint on signup/complete-profile", () => {
    const login = readFileSync(join(process.cwd(), "app/login/login-form.tsx"), "utf8");
    const complete = readFileSync(
      join(process.cwd(), "app/(storefront)/account/complete-profile/complete-profile-form.tsx"),
      "utf8"
    );
    const checkout = readFileSync(
      join(process.cwd(), "app/(storefront)/checkout/checkout-page-client.tsx"),
      "utf8"
    );

    expect(login).toContain("PhoneCountryField");
    expect(login).toContain("PASSWORD_RULES_HINT");
    expect(login).toContain("Codes are sent by email only");
    expect(complete).toContain("PhoneCountryField");
    expect(checkout).toContain("PhoneCountryField");
  });
});
