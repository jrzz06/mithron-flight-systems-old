import { describe, expect, it } from "vitest";
import {
  contactRequestMoreActions,
  contactRequestNextStepLabel,
  contactRequestPrimaryAction,
  contactRequestPrimaryActionLabel,
  enquiryMoreActions,
  enquiryNextStepLabel,
  enquiryPrimaryAction,
  enquiryPrimaryActionLabel,
  enquirySupportsConvert
} from "@/lib/admin/queue-workflow";
import type { AdminContactRequestRow } from "@/lib/contact-requests/shared";
import type { AdminEnquiryRow } from "@/lib/enquiries/shared";

function enquiry(status: string, overrides: Partial<AdminEnquiryRow> = {}): AdminEnquiryRow {
  return {
    id: "enquiry-1",
    customer_email: "customer@example.com",
    subject: "Test enquiry",
    body: "Hello",
    status,
    source: "contact",
    queue_kind: "enquiry",
    ...overrides
  };
}

function contactRequest(status: string, overrides: Partial<AdminContactRequestRow> = {}): AdminContactRequestRow {
  return {
    id: "request-1",
    request_number: 1,
    customer_email: "customer@example.com",
    subject: "Help",
    body: "Need support",
    status,
    source: "contact",
    timeline: [],
    notes: [],
    ...overrides
  };
}

describe("admin queue workflow helpers", () => {
  it("maps enquiry statuses to a single linear primary action", () => {
    expect(enquiryPrimaryAction(enquiry("new"))).toBe("contact");
    expect(enquiryPrimaryAction(enquiry("contacted"))).toBe("convert");
    expect(enquiryPrimaryAction(enquiry("qualified"))).toBe("convert");
    expect(enquiryPrimaryAction(enquiry("won"))).toBe("convert");
    expect(enquiryPrimaryAction(enquiry("converted"))).toBe("none");
    expect(enquiryPrimaryAction(enquiry("lost"))).toBe("none");
  });

  it("allows convert once contacted even without address", () => {
    expect(enquiryPrimaryAction(enquiry("contacted"))).toBe("convert");
    expect(enquirySupportsConvert(enquiry("contacted"))).toBe(true);
  });

  it("allows convert when address is present", () => {
    const withAddress = enquiry("contacted", {
      payload: {
        shipping_address: {
          line1: "12 MG Road",
          city: "Bengaluru",
          state: "Karnataka",
          country: "India",
          postal_code: "560001"
        }
      }
    });
    expect(enquiryPrimaryAction(withAddress)).toBe("convert");
    expect(enquirySupportsConvert(withAddress)).toBe(true);
  });

  it("allows convert with partial shipping address", () => {
    const partialAddress = enquiry("contacted", {
      payload: {
        shipping_address: {
          line1: "12 MG Road",
          city: "",
          state: "",
          country: "",
          postal_code: ""
        }
      }
    });
    expect(enquiryPrimaryAction(partialAddress)).toBe("convert");
    expect(enquirySupportsConvert(partialAddress)).toBe(true);
  });

  it("allows convert when shipping_address_id is linked", () => {
    const linkedAddress = enquiry("contacted", {
      payload: {
        shipping_address_id: "addr-123"
      }
    });
    expect(enquiryPrimaryAction(linkedAddress)).toBe("convert");
    expect(enquirySupportsConvert(linkedAddress)).toBe(true);
  });

  it("mentions missing shipping fields in the next step label", () => {
    const partialAddress = enquiry("contacted", {
      payload: {
        shipping_address: {
          line1: "12 MG Road",
          city: "Bengaluru",
          state: "",
          country: "India",
          postal_code: ""
        }
      }
    });
    expect(enquiryNextStepLabel(partialAddress)).toContain("missing:");
    expect(enquiryNextStepLabel(partialAddress)).toContain("State / province");
    expect(enquiryNextStepLabel(partialAddress)).toContain("Postal code");
  });

  it("uses plain-English enquiry labels", () => {
    expect(enquiryPrimaryActionLabel("contact")).toBe("I contacted the customer");
    expect(enquiryPrimaryActionLabel("convert")).toBe("Create order");
    expect(enquiryNextStepLabel(enquiry("contacted"))).toContain("address optional");
  });

  it("exposes expanded workflow actions for open enquiries", () => {
    expect(enquiryMoreActions(enquiry("new"))).toEqual([
      "requestInfo",
      "close",
      "cancel"
    ]);
    expect(enquiryMoreActions(enquiry("contacted"))).toEqual([
      "markInProgress",
      "complete",
      "requestInfo",
      "close",
      "cancel"
    ]);
    expect(enquiryMoreActions(enquiry("converted"))).toEqual([]);
    expect(enquiryMoreActions(enquiry("lost"))).toEqual([]);
    expect(enquiryMoreActions(enquiry("new", { queue_kind: "checkout_order" }))).toEqual([]);
    expect(enquiryMoreActions(enquiry("contacted", { archived_at: "2026-01-01" }))).toEqual([
      "markInProgress",
      "complete",
      "requestInfo",
      "close",
      "cancel"
    ]);
  });

  it("maps contact request statuses to a single primary action", () => {
    expect(contactRequestPrimaryAction(contactRequest("new"))).toBe("contact");
    expect(contactRequestPrimaryAction(contactRequest("contacted"))).toBe("createOrder");
    expect(contactRequestPrimaryAction(contactRequest("qualified"))).toBe("createOrder");
    expect(contactRequestPrimaryAction(contactRequest("archived"))).toBe("none");
    expect(contactRequestPrimaryAction(contactRequest("rejected"))).toBe("none");
    expect(contactRequestPrimaryAction(contactRequest("converted"))).toBe("none");
  });

  it("uses plain-English contact request labels", () => {
    expect(contactRequestPrimaryActionLabel("contact")).toBe("I contacted the customer");
    expect(contactRequestPrimaryActionLabel("createOrder")).toBe("Convert to order");
    expect(contactRequestNextStepLabel(contactRequest("contacted"))).toBe(
      "Add shipping address or request missing information"
    );
    expect(contactRequestNextStepLabel(contactRequest("converted"))).toBe("Order created");
    expect(contactRequestNextStepLabel(contactRequest("rejected"))).toBe("Not going ahead");
  });

  it("exposes expanded workflow actions for open contact requests", () => {
    expect(contactRequestMoreActions(contactRequest("new"))).toEqual([
      "markInProgress",
      "requestInfo",
      "reject"
    ]);
    expect(contactRequestMoreActions(contactRequest("archived"))).toEqual([]);
    expect(contactRequestMoreActions(contactRequest("rejected"))).toEqual([]);
    expect(contactRequestMoreActions(contactRequest("converted"))).toEqual([]);
  });

  it("hides cancel/close/convert once linked to an order even if status lags", () => {
    const linkedEnquiry = enquiry("contacted", { converted_order_id: "order-1" });
    expect(enquiryPrimaryAction(linkedEnquiry)).toBe("none");
    expect(enquiryMoreActions(linkedEnquiry)).toEqual([]);
    expect(enquiryNextStepLabel(linkedEnquiry)).toBe("Order created");

    const linkedRequest = contactRequest("contacted", { converted_order_id: "order-2" });
    expect(contactRequestPrimaryAction(linkedRequest)).toBe("none");
    expect(contactRequestMoreActions(linkedRequest)).toEqual([]);
    expect(contactRequestNextStepLabel(linkedRequest)).toBe("Order created");
  });
});
