import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("product merge rpc migration", () => {
  it("ships merge audit table and merge_product_into_canonical RPC", () => {
    const migration = source("supabase/migrations/20260623100000_product_merge_audit.sql");

    expect(migration).toContain("create table if not exists public.product_merge_audit");
    expect(migration).toContain("merged_into_slug");
    expect(migration).toContain("merge_status");
    expect(migration).toContain("create or replace function public.merge_product_into_canonical");
    expect(migration).toContain("update public.order_items");
    expect(migration).toContain("update public.product_media_assets");
    expect(migration).toContain("update public.warehouse_stock");
    expect(migration).toContain("update public.inventory");
    expect(migration).toContain("workflow_status = 'archived'");
    expect(migration).toContain("merge_status = 'archived_merged'");
    expect(migration).not.toContain("delete from public.mithron_products");
  });
});
