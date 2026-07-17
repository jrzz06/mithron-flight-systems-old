import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isValidCustomerEmail,
  isValidCustomerPhone,
  validateCustomerName,
  validateCustomerPhone
} from "@/lib/api/customer-contact";
import {
  validateSignupEmail,
  validateSignupFullName,
  validateSignupPhone
} from "@/lib/auth/signup-validation";
import { isProfileIdentityComplete } from "@/lib/auth/profile-identity";

describe("enquiry-parity contact validators", () => {
  it("accepts the same phones for enquiry helpers and signup/profile helpers", () => {
    const samples = ["9876543210", "+919876543210", "919876543210", "+14155552671"];

    for (const phone of samples) {
      expect(isValidCustomerPhone(phone)).toBe(true);
      expect(validateCustomerPhone(phone).ok).toBe(true);
      expect(validateSignupPhone(phone).ok).toBe(true);
    }

    expect(validateSignupPhone("123").ok).toBe(false);
    expect(isValidCustomerPhone("123")).toBe(false);
  });

  it("accepts the same emails and names", () => {
    expect(isValidCustomerEmail("buyer@example.com")).toBe(true);
    expect(validateSignupEmail("buyer@example.com").ok).toBe(true);
    expect(validateCustomerName("Mithron Buyer").ok).toBe(true);
    expect(validateSignupFullName("Mithron Buyer").ok).toBe(true);
    expect(validateSignupFullName("A").ok).toBe(false);
  });

  it("treats name+phone as profile complete for customers", () => {
    expect(isProfileIdentityComplete({
      full_name: "Mithron User",
      phone: "9876543210"
    })).toBe(true);
  });
});

describe("signup and complete-profile panels", () => {
  const loginForm = readFileSync(join(process.cwd(), "app/login/login-form.tsx"), "utf8");
  const completeForm = readFileSync(
    join(process.cwd(), "app/(storefront)/account/complete-profile/complete-profile-form.tsx"),
    "utf8"
  );
  const proxy = readFileSync(join(process.cwd(), "proxy.ts"), "utf8");

  it("splits create account into name → contact → password steps", () => {
    expect(loginForm).toContain("signupStep");
    expect(loginForm).toContain("advanceSignupStep");
    expect(loginForm).toContain("signup-step-continue");
    expect(loginForm).toContain("Your name");
  });

  it("splits complete-profile into name then phone panels", () => {
    expect(completeForm).toContain("data-profile-step");
    expect(completeForm).toContain("validateCustomerName");
    expect(completeForm).toContain("Phone number");
    expect(completeForm).toContain("Almost there");
    expect(completeForm).toContain("data-phone-only");
    expect(completeForm).toContain("complete-profile-email");
  });

  it("does not hard-block login or account under guest-demo in proxy", () => {
    expect(proxy).not.toContain("isStorefrontGuestOnly");
  });

  it("gates profile completion for customers only and fails closed on lookup errors", () => {
    expect(proxy).toContain('role !== "user"');
    expect(proxy).toContain('role === "user"');
    expect(proxy).toContain("blocking incomplete check");
    expect(proxy).not.toContain("allowing request.");
  });
});
