import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "supabase", "migrations");

function findMigration(suffix: string) {
  return readdirSync(migrationsDir).find((name) => name.endsWith(suffix)) ?? null;
}

describe("checkout price revalidation", () => {
  it("re-validates unit_price against mithron_products inside create_checkout_order", () => {
    const name = findMigration("_checkout_price_revalidation.sql");
    expect(name).toBeTruthy();
    const sql = readFileSync(join(migrationsDir, name!), "utf8");

    expect(sql).toContain("create or replace function public.create_checkout_order");
    expect(sql).toContain("from public.mithron_products mp");
    expect(sql).toContain("Checkout unit_price mismatch");
    expect(sql).toContain("Unknown product slug in checkout order");
    expect(sql).toContain("grant execute on function public.create_checkout_order(jsonb, jsonb, text) to service_role");
    expect(sql).toContain("revoke all on function public.create_checkout_order(jsonb, jsonb, text) from authenticated");
  });
});
