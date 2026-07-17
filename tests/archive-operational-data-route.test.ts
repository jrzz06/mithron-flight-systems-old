import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("operational data archival route", () => {
  it("supports Vercel cron and bearer CRON_SECRET auth", () => {
    const route = readFileSync(join(process.cwd(), "app/api/admin/archive-operational-data/route.ts"), "utf8");
    const vercel = readFileSync(join(process.cwd(), "vercel.json"), "utf8");
    const migration = readFileSync(
      join(process.cwd(), "supabase/migrations/20260710120000_operational_data_archive.sql"),
      "utf8"
    );
    const service = readFileSync(join(process.cwd(), "services/data-archive.ts"), "utf8");

    expect(route).toContain("export async function GET");
    expect(route).toContain("export async function POST");
    expect(route).toContain("authorizeBearerSecret");
    expect(route).toContain("CRON_SECRET");
    expect(route).toContain("archive_operational_data");
    expect(route).toContain("runOperationalDataArchive");
    expect(vercel).toContain("/api/admin/archive-operational-data");
    expect(migration).toContain("orders_archive");
    expect(migration).toContain("enquiries_archive");
    expect(migration).toContain("contact_requests_archive");
    expect(migration).toContain("activity_logs_archive");
    expect(migration).toContain("audit_logs_archive");
    expect(migration).toContain("mithron-data-archives");
    expect(migration).toContain("data_archive_runs");
    expect(service).toContain("OPERATIONAL_ARCHIVE_RETENTION_DAYS");
  });
});
