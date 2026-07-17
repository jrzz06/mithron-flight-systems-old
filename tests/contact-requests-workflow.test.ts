import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("contact requests workflow", () => {
  it("defines contact_requests table and conversion RPCs in migration", () => {
    const migration = source("supabase/migrations/20260702000100_enterprise_order_lifecycle.sql");
    const convertMigration = source("supabase/migrations/20260717000100_convert_contact_request_to_order.sql");
    expect(migration).toContain("contact_requests");
    expect(migration).toContain("link_contact_request_to_order");
    expect(convertMigration).toContain("convert_contact_request_to_order");
  });

  it("exposes contact request service operations", () => {
    const service = source("services/contact-requests.ts");
    expect(service).toContain("submitContactRequest");
    expect(service).toContain("listAdminContactRequests");
    expect(service).toContain("markContactRequestContacted");
    expect(service).toContain("markContactRequestInProgress");
    expect(service).toContain("requestContactRequestMissingInfo");
    expect(service).toContain("updateContactRequestAddress");
    expect(service).toContain("updateContactRequestContactDetails");
    expect(service).toContain("enrichContactRequestOrderWithItems");
    expect(service).toContain("promoteContactRequestToOrder");
    expect(service).toContain("archiveContactRequest");
    expect(service).toContain("rejectContactRequest");
    expect(service).toContain("restoreContactRequest");
    expect(service).toContain("rpc/convert_contact_request_to_order");
    expect(service).toContain("rpc/link_contact_request_to_order");
    const requestInfoBlock = service.slice(
      service.indexOf("export async function requestContactRequestMissingInfo"),
      service.indexOf("export type ContactRequestAddressInput")
    );
    expect(requestInfoBlock).toContain("contact_requests.info_requested");
    expect(requestInfoBlock).not.toContain("notifyCustomerAboutContactRequest");
    expect(service).not.toContain("async function notifyCustomerAboutContactRequest");
  });

  it("invalidates contact request cache after address and workflow mutations", () => {
    const actions = source("app/admin/contact-requests/actions.ts");
    expect(actions).toContain('revalidateAfterMutation("contact_requests")');
    expect(actions).toContain("updateContactRequestAddressFormAction");
    expect(actions).toContain("Missing information noted internally.");
    expect(actions).not.toContain("Customer notified to provide missing information.");
    expect(actions).toContain("isNextRedirect");
    expect(actions).toContain("isNextRedirect(conversionError)");
    expect(actions).not.toMatch(/\.message\s*===\s*["']NEXT_REDIRECT["']/);
    expect(actions).toMatch(/feedbackUrl\(\s*"warning"/);
    expect(source("app/admin/contact-requests/page.tsx")).toContain("export const maxDuration = 60");
    expect(source("lib/server-action-feedback.ts")).toContain('error.message === "NEXT_REDIRECT"');
  });

  it("applies fail-fast timeouts on contact-request Supabase fetches", () => {
    const service = source("services/contact-requests.ts");
    expect(service).toContain("ADMIN_MUTATION_TIMEOUT_MS");
    expect(service).toContain("AbortSignal.timeout(ADMIN_MUTATION_TIMEOUT_MS)");
  });

  it("routes contact form to contact requests API", () => {
    const contactRoute = source("app/api/contact-requests/route.ts");
    const form = source("components/contact/enquiry-form.tsx");
    expect(contactRoute).toContain("submitContactRequest");
    expect(form).toContain("/api/contact-requests");
  });

  it("includes admin contact request module", () => {
    const nav = source("components/platform/nav-config.ts");
    expect(nav).toContain("/admin/contact-requests");
    expect(source("app/admin/contact-requests/page.tsx")).toContain("AdminContactRequestQueue");
    const queue = source("components/admin/admin-contact-request-queue.tsx");
    expect(queue).toContain("OperationalPrimaryAction");
    expect(queue).toContain("OperationalWorkflowPanel");
    expect(queue).toContain("contactRequestPrimaryActionLabel");
    expect(queue).toContain("ContactRequestAddressEditor");
    expect(queue).toContain("CustomerDetailsEditor");
    expect(queue).toContain("OrderItemPicker");
    expect(queue).toContain("CustomerDetailsEditor");
    expect(queue).toContain("contactRequestMoreActionLabel");
    expect(queue).toContain("Source");
    expect(queue).toContain("contactRequestSourceLabel");
    expect(queue).not.toContain("Mark contacted");
    expect(queue).not.toContain('name="order_id"');
    expect(queue).not.toContain("Link to order");
    const workflow = source("lib/admin/queue-workflow.ts");
    expect(workflow).toContain("I contacted the customer");
    expect(source("components/admin/operational-action-panel.tsx")).toContain("data-primary-action");
    const shared = source("lib/contact-requests/shared.ts");
    expect(shared).toContain("product_enquiry");
    expect(shared).toContain("buy_now");
  });

  it("auto-promotes contact requests to orders when marked contacted", () => {
    const actions = source("app/admin/contact-requests/actions.ts");
    expect(actions).toContain("promoteContactRequestToOrder");
    expect(actions).toContain("readOrderItemsFromFormData");
    expect(actions).toContain("updateContactRequestContactDetailsFormAction");
    expect(actions).toContain("orderRedirectUrl");
    expect(actions).toContain("pushed to orders");
  });

  it("shows contact request context on draft orders", () => {
    const banner = source("components/admin/orders/admin-order-contact-request-banner.tsx");
    expect(banner).toContain("source_contact_request_id");
    expect(banner).toContain("needs_address");
    expect(banner).toContain("needs_products");
  });
});
