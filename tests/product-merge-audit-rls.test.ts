import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readMigration(name: string) {
  return readFileSync(join(process.cwd(), "supabase", "migrations", name), "utf8");
}

describe("product_merge_audit RLS", () => {
  it("enables RLS and restricts access to service_role in the base migration", () => {
    const sql = readMigration("20260623100000_product_merge_audit.sql");

    expect(sql).toContain("alter table public.product_merge_audit enable row level security");
    expect(sql).toContain("product_merge_audit service role manage");
    expect(sql).toContain("to service_role");
    expect(sql).toContain("revoke all on table public.product_merge_audit from anon, authenticated");
  });

  it("includes idempotent RLS hardening follow-up migration", () => {
    const sql = readMigration("20260624000100_product_merge_audit_rls_hardening.sql");

    expect(sql).toContain("enable row level security");
    expect(sql).toContain("product_merge_audit service role manage");
    expect(sql).toContain("revoke all on table public.product_merge_audit from anon, authenticated");
  });

  it("restricts merge RPC to service_role in the base migration", () => {
    const sql = readMigration("20260623100000_product_merge_audit.sql");

    expect(sql).toContain("revoke all on function public.merge_product_into_canonical");
    expect(sql).toContain("grant execute on function public.merge_product_into_canonical");
  });
});
