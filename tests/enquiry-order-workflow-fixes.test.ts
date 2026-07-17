import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canCancelOrder } from "@/components/admin/orders/order-view-helpers";
import {
  CANCELLABLE_ORDER_STATUSES,
  isCancellableOrderStatus
} from "@/lib/orders/status";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("enquiry/order workflow collapse fixes", () => {
  it("blocks conversion of closed enquiries and contact requests in SQL and TS", () => {
    const migration = source("supabase/migrations/20260728000100_block_closed_conversion.sql");
    expect(migration).toContain("enquiry_closed");
    expect(migration).toContain("contact_request_closed");
    expect(migration).toContain("v_enquiry.status = 'lost'");
    expect(migration).toContain("v_request.status in ('rejected', 'archived')");

    const enquiries = source("services/enquiries.ts");
    expect(enquiries).toContain("This enquiry is closed and cannot be converted to an order.");

    const contactRequests = source("services/contact-requests.ts");
    expect(contactRequests).toContain("This contact request is closed and cannot be converted to an order.");
  });

  it("adds optimistic locking for enquiries and contact requests", () => {
    const adminActions = source("services/admin-actions.ts");
    expect(adminActions).toContain('"enquiries"');
    expect(adminActions).toContain('"contact_requests"');

    const enquiries = source("services/enquiries.ts");
    expect(enquiries).toContain("expectedUpdatedAt");

    const contactRequests = source("services/contact-requests.ts");
    expect(contactRequests).toContain("expectedUpdatedAt");

    const enquiryActions = source("app/admin/enquiries/actions.ts");
    expect(enquiryActions).toContain("readExpectedUpdatedAt");
    expect(enquiryActions).toContain("isRecordConflictError");

    const contactActions = source("app/admin/contact-requests/actions.ts");
    expect(contactActions).toContain("readExpectedUpdatedAt");
    expect(contactActions).toContain("isRecordConflictError");
  });

  it("restricts order cancel to pre-dispatch statuses", () => {
    expect(CANCELLABLE_ORDER_STATUSES).toContain("draft");
    expect(CANCELLABLE_ORDER_STATUSES).toContain("packed");
    expect(isCancellableOrderStatus("dispatched")).toBe(false);
    expect(isCancellableOrderStatus("in_transit")).toBe(false);
    expect(canCancelOrder({ status: "admin_review", fulfillment_status: "pending" })).toBe(true);
    expect(canCancelOrder({ status: "dispatched", fulfillment_status: "shipped" })).toBe(false);
    expect(canCancelOrder({ status: "packed", fulfillment_status: "packed" })).toBe(true);

    const workflow = source("services/order-workflow.ts");
    expect(workflow).toContain("Order cannot be cancelled after dispatch");
    expect(workflow).toContain("isCancellableOrderStatus");
  });

  it("exposes a Converted tab for contact requests", () => {
    const page = source("app/admin/contact-requests/page.tsx");
    expect(page).toContain('key: "converted"');
    expect(page).toContain('label: "Converted"');

    const shared = source("lib/contact-requests/shared.ts");
    expect(shared).toContain('"converted"');
  });
});
