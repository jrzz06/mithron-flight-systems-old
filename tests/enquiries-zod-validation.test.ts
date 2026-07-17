import { describe, expect, it } from "vitest";
import { assertCustomerContact, isValidCustomerEmail, isValidCustomerPhone } from "@/lib/api/customer-contact";
import { parseEnquiryRequestBody } from "@/lib/api/enquiries-schema";

describe("enquiries validation", () => {
  it("accepts valid payloads with required email and phone", () => {
    const parsed = parseEnquiryRequestBody({
      fullName: "Buyer",
      subject: "Need pricing",
      message: "Please share enterprise pricing.",
      email: "buyer@example.com",
      phone: "+919876543210"
    });
    expect(parsed?.email).toBe("buyer@example.com");
    expect(parsed?.phone).toBe("+919876543210");
    expect(parsed?.fullName).toBe("Buyer");
  });

  it("rejects invalid email, phone, and oversized fields", () => {
    expect(parseEnquiryRequestBody({ subject: "x", message: "y", email: "bad", phone: "+919876543210" })).toBeNull();
    expect(parseEnquiryRequestBody({ subject: "x", message: "y", email: "buyer@example.com", phone: "123" })).toBeNull();
    expect(parseEnquiryRequestBody({ subject: "x", message: "y", email: "buyer@example.com" })).toBeNull();
    expect(parseEnquiryRequestBody({
      subject: "x".repeat(201),
      message: "ok",
      email: "buyer@example.com",
      phone: "+919876543210"
    })).toBeNull();
    expect(parseEnquiryRequestBody({
      subject: "ok",
      message: "m".repeat(5001),
      email: "buyer@example.com",
      phone: "+919876543210"
    })).toBeNull();
  });

  it("treats honeypot submissions as spam no-ops", () => {
    const parsed = parseEnquiryRequestBody({
      fullName: "Spam Bot",
      subject: "spam",
      message: "spam",
      email: "spam@example.com",
      phone: "+919876543210",
      website: "http://bot"
    });
    expect(parsed).toEqual({ subject: "", message: "", email: "", phone: "", fullName: "" });
  });

  it("validates shared customer contact rules", () => {
    expect(isValidCustomerEmail("buyer@example.com")).toBe(true);
    expect(isValidCustomerPhone("+91 98765 43210")).toBe(true);
    expect(() => assertCustomerContact("bad", "+919876543210")).toThrow("email");
    expect(() => assertCustomerContact("buyer@example.com", "123")).toThrow("phone");
  });
});
