import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatEnquiryReference,
  listAdminEnquiries,
  submitCheckoutProductEnquiry,
  submitProductPageEnquiry
} from "@/services/enquiries";
import { pushLeadToOrder, submitLead } from "@/services/leads";
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

  it("exports lead-backed enquiry service operations", () => {
    const enquiries = source("services/enquiries.ts");
    const leads = source("services/leads.ts");
    expect(typeof submitCheckoutProductEnquiry).toBe("function");
    expect(typeof submitProductPageEnquiry).toBe("function");
    expect(typeof listAdminEnquiries).toBe("function");
    expect(typeof submitLead).toBe("function");
    expect(typeof pushLeadToOrder).toBe("function");
    expect(typeof formatEnquiryReference).toBe("function");
    expect(enquiries).toContain("leads");
    expect(leads).toContain("convert_lead_to_order");
  });

  it("keeps admin leads page and API entry points", () => {
    expect(source("app/admin/leads/page.tsx")).toContain("AdminLeadQueue");
    expect(source("app/api/contact-requests/route.ts")).toContain("submitLead");
    expect(source("app/api/products/enquiry/route.ts")).toContain("submitLead");
    expect(source("app/api/checkout/enquiry/route.ts")).toContain("submitLead");
  });
});
