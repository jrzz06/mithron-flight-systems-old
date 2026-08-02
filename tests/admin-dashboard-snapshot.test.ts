import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatDashboardCount, orderNeedsAdminReview } from "@/services/admin";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("admin dashboard snapshot", () => {
  it("loads operational order counts from Supabase instead of placeholder labels", () => {
    const adminService = source("services/admin.ts");
    const page = source("app/admin/page.tsx");

    expect(adminService).toContain("operationalCounts");
    expect(adminService).toContain("ordersNeedingReview");
    expect(adminService).toContain("ordersReceivedToday");
    expect(adminService).toContain("ordersPushedToWarehouse");
    expect(adminService).toContain("ordersDispatchedToday");
    expect(adminService).toContain("adminIstDayBounds");
    expect(adminService).toContain("Asia/Kolkata");
    expect(adminService).toContain("status=in.(paid,admin_review,pending_payment)");
    expect(adminService).toContain("fulfillment_status=in.(dispatched,delivered)");
    expect(adminService).toContain("fulfillment_status.in.(packing,processing,picked,packed,ready_to_dispatch)");
    expect(adminService).toContain("fulfillment_status.not.in.(dispatched,delivered,shipped)");
    expect(adminService).toContain("mithron_products(name)");

    expect(page).toContain("formatDashboardCount");
    expect(page).toContain("operationalCounts.ordersReceivedToday");
    expect(page).toContain("operationalCounts.pendingOrdersReview");
    expect(page).toContain("operationalCounts.pushedToWarehouse");
    expect(page).toContain("operationalCounts.dispatchedToday");
    expect(page).toContain("Orders received today");
    expect(page).toContain("Pending review");
    expect(page).toContain("Pushed to warehouse");
    expect(page).toContain("Dispatched today");
    expect(page).not.toContain("Customer leads");
    expect(page).not.toContain("Review queue");
    expect(page).not.toContain("Open queue");
  });

  it("matches admin order review rules used on the orders workspace", () => {
    expect(orderNeedsAdminReview({ status: "paid", channel: "checkout" })).toBe(true);
    expect(orderNeedsAdminReview({ status: "admin_review", channel: "enquiry" })).toBe(true);
    expect(orderNeedsAdminReview({ status: "delivered", channel: "checkout" })).toBe(false);
  });

  it("formats unavailable counts for the operational snapshot cards", () => {
    expect(formatDashboardCount({ table: "orders", count: 4, status: "LIVE" })).toBe("4");
    expect(formatDashboardCount({ table: "orders", count: 0, status: "UNAVAILABLE" })).toBe("—");
  });
});
