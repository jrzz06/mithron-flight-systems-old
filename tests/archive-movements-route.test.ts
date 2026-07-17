import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("inventory movement archival route", () => {
  it("supports Vercel cron and bearer CRON_SECRET auth", () => {
    const route = readFileSync(join(process.cwd(), "app/api/admin/archive-movements/route.ts"), "utf8");
    const vercel = readFileSync(join(process.cwd(), "vercel.json"), "utf8");
    const migration = readFileSync(
      join(process.cwd(), "supabase/migrations/20260623120000_catalog_search_movement_archive.sql"),
      "utf8"
    );

    expect(route).toContain("export async function GET");
    expect(route).toContain("export async function POST");
    expect(route).toContain("authorizeBearerSecret");
    expect(route).toContain("CRON_SECRET");
    expect(route).toContain("archive_inventory_movements");
    expect(vercel).toContain("/api/admin/archive-movements");
    expect(migration).toContain("inventory_movements_archive");
    expect(migration).toContain("search_published_products");
    expect(migration).toContain("mithron_products_search_vector_idx");
  });
});
