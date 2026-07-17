import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assignEnquiry,
  convertEnquiryToOrderAtomic,
  markEnquiryContacted,
  submitCheckoutProductEnquiry,
  submitEnquiry,
  submitProductPageEnquiry
} from "@/services/enquiries";
import { buildValidatedOrderDraft } from "@/services/orders";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("enquiry workflow", () => {
  it("validates enquiry conversion order draft shape", () => {
    const draft = buildValidatedOrderDraft(
      {
        customerEmail: "buyer@example.com",
        items: [{ productSlug: "ag10", quantity: 1 }],
        metadata: { source_enquiry_id: "enq-1" }
      },
      [{ slug: "ag10", name: "Ag10", price: 1000, category: "agriculture" }]
    );
    expect(draft.order.customer_email).toBe("buyer@example.com");
    expect(draft.orderItems).toHaveLength(1);
  });

  it("exports enquiry service operations", () => {
    const enquiries = source("services/enquiries.ts");
    expect(typeof submitEnquiry).toBe("function");
    expect(typeof submitCheckoutProductEnquiry).toBe("function");
    expect(typeof submitProductPageEnquiry).toBe("function");
    expect(typeof assignEnquiry).toBe("function");
    expect(typeof markEnquiryContacted).toBe("function");
    expect(typeof convertEnquiryToOrderAtomic).toBe("function");
    expect(enquiries).toContain("markEnquiryInProgress");
    expect(enquiries).toContain("markEnquiryComplete");
    expect(enquiries).toContain("requestEnquiryMissingInfo");
    const requestInfoBlock = enquiries.slice(
      enquiries.indexOf("export async function requestEnquiryMissingInfo"),
      enquiries.indexOf("export async function addEnquiryNote")
    );
    expect(requestInfoBlock).toContain("enquiries.info_requested");
    expect(requestInfoBlock).not.toContain("notifyCustomerAboutEnquiry");
  });

  it("invalidates enquiry cache after address and workflow mutations", () => {
    const actions = source("app/admin/enquiries/actions.ts");
    expect(actions).toContain('revalidateAfterMutation("enquiries")');
    expect(actions).toContain("updateEnquiryAddressFormAction");
    const addressBlock = actions.slice(
      actions.indexOf("export async function updateEnquiryAddressFormAction"),
      actions.length
    );
    expect(addressBlock).toContain('revalidateAfterMutation("enquiries")');
    expect(actions).toContain("Missing information noted internally.");
    expect(actions).not.toContain("Customer notified to provide missing information.");
  });

  it("keeps product page enquiries visible in admin queue", () => {
    const enquiries = source("services/enquiries.ts");
    expect(enquiries).toContain('source: "product_page"');
    expect(enquiries).toContain('text(payload.source) === "product_page"');
    expect(enquiries).toContain('!== "contact"');
  });

  it("routes enquiry conversion through atomic RPC with idempotency", () => {
    const migration = source("supabase/migrations/20260702000100_enterprise_order_lifecycle.sql");
    const enquiries = source("services/enquiries.ts");
    expect(migration).toContain("convert_enquiry_to_order_atomic");
    expect(migration).toContain("converted_order_id");
    expect(enquiries).toContain("rpc/convert_enquiry_to_order_atomic");
    expect(enquiries).toContain("convertEnquiryToOrderAtomic");
    expect(enquiries).toContain("return convertEnquiryToOrderAtomic");
  });

  it("does not hard-block enquiry conversion without product or address", () => {
    const enquiries = source("services/enquiries.ts");
    expect(enquiries).toContain("needs_products: true");
    expect(enquiries).toContain("needs_address: !hasAddress");
    expect(enquiries).not.toContain("Add a related product before converting.");
    expect(enquiries).not.toContain("Save the customer's shipping address before creating this order.");
  });

  it("accepts override line items during enquiry conversion", () => {
    const actions = source("app/admin/enquiries/actions.ts");
    expect(actions).toContain("readOrderItemsFromFormData");
    expect(actions).toContain("overrideItems");
  });

  it("defers redis invalidation after tag/path revalidation", () => {
    const revalidate = source("lib/control-plane/revalidate-realtime.ts");
    expect(revalidate).toContain('import { after } from "next/server"');
    expect(revalidate).toContain("after(async () => {");
  });
});
