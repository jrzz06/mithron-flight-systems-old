import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canTransitionOrderStatus } from "@/services/orders";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("order workflow hardening", () => {
  it("defines timeline RPCs in migration", () => {
    const migration = source("supabase/migrations/20260626000300_order_timeline_atomic_transitions.sql");
    expect(migration).toContain("append_order_timeline_entry");
    expect(migration).toContain("transition_order_with_timeline");
    expect(migration).toContain("p_idempotency_key");
  });

  it("calls transition RPC with matching PostgREST parameter names", () => {
    const adminActions = source("services/admin-actions.ts");
    expect(adminActions).toContain("rpc/transition_order_with_timeline");
    expect(adminActions).toContain("p_order_id");
    expect(adminActions).toContain("p_entry");
    expect(adminActions).toContain("p_status");
    expect(adminActions).toContain("p_fulfillment_status");
    expect(adminActions).toContain("p_expected_updated_at");
    expect(adminActions).toContain("p_idempotency_key");
  });

  it("uses atomic workflow service for admin confirm and warehouse assign", () => {
    const actions = source("app/admin/orders/actions.ts");
    const workflow = source("services/order-workflow.ts");
    const server = source("lib/admin/order-transition-server.ts");
    expect(actions).toContain("confirmAdminOrderWorkflow");
    expect(actions).toContain("assignOrderToWarehouseWorkflow");
    expect(actions).toContain("rejectAdminOrderWorkflow");
    expect(actions).toContain("markOrderPaidWorkflow");
    expect(workflow).toContain("idempotencyKey");
    expect(workflow).toContain("transitionOrderWithServerCasRetry");
    expect(server).toContain("serverExpectedUpdatedAt");
    expect(workflow).toContain("notifyWarehouseAboutOrder");
    expect(workflow).toContain("admin_fulfillment_released_at");
    // Status-mismatch on assign is a soft conflict (auto-sync warning), not a hard error redirect.
    expect(workflow).toContain("cannot be assigned to warehouse");
    expect(workflow).toContain("This order was already sent to warehouse. Refreshing the latest status.");
    expect(workflow).toContain("AdminRecordConflictError");
  });

  it("allows admin review rejection transition", () => {
    expect(canTransitionOrderStatus("admin_review", "confirmed")).toBe(true);
    expect(canTransitionOrderStatus("admin_review", "cancelled")).toBe(true);
  });

  it("allows pending payment orders to move to paid", () => {
    expect(canTransitionOrderStatus("pending_payment", "paid")).toBe(true);
  });

  it("defaults delete workflow to soft delete", () => {
    const workflow = source("services/order-workflow.ts");
    const actions = source("app/admin/orders/actions.ts");
    expect(workflow).toContain("softDeleteAdminOrderWorkflow");
    expect(workflow).toContain("permanentDeleteAdminOrderWorkflow");
    expect(workflow).toContain("removeOrderItemFromOrderWorkflow");
    expect(workflow).toContain("return softDeleteAdminOrderWorkflow(input, env);");
    expect(actions).toContain("permanentDeleteAdminOrderFormAction");
    expect(actions).toContain("removeOrderItemFormAction");
  });

  it("wires list-row cancel/delete and product removal into admin orders workspace", () => {
    const page = source("app/admin/orders/page.tsx");
    const workspace = source("components/admin/admin-orders-workspace.tsx");
    const listItem = source("components/admin/orders/admin-order-list-item.tsx");
    const products = source("components/admin/orders/admin-order-products-section.tsx");

    expect(page).toContain("removeOrderItemFormAction");
    expect(workspace).toContain("removeOrderItemAction");
    expect(workspace).toContain("cancelAdminOrderAction");
    expect(workspace).toContain("permanentDeleteAdminOrderAction");
    expect(listItem).toContain("AdminOrderRowQuickActions");
    expect(products).toContain("Remove");
  });

  it("wires mark as paid action into admin order actions rail", () => {
    const page = source("app/admin/orders/page.tsx");
    const workspace = source("components/admin/admin-orders-workspace.tsx");
    const rail = source("components/admin/orders/admin-order-actions-rail.tsx");

    expect(page).toContain("markOrderPaidAdminOrderAction");
    expect(workspace).toContain("markOrderPaidAdminOrderAction");
    expect(rail).toContain("markOrderPaidAdminOrderAction");
    expect(rail).toContain("Mark as paid");
  });

  it("wires mark as refunded action into admin order actions rail", () => {
    const page = source("app/admin/orders/page.tsx");
    const workspace = source("components/admin/admin-orders-workspace.tsx");
    const rail = source("components/admin/orders/admin-order-actions-rail.tsx");

    expect(page).toContain("markOrderRefundedAdminOrderAction");
    expect(workspace).toContain("markOrderRefundedAdminOrderAction");
    expect(rail).toContain("markOrderRefundedAdminOrderAction");
    expect(rail).toContain("Mark as refunded");
  });

  it("stores warehouse notify extras in payload not metadata", () => {
    const workflow = source("services/order-workflow.ts");
    const adminActions = source("services/admin-actions.ts");
    expect(workflow).toContain("payload: {");
    expect(workflow).toContain("order-fulfillment-ready");
    expect(adminActions).toContain("legacyMetadata");
    expect(adminActions).toContain("mergedPayload");
  });

  it("verifies stock before admin add/approve/assign flows", () => {
    const workflow = source("services/order-workflow.ts");
    expect(workflow).toContain("verifyOrderStockAvailability");
    expect(workflow).toContain("verifyExistingOrderStock");
  });

  it("gates fulfillment actions on customer, address, and products", () => {
    const helpers = source("components/admin/orders/order-view-helpers.ts");
    const rail = source("components/admin/orders/admin-order-actions-rail.tsx");
    expect(helpers).toContain("fulfillmentReadinessMessage");
    expect(helpers).toContain("hasCompleteShippingAddress");
    expect(helpers).toContain("hasIdentifiedCustomer");
    expect(rail).toContain("fulfillmentBlockedMessage");
    expect(rail).toContain("disabled={Boolean(fulfillmentBlockedMessage)}");
  });

  it("requires cancel before permanent delete (checkout channel)", () => {
    const helpers = source("components/admin/orders/order-view-helpers.ts");
    expect(helpers).toContain('return status === "cancelled" || channel === "enquiry";');
  });
});
