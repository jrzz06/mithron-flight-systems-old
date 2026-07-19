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

    const leads = source("services/leads.ts");
    expect(leads).toContain("convert_lead_to_order");
    expect(leads).toContain("Could not convert lead to order");
    expect(leads).toContain("Converted leads cannot be deleted");
  });

  it("adds optimistic locking for enquiries and contact requests", () => {
    const adminActions = source("services/admin-actions.ts");
    expect(adminActions).toContain('"leads"');
    expect(adminActions).toContain("expectedUpdatedAt");

    const leadsActions = source("app/admin/leads/actions.ts");
    expect(leadsActions).toContain("requireAdminPermission");
    expect(leadsActions).toContain("isNextRedirect");
  });

  it("restricts order cancel to pre-dispatch statuses", () => {
    expect(CANCELLABLE_ORDER_STATUSES).toContain("draft");
    expect(CANCELLABLE_ORDER_STATUSES).toContain("packed");
    expect(isCancellableOrderStatus("dispatched")).toBe(false);
    expect(isCancellableOrderStatus("in_transit")).toBe(false);
    expect(canCancelOrder({ status: "admin_review", fulfillment_status: "pending" })).toBe(true);
    expect(canCancelOrder({ status: "dispatched", fulfillment_status: "shipped" })).toBe(false);
    expect(canCancelOrder({ status: "packed", fulfillment_status: "pending" })).toBe(true);
    expect(canCancelOrder({ status: "packed", fulfillment_status: "packed" })).toBe(false);

    const workflow = source("services/order-workflow.ts");
    expect(workflow).toContain("Order cannot be cancelled after dispatch");
    expect(workflow).toContain("isCancellableOrderStatus");
  });

  it("exposes a Converted tab for leads", () => {
    const page = source("app/admin/leads/page.tsx");
    expect(page).toContain('key: "converted"');
    expect(page).toContain('label: "Converted"');

    const shared = source("lib/leads/shared.ts");
    expect(shared).toContain('"converted"');
  });
});
