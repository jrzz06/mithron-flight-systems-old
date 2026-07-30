import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("admin nav lead badges", () => {
  it("counts new leads in admin nav metrics", () => {
    const metrics = source("services/nav-metrics.ts");
    expect(metrics).toContain("newEnquiries");
    expect(metrics).toContain("newContactRequests");
    expect(metrics).toContain('countTable("leads", "status=eq.new")');
    expect(metrics).not.toContain('countTable("enquiries", "status=eq.new")');
    expect(metrics).not.toContain('countTable("contact_requests", "status=eq.new")');
  });

  it("maps leads nav href to lead badge metrics", () => {
    const nav = source("components/platform/platform-nav.tsx");
    expect(nav).toContain('href.startsWith("/admin/leads")');
    expect(nav).toContain("navMetrics.admin.newEnquiries");
    expect(nav).toContain("new leads");
  });

  it("refreshes admin nav metrics when lead tables change", () => {
    const provider = source("components/platform/control-plane-nav-metrics-provider.tsx");
    expect(provider).toContain('"leads"');
    expect(provider).toContain("newEnquiries");
    expect(provider).toContain("newContactRequests");
  });

  it("invalidates nav metrics cache on lead writes", () => {
    const revalidate = source("lib/control-plane/revalidate-realtime.ts");
    expect(revalidate).toContain("leads: { adminDashboard: true, adminEnquiries: true, navMetrics: true }");
    expect(revalidate).toContain('"/admin/leads"');
  });
});
