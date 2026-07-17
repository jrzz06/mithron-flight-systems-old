import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function migration(name: string) {
  return readFileSync(join(process.cwd(), "supabase/migrations", name), "utf8");
}

describe("procurement platform baseline migration", () => {
  const sql = migration("20260611000100_procurement_platform_baseline.sql");

  it("seeds supplier role and procurement permissions", () => {
    expect(sql).toContain("('supplier', 'Supplier'");
    expect(sql).toContain("('products.submit'");
    expect(sql).toContain("('enquiries.read'");
    expect(sql).toContain("('enquiries.write'");
    expect(sql).toContain("('payments.write'");
    expect(sql).toContain("('reports.read'");
    expect(sql).toContain("('supplier', 'products.submit')");
    expect(sql).toContain("('user', 'enquiries.write')");
  });

  it("extends product workflow and supplier ownership columns", () => {
    expect(sql).toContain("supplier_id");
    expect(sql).toContain("submitted_by");
    expect(sql).toContain("rejection_reason");
    expect(sql).toContain("pending_review");
    expect(sql).toContain("rejected");
  });

  it("creates enquiries, customer_addresses, and payments tables with RLS", () => {
    expect(sql).toContain("create table if not exists public.enquiries");
    expect(sql).toContain("create table if not exists public.customer_addresses");
    expect(sql).toContain("create table if not exists public.payments");
    expect(sql).toContain('"enquiries customer read own"');
    expect(sql).toContain('"customer addresses self read"');
    expect(sql).toContain('"payments customer read own order"');
    expect(sql).toContain('"orders customer read own"');
  });

  it("updates current_enterprise_role priority for supplier and user", () => {
    expect(sql).toContain("('supplier', 55)");
    expect(sql).toContain("('user', 95)");
  });

  it("exists on disk", () => {
    expect(existsSync(join(process.cwd(), "supabase/migrations/20260611000100_procurement_platform_baseline.sql"))).toBe(true);
  });
});
