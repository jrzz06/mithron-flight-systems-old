import { describe, expect, it } from "vitest";
import {
  nextStepForOrder,
  orderMatchesSelectionKey,
  orderSelectionKey,
  publicOrderLabel,
  resolveOrderBySelectionKey,
  type AdminRow
} from "@/components/admin/orders/order-view-helpers";

function order(overrides: AdminRow): AdminRow {
  return {
    id: "cb01ee46-aaaa-bbbb-cccc-ddddeeeeffff",
    order_number: "",
    status: "dispatched",
    ...overrides
  };
}

describe("admin order selection keys", () => {
  it("uses order_number as the canonical selection key when present", () => {
    const row = order({ order_number: "ORD-1001" });
    expect(orderSelectionKey(row)).toBe("ORD-1001");
    expect(publicOrderLabel(row)).toBe("ORD-1001");
  });

  it("uses the full id as the canonical selection key when order_number is missing", () => {
    const row = order({ order_number: "" });
    expect(orderSelectionKey(row)).toBe("cb01ee46-aaaa-bbbb-cccc-ddddeeeeffff");
    expect(publicOrderLabel(row)).toBe("cb01ee46");
  });

  it("resolves orders by order_number", () => {
    const rows = [order({ id: "a", order_number: "ORD-A" }), order({ id: "b", order_number: "ORD-B" })];
    expect(resolveOrderBySelectionKey(rows, "ORD-B")?.id).toBe("b");
  });

  it("resolves orders by full id", () => {
    const rows = [order({ id: "full-uuid-1", order_number: "" })];
    expect(resolveOrderBySelectionKey(rows, "full-uuid-1")?.id).toBe("full-uuid-1");
  });

  it("resolves legacy short-id URLs from publicOrderLabel", () => {
    const rows = [order({ order_number: "" })];
    expect(resolveOrderBySelectionKey(rows, "cb01ee46")?.id).toBe("cb01ee46-aaaa-bbbb-cccc-ddddeeeeffff");
    expect(orderMatchesSelectionKey(rows[0], "cb01ee46", rows)).toBe(true);
  });

  it("returns null when a short id prefix matches multiple orders", () => {
    const rows = [
      order({ id: "cb01ee46-1111-1111-1111-111111111111", order_number: "" }),
      order({ id: "cb01ee46-2222-2222-2222-222222222222", order_number: "" })
    ];
    expect(resolveOrderBySelectionKey(rows, "cb01ee46")).toBeNull();
    expect(orderMatchesSelectionKey(rows[0], "cb01ee46", rows)).toBe(false);
  });

  it("clarifies pending payment actions reference the danger zone", () => {
    const step = nextStepForOrder(order({ status: "pending_payment" }));
    expect(step.description).toContain("Danger Zone");
    expect(step.action).toBe("none");
  });
});
