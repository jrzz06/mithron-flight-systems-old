import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getMissingShippingAddressFields,
  isCompleteShippingAddressFields,
  readShippingAddressFields,
  resolveShippingAddressForCompleteness
} from "@/lib/addresses/format";
import {
  fulfillmentReadinessMessage,
  hasCompleteShippingAddress,
  type AdminRow
} from "@/components/admin/orders/order-view-helpers";

function orderWithMetadata(metadata: Record<string, unknown>, extras: AdminRow = {}): AdminRow {
  return {
    id: "ord-1",
    customer_email: "buyer@example.com",
    status: "confirmed",
    fulfillment_status: "pending",
    metadata,
    ...extras
  };
}

describe("shipping address completeness for fulfillment", () => {
  it("treats guest address without country as complete via India default", () => {
    const fields = readShippingAddressFields({
      line1: "12 MG Road",
      city: "Chennai",
      region: "TN",
      postalCode: "600001"
    });
    expect(fields?.country).toBe("India");
    expect(isCompleteShippingAddressFields(fields)).toBe(true);
  });

  it("flags lead-style line1-only addresses as incomplete", () => {
    const fields = readShippingAddressFields({ line1: "Somewhere in Chennai" });
    expect(getMissingShippingAddressFields(fields)).toEqual(["city", "state", "postalCode"]);
  });

  it("resolves guest_shipping_address when shipping_address is absent", () => {
    const resolved = resolveShippingAddressForCompleteness({
      guest_shipping_address: {
        line1: "12 MG Road",
        city: "Bengaluru",
        state: "Karnataka",
        postal_code: "560001"
      }
    });
    expect(isCompleteShippingAddressFields(resolved)).toBe(true);
  });

  it("hasCompleteShippingAddress accepts guest payload without country", () => {
    const order = orderWithMetadata({
      needs_address: true,
      guest_shipping_address: {
        line1: "12 MG Road",
        city: "Chennai",
        region: "TN",
        postalCode: "600001"
      }
    });
    expect(hasCompleteShippingAddress(order)).toBe(true);
  });

  it("hasCompleteShippingAddress rejects line1-only lead shipping_address", () => {
    const order = orderWithMetadata({
      needs_address: false,
      shipping_address: { line1: "Free text from lead" }
    });
    expect(hasCompleteShippingAddress(order)).toBe(false);
  });

  it("readiness message lists missing structured fields for partial address", () => {
    const order = orderWithMetadata({
      shipping_address: { line1: "Free text from lead" }
    });
    expect(fulfillmentReadinessMessage(order, true)).toBe(
      "Complete shipping address: city, state / province, postal code."
    );
  });

  it("readiness message asks to add address when none exists", () => {
    const order = orderWithMetadata({ needs_address: true });
    expect(fulfillmentReadinessMessage(order, true)).toBe("Add a shipping address before continuing.");
  });

  it("readiness clears when structured address is complete", () => {
    const order = orderWithMetadata({
      shipping_address: {
        line1: "12 MG Road",
        city: "Bengaluru",
        state: "Karnataka",
        country: "India",
        postal_code: "560001"
      },
      needs_address: false
    });
    expect(fulfillmentReadinessMessage(order, true)).toBeNull();
  });
});

describe("lead convert structured address migration", () => {
  it("stores free-text as lead_address and keeps needs_address true", () => {
    const migration = readFileSync(
      join(process.cwd(), "supabase/migrations/20260819000200_lead_convert_structured_address.sql"),
      "utf8"
    );
    expect(migration).toContain("'needs_address', true");
    expect(migration).toContain("'lead_address', v_address");
    expect(migration).not.toContain("jsonb_build_object('line1', v_address)");
    expect(migration).not.toContain("'needs_address', not v_has_address");
  });
});

describe("admin shipping editor prefill", () => {
  it("prefills form defaults and bumps updated_at on optimistic save", () => {
    const shipping = readFileSync(
      join(process.cwd(), "components/admin/orders/admin-order-shipping-section.tsx"),
      "utf8"
    );
    expect(shipping).toContain("shippingFormDefaults");
    expect(shipping).toContain("resolveShippingAddressForCompleteness");
    expect(shipping).toContain("defaultValue={formDefaults.line1}");
    expect(shipping).toContain("updated_at: new Date().toISOString()");
    expect(shipping).toContain("leadAddressNote");
  });
});
