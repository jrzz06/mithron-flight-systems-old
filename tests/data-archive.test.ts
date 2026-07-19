import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  archiveCsvStoragePath,
  archiveSerializeCell,
  buildActivityLogsArchiveCsv,
  buildAuditLogsArchiveCsv,
  buildArchiveCsvDocument,
  buildContactRequestsArchiveCsv,
  buildEnquiriesArchiveCsv,
  buildOrdersArchiveCsv,
  operationalArchiveHotCutoffIso
} from "@/services/data-archive";

describe("data archive helpers", () => {
  it("builds monthly CSV storage paths", () => {
    expect(archiveCsvStoragePath("orders", "2026-07")).toBe("archives/2026-07/orders.csv");
    expect(archiveCsvStoragePath("contact_requests", "2026-07")).toBe("archives/2026-07/contact-requests.csv");
    expect(archiveCsvStoragePath("activity_logs", "2026-07")).toBe("archives/2026-07/activity-logs.csv");
  });

  it("computes a hot-window cutoff in the past", () => {
    const cutoff = operationalArchiveHotCutoffIso(30);
    expect(Date.parse(cutoff)).toBeLessThan(Date.now());
  });

  it("exports archive CSV headers and escaped values", () => {
    const ordersCsv = buildOrdersArchiveCsv([
      {
        id: "order-1",
        order_number: "ORD-1",
        customer_email: "a@example.com",
        status: "delivered",
        payment_status: "succeeded",
        fulfillment_status: "delivered",
        channel: "checkout",
        subtotal: 90,
        total: 100,
        currency: "INR",
        archived_at: "2026-07-01T00:00:00.000Z",
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-02T00:00:00.000Z"
      }
    ]);
    expect(ordersCsv.startsWith("\uFEFF")).toBe(true);
    expect(ordersCsv).toContain("order_number,customer_email,status");
    expect(ordersCsv).toContain("ORD-1");

    const enquiriesCsv = buildEnquiriesArchiveCsv([
      {
        id: "1",
        enquiry_number: 12,
        customer_email: "b@example.com",
        subject: "Quote, with comma",
        body: "Line one\nLine two",
        status: "lost",
        enquiry_kind: "product",
        related_product_slug: "ag10",
        archived_at: "",
        created_at: "",
        updated_at: ""
      }
    ]);
    expect(enquiriesCsv).toContain('"Quote, with comma"');
    expect(enquiriesCsv).toContain('"Line one\nLine two"');

    const contactsCsv = buildContactRequestsArchiveCsv([
      { id: "1", request_number: 3, customer_email: "c@example.com", customer_full_name: "Name", subject: "Help", status: "archived", archived_at: "", created_at: "", updated_at: "" }
    ]);
    expect(contactsCsv).toContain("request_number");

    const activityCsv = buildActivityLogsArchiveCsv([
      { id: "1", actor_id: null, action: "admin.archive", entity_table: "orders", entity_id: "1", severity: "info", metadata: { reason: "cleanup" }, archived_at: "", created_at: "" }
    ]);
    expect(activityCsv).toContain('"{""reason"":""cleanup""}"');

    const auditCsv = buildAuditLogsArchiveCsv([
      { id: "1", actor_id: null, action: "update", entity_table: "orders", entity_id: "1", archived_at: "", created_at: "" }
    ]);
    expect(auditCsv).toContain("entity_table");
  });

  it("quotes unsafe csv cells", () => {
    expect(archiveSerializeCell('Say "hello"')).toBe('"Say ""hello"""');
    expect(buildArchiveCsvDocument(["name"], [["comma,field"]])).toContain('"comma,field"');
  });

  it("applies hot-window filters in admin list services", () => {
    const admin = readFileSync(join(process.cwd(), "services/admin.ts"), "utf8");
    const ordersExport = readFileSync(join(process.cwd(), "services/orders-export.ts"), "utf8");

    expect(admin).toContain("operationalArchiveHotCutoffIso");
    expect(admin).toContain("created_at=gte.");
    expect(ordersExport).toContain("operationalArchiveHotCutoffIso");
  });

  it("exposes archives admin surface", () => {
    const page = readFileSync(join(process.cwd(), "app/admin/archives/page.tsx"), "utf8");
    const exportAllRoute = readFileSync(join(process.cwd(), "app/admin/archives/export/all/[entity]/route.ts"), "utf8");
    const settings = readFileSync(join(process.cwd(), "app/admin/settings/actions.ts"), "utf8");

    expect(page).toContain('redirect("/admin/orders")');
    expect(exportAllRoute).toContain("exportArchiveEntityCsvBySlug");
    expect(exportAllRoute).toContain("guardExportRoute");
    expect(settings).toContain("archive_operational_data");
  });
});
