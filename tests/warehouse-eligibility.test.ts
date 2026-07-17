import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isAdminWarehouseReleased, isWarehouseEligible, matchesAdminOrderQueue } from "@/lib/orders/lifecycle";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("warehouse eligibility", () => {
  it("excludes unverified and deleted orders", () => {
    expect(isWarehouseEligible({
      status: "admin_review",
      payment_status: "succeeded",
      fulfillment_status: "pending"
    })).toBe(false);

    expect(isWarehouseEligible({
      status: "assigned",
      payment_status: "succeeded",
      fulfillment_status: "pending",
      deleted_at: "2026-01-01T00:00:00.000Z"
    })).toBe(false);

    expect(isWarehouseEligible({
      status: "assigned",
      payment_status: "succeeded",
      fulfillment_status: "pending"
    })).toBe(true);
  });

  it("allows admin-released warehouse orders with unpaid payment", () => {
    expect(isAdminWarehouseReleased({
      status: "processing",
      payment_status: "requires_payment"
    })).toBe(true);

    expect(isWarehouseEligible({
      status: "processing",
      payment_status: "requires_payment",
      fulfillment_status: "processing"
    })).toBe(true);

    expect(isWarehouseEligible({
      status: "confirmed",
      payment_status: "requires_payment",
      fulfillment_status: "pending"
    })).toBe(false);

    expect(isWarehouseEligible({
      status: "admin_review",
      payment_status: "requires_payment",
      fulfillment_status: "pending"
    })).toBe(false);
  });

  it("filters warehouse snapshot orders with isWarehouseEligible", () => {
    const adminService = source("services/admin.ts");
    expect(adminService).toContain("isWarehouseEligible");
    expect(adminService).toContain('ordersFilter?: "all" | "warehouse"');
    expect(adminService).toContain("ordersFilter === \"warehouse\"");
  });

  it("uses shared warehouse eligibility in fulfillment queue", () => {
    const fulfillmentPage = source("app/warehouse/fulfillment/page.tsx");
    expect(fulfillmentPage).toContain("getWarehouseSnapshot");
    expect(fulfillmentPage).toContain("filterOrdersForWarehouseScope");
  });

  it("maps admin queues for pending verification and warehouse", () => {
    expect(matchesAdminOrderQueue({ status: "paid", payment_status: "succeeded" }, "pending_verification")).toBe(true);
    expect(matchesAdminOrderQueue({ status: "assigned", payment_status: "succeeded" }, "warehouse")).toBe(true);
    expect(matchesAdminOrderQueue({ status: "admin_review", payment_status: "succeeded" }, "warehouse")).toBe(false);
  });
});
