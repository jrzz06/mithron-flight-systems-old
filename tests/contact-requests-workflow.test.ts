import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("contact requests workflow", () => {
  it("defines unified leads table and conversion RPC in rebuild migration", () => {
    const migration = source("supabase/migrations/20260819000100_leads_fulfilment_rebuild.sql");
    expect(migration).toContain("create table if not exists public.leads");
    expect(migration).toContain("convert_lead_to_order");
    expect(migration).toContain("drop table if exists public.contact_requests");
  });

  it("keeps lead free-text address from faking structured shipping completeness", () => {
    const migration = source("supabase/migrations/20260819000200_lead_convert_structured_address.sql");
    expect(migration).toContain("convert_lead_to_order");
    expect(migration).toContain("'needs_address', true");
    expect(migration).toContain("'lead_address', v_address");
  });

  it("exposes lead-backed contact request service operations", () => {
    const service = source("services/contact-requests.ts");
    expect(service).toContain("submitContactRequest");
    expect(service).toContain("listAdminContactRequests");
    expect(service).toContain("promoteContactRequestToOrder");
    expect(service).toContain("submitLead");
    expect(service).toContain("pushLeadToOrder");
  });

  it("routes contact form to leads via contact-requests API", () => {
    const contactRoute = source("app/api/contact-requests/route.ts");
    const form = source("components/contact/enquiry-form.tsx");
    expect(contactRoute).toContain("submitLead");
    expect(form).toContain("/api/contact-requests");
  });

  it("includes admin leads module", () => {
    const nav = source("components/platform/nav-config.ts");
    expect(nav).toContain("/admin/leads");
    expect(source("app/admin/leads/page.tsx")).toContain("AdminLeadQueue");
    const queue = source("components/admin/admin-lead-queue.tsx");
    expect(queue).toContain("Push to Order");
    expect(queue).toContain("Delete");
    expect(queue).toContain("leadSourceLabel");
    expect(queue).not.toContain("Mark as in progress");
    expect(source("app/admin/contact-requests/page.tsx")).toContain("redirect(\"/admin/leads\")");
  });

  it("pushes leads to orders from the leads panel", () => {
    const actions = source("app/admin/leads/actions.ts");
    expect(actions).toContain("pushLeadToOrder");
    expect(actions).toContain("deleteLead");
  });

  it("shows contact request context on draft orders", () => {
    const banner = source("components/admin/orders/admin-order-contact-request-banner.tsx");
    expect(banner).toContain("needs_address");
    expect(banner).toContain("needs_products");
  });
});
