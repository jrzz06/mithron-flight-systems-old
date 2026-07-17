import { describe, expect, it } from "vitest";
import {
  enquiryHasShippingAddress,
  formatMissingEnquiryAddressLabels,
  getMissingEnquiryAddressFields,
  isCompleteEnquiryAddress,
  isCompleteStoredEnquiryAddressPayload,
  shippingFormFieldName,
  type AdminEnquiryRow
} from "@/lib/enquiries/shared";

describe("enquiry address validation helpers", () => {
  it("detects a complete address", () => {
    expect(isCompleteEnquiryAddress({
      line1: "12 MG Road",
      city: "Bengaluru",
      state: "Karnataka",
      country: "India",
      postalCode: "560001"
    })).toBe(true);
  });

  it("detects missing address fields", () => {
    expect(getMissingEnquiryAddressFields({
      line1: "12 MG Road",
      city: "Bengaluru",
      state: "",
      country: "India",
      postalCode: ""
    })).toEqual(["state", "postalCode"]);
  });

  it("formats missing field labels for display", () => {
    expect(formatMissingEnquiryAddressLabels(["state", "postalCode"])).toBe("State / province, Postal code");
  });

  it("maps missing fields to shipping form names", () => {
    expect(shippingFormFieldName("postalCode")).toBe("shipping_postal_code");
  });

  it("validates stored payload addresses with postal_code", () => {
    expect(isCompleteStoredEnquiryAddressPayload({
      line1: "12 MG Road",
      city: "Bengaluru",
      state: "Karnataka",
      country: "India",
      postal_code: "560001"
    })).toBe(true);
    expect(isCompleteStoredEnquiryAddressPayload({
      line1: "12 MG Road",
      city: "Bengaluru",
      state: "Karnataka",
      country: "India",
      postal_code: ""
    })).toBe(false);
  });

  it("treats checkout guest addresses as complete when enquiry region supplies country", () => {
    const guestAddress = {
      line1: "Fhj, Rgusdf",
      city: "Chennai",
      region: "Tamilnadu",
      postalCode: "6001104"
    };

    expect(isCompleteStoredEnquiryAddressPayload(guestAddress)).toBe(false);
    expect(isCompleteStoredEnquiryAddressPayload(guestAddress, "India")).toBe(true);

    const enquiry = {
      id: "enquiry-1",
      customer_email: "customer@example.com",
      subject: "Checkout enquiry",
      body: "Need pricing",
      status: "contacted",
      source: "checkout",
      queue_kind: "enquiry",
      region: "India",
      payload: {
        guest_shipping_address: guestAddress
      }
    } as AdminEnquiryRow;

    expect(enquiryHasShippingAddress(enquiry)).toBe(true);
  });
});
