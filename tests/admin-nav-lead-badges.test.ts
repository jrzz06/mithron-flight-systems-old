import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("admin nav lead badges", () => {
  it("counts new enquiries and contact requests in admin nav metrics", () => {
    const metrics = source("services/nav-metrics.ts");
    expect(metrics).toContain("newEnquiries");
    expect(metrics).toContain("newContactRequests");
    expect(metrics).toContain('countTable("enquiries", "status=eq.new")');
    expect(metrics).toContain('countTable("contact_requests", "status=eq.new")');
  });

  it("maps fulfillment nav hrefs to lead badge metrics", () => {
    const nav = source("components/platform/platform-nav.tsx");
    expect(nav).toContain('href.startsWith("/admin/enquiries")');
    expect(nav).toContain("navMetrics.admin.newEnquiries");
    expect(nav).toContain('href.startsWith("/admin/contact-requests")');
    expect(nav).toContain("navMetrics.admin.newContactRequests");
    expect(nav).toContain("new enquiries");
    expect(nav).toContain("new contact requests");
  });

  it("refreshes admin nav metrics when lead tables change", () => {
    const provider = source("components/platform/control-plane-nav-metrics-provider.tsx");
    expect(provider).toContain('"enquiries"');
    expect(provider).toContain('"contact_requests"');
    expect(provider).toContain("newEnquiries");
    expect(provider).toContain("newContactRequests");
  });

  it("invalidates nav metrics cache on enquiry and contact request writes", () => {
    const revalidate = source("lib/control-plane/revalidate-realtime.ts");
    expect(revalidate).toContain("enquiries: { adminDashboard: true, adminEnquiries: true, navMetrics: true }");
    expect(revalidate).toContain("contact_requests: { adminDashboard: true, adminEnquiries: true, navMetrics: true }");
    expect(revalidate).toContain('"/admin/contact-requests"');
  });
});
