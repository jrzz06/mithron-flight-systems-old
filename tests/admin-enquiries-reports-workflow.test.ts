import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("admin enquiry lifecycle workflow", () => {
  it("fixes mark contacted assignee handling and exposes full lifecycle actions", () => {
    const actions = readFileSync(join(process.cwd(), "app/admin/enquiries/actions.ts"), "utf8");
    const page = readFileSync(join(process.cwd(), "app/admin/enquiries/page.tsx"), "utf8");
    const queue = readFileSync(join(process.cwd(), "components/admin/admin-enquiry-queue.tsx"), "utf8");
    const service = readFileSync(join(process.cwd(), "services/enquiries.ts"), "utf8");

    expect(actions).toContain("markEnquiryContactedFormAction");
    expect(actions).toContain("addEnquiryNoteFormAction");
    expect(actions).toContain("promoteEnquiryToOrder");
    expect(actions).toContain("updateEnquiryMetaFormAction");
    expect(actions).not.toContain('assigned_to") ?? context.userId');
    expect(queue).toContain("data-enquiry-queue");
    expect(queue).toContain("Next step");
    expect(queue).toContain("OperationalPrimaryAction");
    expect(queue).toContain("OperationalWorkflowPanel");
    expect(queue).toContain("enquiryPrimaryActionLabel");
    expect(queue).toContain("enquiryMoreActionLabel");
    expect(queue).not.toContain("Mark contacted");
    expect(queue).not.toContain("Mark qualified");
    const workflow = readFileSync(join(process.cwd(), "lib/admin/queue-workflow.ts"), "utf8");
    expect(workflow).toContain("I contacted the customer");
    expect(workflow).toContain("Create order");
    expect(workflow).toContain("Not going ahead");
    expect(workflow).not.toContain("Mark ready for order");
    expect(readFileSync(join(process.cwd(), "components/admin/operational-action-panel.tsx"), "utf8")).toContain("data-primary-action");
    expect(page).toContain("AdminEnquiryQueue");
    expect(page).toContain("EnquiryQueueLiveSync");
    expect(actions).toContain("markCheckoutOrderEnquiryContacted");
    expect(actions).toContain('revalidateAfterMutation("enquiries")');
    expect(actions).toContain("Missing information noted internally.");
    expect(actions).not.toContain("Customer notified to provide missing information.");
    expect(service).toContain("notifyAdminsAboutEnquiry");
    expect(service).toContain("createActivityLogRecord");
    expect(service).toContain("markEnquiryContacted");
    expect(service).toContain("addEnquiryNote");
    expect(service).toContain("promoteEnquiryToOrder");
    expect(service).toContain("requestEnquiryMissingInfo");
    expect(service).toContain("enquiries.info_requested");
    const requestInfoBlock = service.slice(
      service.indexOf("export async function requestEnquiryMissingInfo"),
      service.indexOf("export async function addEnquiryNote")
    );
    expect(requestInfoBlock).not.toContain("notifyCustomerAboutEnquiry");
  });

  it("keeps the same enquiry open after mark contacted when address is missing", () => {
    const actions = readFileSync(join(process.cwd(), "app/admin/enquiries/actions.ts"), "utf8");
    const page = readFileSync(join(process.cwd(), "app/admin/enquiries/page.tsx"), "utf8");
    const queue = readFileSync(join(process.cwd(), "components/admin/admin-enquiry-queue.tsx"), "utf8");

    expect(actions).toContain('listStatus: "contacted"');
    expect(actions).toContain('params.set("open", context.enquiryId)');
    expect(actions).not.toContain("Add the customer's shipping address to continue.");
    expect(actions).toContain("Create the order when ready.");
    expect(actions).toContain("readListContext");
    expect(actions).toContain('readString(formData, "list_status")');
    expect(actions).toContain('readString(formData, "list_q")');

    expect(queue).toContain("ListContextFields");
    expect(queue).toContain('name="list_status"');
    expect(queue).toContain('name="list_q"');
    expect(queue).toContain('searchParams.get("open")');
    expect(queue).toContain("listStatus");
    expect(queue).toContain("listQuery");
    expect(queue).toContain("OrderItemPicker");
    expect(queue).toContain("CustomerDetailsEditor");

    expect(page).toContain('searchValue(params, "open")');
    expect(page).toContain("listStatus={statusFilter}");
    expect(page).toContain("listQuery={query}");
    expect(page).toContain("initialExpandedEnquiryId={focusEnquiryId || null}");
  });

  it("keeps mark contacted and create order as separate steps", () => {
    const actions = readFileSync(join(process.cwd(), "app/admin/enquiries/actions.ts"), "utf8");

    const markContactedBlock = actions.slice(
      actions.indexOf("export async function markEnquiryContactedFormAction"),
      actions.indexOf("export async function addEnquiryNoteFormAction")
    );
    const convertBlock = actions.slice(
      actions.indexOf("export async function convertEnquiryToOrderFormAction"),
      actions.indexOf("export async function closeEnquiryFormAction")
    );

    expect(markContactedBlock).not.toContain("promoteEnquiryToOrder");
    expect(markContactedBlock).not.toContain("converted to order");
    expect(convertBlock).toContain("promoteEnquiryToOrder");
    expect(convertBlock).toContain("Enquiry converted to order.");
  });

  it("notifies admins when enquiries are submitted", () => {
    const service = readFileSync(join(process.cwd(), "services/enquiries.ts"), "utf8");
    const contactRoute = readFileSync(join(process.cwd(), "app/api/contact-requests/route.ts"), "utf8");
    const checkoutRoute = readFileSync(join(process.cwd(), "app/api/checkout/enquiry/route.ts"), "utf8");

    expect(service).toContain("notifyAdminsAboutEnquiry");
    expect(contactRoute).not.toContain("notifyAdminsAboutEnquiry");
    expect(checkoutRoute).toContain("await submitCheckoutProductEnquiry(");
    expect(checkoutRoute).not.toMatch(/submitCheckoutProductEnquiry\([\s\S]*\)\.catch\(/);
  });

  it("loads enquiry payload when promoting enquiries to orders", () => {
    const adminActions = readFileSync(join(process.cwd(), "services/admin-actions.ts"), "utf8");
    const service = readFileSync(join(process.cwd(), "services/enquiries.ts"), "utf8");

    expect(adminActions).toMatch(/enquiries:\s*"[^"]*payload[^"]*"/);
    expect(adminActions).toMatch(/enquiries:\s*"[^"]*region[^"]*"/);
    expect(adminActions).toMatch(/orders:\s*"[^"]*metadata[^"]*"/);
    expect(adminActions).toMatch(/orders:\s*"[^"]*channel[^"]*"/);
    expect(service).toContain("enquiryHasShippingAddress(enquiry as AdminEnquiryRow)");
    expect(service).not.toContain("enquiryHasShippingAddressInPayload");
    expect(service).toContain("buildEnquiryCustomerOrderMetadata");
    expect(service).toContain("enquiryCustomerPhone(enquiryRow)");
    expect(service).toContain('channel: "enquiry"');
  });

  it("rethrows Next.js redirects in admin order page wrappers", () => {
    const adminOrdersPage = readFileSync(join(process.cwd(), "app/admin/orders/page.tsx"), "utf8");

    expect(adminOrdersPage).toContain("isNextRedirect");
    expect(adminOrdersPage).toContain("rethrowIfNextRedirect");
    expect(adminOrdersPage).toMatch(/catch \(error\) \{[\s\S]*rethrowIfNextRedirect\(error\)/);
  });

  it("fail-fasts Supabase mutations and rethrows redirects so save buttons cannot hang forever", () => {
    const adminActions = readFileSync(join(process.cwd(), "services/admin-actions.ts"), "utf8");
    const enquiryActions = readFileSync(join(process.cwd(), "app/admin/enquiries/actions.ts"), "utf8");
    const submitButton = readFileSync(join(process.cwd(), "components/admin/operational-submit-button.tsx"), "utf8");

    expect(adminActions).toContain("ADMIN_MUTATION_TIMEOUT_MS");
    expect(adminActions).toContain("AbortSignal.timeout(ADMIN_MUTATION_TIMEOUT_MS)");
    expect(adminActions).toContain("mutationSignal()");
    expect(enquiryActions).toContain("isNextRedirect");
    expect(enquiryActions).not.toContain('error.message === "NEXT_REDIRECT"');
    expect(readFileSync(join(process.cwd(), "app/admin/enquiries/page.tsx"), "utf8")).toContain("export const maxDuration = 60");
    expect(submitButton).not.toContain("Still saving… this can take a few extra seconds");
    expect(submitButton).not.toContain("STILL_SAVING_HINT_MS");
    expect(submitButton).toContain("useFormStatus");
  });
});
