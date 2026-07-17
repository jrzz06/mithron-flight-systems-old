import { describe, expect, it } from "vitest";
import { customerEnquiryStatus, CUSTOMER_EMPTY_MESSAGES } from "@/lib/customer/copy";
import { formatItemCount, formatOrderReference, neverExposeUuidLabel } from "@/lib/customer/display";

const SAMPLE_UUID = "a1b2c3d4-e5f6-4789-a012-3456789abcde";

describe("customer display helpers", () => {
  it("formatOrderReference uses order_number when present", () => {
    expect(formatOrderReference({ id: SAMPLE_UUID, order_number: "ORD-20260626-00124" })).toBe(
      "ORD-20260626-00124"
    );
  });

  it("formatOrderReference never returns a full UUID", () => {
    const label = formatOrderReference({ id: SAMPLE_UUID, order_number: null });
    expect(label).not.toBe(SAMPLE_UUID);
    expect(label).toMatch(/^Order ····[A-F0-9]{4}$/);
  });

  it("neverExposeUuidLabel hides UUID values", () => {
    expect(neverExposeUuidLabel(SAMPLE_UUID)).toBe("");
    expect(neverExposeUuidLabel("ORD-123")).toBe("ORD-123");
  });

  it("formatItemCount pluralizes correctly", () => {
    expect(formatItemCount(1)).toBe("1 item");
    expect(formatItemCount(3)).toBe("3 items");
    expect(formatItemCount(null)).toBeNull();
  });
});

describe("customer copy helpers", () => {
  it("maps converted enquiry status for customers", () => {
    expect(customerEnquiryStatus("converted")).toBe("Converted to order");
  });

  it("uses ecommerce-friendly empty messages", () => {
    expect(CUSTOMER_EMPTY_MESSAGES.orders).toContain("haven't placed");
  });
});
