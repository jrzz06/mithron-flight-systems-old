import { describe, expect, it } from "vitest";
import {
  orderContentSwapClass,
  orderPanelEnterClass
} from "@/components/admin/orders/order-detail-primitives";
import {
  filterOrders,
  orderDateParts,
  orderPriorityBadge,
  orderSearchHaystack,
  resolveProductImage,
  sortOrders,
  type AdminRow
} from "@/components/admin/orders/order-view-helpers";

function order(overrides: AdminRow): AdminRow {
  return {
    id: "order-1",
    order_number: "ORD-1001",
    customer_email: "buyer@example.com",
    status: "paid",
    payment_status: "succeeded",
    fulfillment_status: "pending",
    channel: "checkout",
    total: 1200,
    created_at: "2026-06-01T10:00:00.000Z",
    metadata: { customer_full_name: "Buyer One", customer_phone: "+911234567890" },
    ...overrides
  };
}

describe("admin orders view helpers", () => {
  it("derives priority badges for action, payment, and enquiry orders", () => {
    expect(orderPriorityBadge(order({ status: "paid" }))).toBe("action");
    expect(orderPriorityBadge(order({ status: "pending_payment", payment_status: "pending" }))).toBe("payment");
    expect(orderPriorityBadge(order({ channel: "enquiry", status: "admin_review" }))).toBe("action");
    expect(orderPriorityBadge(order({ status: "delivered", fulfillment_status: "delivered" }))).toBeNull();
  });

  it("filters orders by search, payment status, and product slug", () => {
    const orders = [
      order({ id: "a", order_number: "ORD-A" }),
      order({ id: "b", order_number: "ORD-B", payment_status: "failed", status: "cancelled" })
    ];
    const items = [
      { order_id: "a", product_slug: "drone-a", product_name: "Drone A", quantity: 1 },
      { order_id: "b", product_slug: "drone-b", product_name: "Drone B", quantity: 1 }
    ] as AdminRow[];

    const filtered = filterOrders(
      orders,
      items,
      "all",
      {
        query: "drone-a",
        paymentStatus: "",
        fulfillmentStatus: "",
        warehouse: "",
        dateFrom: "",
        dateTo: "",
        customer: "",
        product: "",
        orderId: "",
        sort: "newest"
      },
      "IN-WEST-01"
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("a");
    expect(orderSearchHaystack(orders[0], items)).toContain("drone-a");
  });

  it("sorts orders by needs-action first and highest total", () => {
    const orders = [
      order({ id: "a", total: 500, created_at: "2026-06-01T10:00:00.000Z", status: "delivered" }),
      order({ id: "b", total: 2500, created_at: "2026-06-02T10:00:00.000Z", status: "paid" }),
      order({ id: "c", total: 900, created_at: "2026-06-03T10:00:00.000Z", status: "paid" })
    ];

    const needsAction = sortOrders(orders, "needs_action");
    expect(needsAction[0].id).toBe("c");
    expect(needsAction[needsAction.length - 1].id).toBe("a");

    const byTotal = sortOrders(orders, "total_desc");
    expect(byTotal[0].id).toBe("b");
  });

  it("resolves product images from catalog rows", () => {
    const products = [{ slug: "drone-a", image: "/media/drone-a.jpg" }] as AdminRow[];
    expect(resolveProductImage(products, "drone-a")).toBe("/media/drone-a.jpg");
    expect(resolveProductImage(products, "missing")).toBeNull();
  });

  it("splits order timestamps into date and time parts", () => {
    const parts = orderDateParts(
      order({ created_at: "2026-06-01T10:30:00.000Z" })
    );
    expect(parts.date).not.toBe("—");
    expect(parts.time).not.toBe("—");
  });

  it("skips slide transforms when reduced motion is preferred", () => {
    expect(orderPanelEnterClass(true, true)).toBe("opacity-100");
    expect(orderPanelEnterClass(true, false)).toBe("opacity-100");
    expect(orderPanelEnterClass(false, true)).toContain("duration-[220ms]");
    expect(orderContentSwapClass(false)).toContain("duration-[220ms]");
  });
});
