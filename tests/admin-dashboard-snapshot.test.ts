import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatDashboardCount, orderNeedsAdminReview } from "@/services/admin";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("admin dashboard snapshot", () => {
  it("loads operational counts from Supabase instead of placeholder labels", () => {
    const adminService = source("services/admin.ts");
    const page = source("app/admin/page.tsx");

    expect(adminService).toContain("operationalCounts");
    expect(adminService).toContain("ordersNeedingReview");
    expect(adminService).toContain("workflow_status=eq.pending_review");
    expect(adminService).toContain("status=in.(paid,admin_review,pending_payment)");
    expect(adminService).toContain("stock_status=in.(low_stock,out_of_stock)");
    expect(adminService).toContain("enquiries.open");

    expect(page).toContain("formatDashboardCount");
    expect(page).toContain("operationalCounts.pendingSupplierSubmissions");
    expect(page).toContain("operationalCounts.openEnquiries");
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
