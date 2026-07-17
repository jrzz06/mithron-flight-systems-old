import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "supabase", "migrations");

function readMigration(name: string) {
  return readFileSync(join(migrationsDir, name), "utf8");
}

function findLockCustomerOrderWritesMigration() {
  return readdirSync(migrationsDir).find((name) => name.endsWith("_lock_customer_order_writes.sql")) ?? null;
}

describe("order RLS integrity", () => {
  it("preserves customer SELECT of own orders in the consolidate migration", () => {
    const sql = readMigration("20260727000300_audit_remediation_consolidate_rls_policies.sql");

    expect(sql).toContain('create policy "orders select combined" on public.orders');
    expect(sql).toContain("created_by_user_id = (select auth.uid())");
    expect(sql).toContain('create policy "order_items select combined" on public.order_items');
  });

  it("keeps orders.checkout as an application permission for customers", () => {
    const permissions = readFileSync(join(process.cwd(), "lib", "auth", "permissions.ts"), "utf8");
    expect(permissions).toContain('"orders.checkout"');
    expect(permissions).toMatch(/user:\s*\[[^\]]*orders\.checkout/);
  });

  it("ships an additive lock migration that removes customer write branches", () => {
    const lockName = findLockCustomerOrderWritesMigration();
    expect(lockName).toBeTruthy();
    expect(existsSync(join(migrationsDir, lockName!))).toBe(true);

    const sql = readMigration(lockName!);

    expect(sql).toContain('drop policy if exists "orders lifecycle write" on public.orders');
    expect(sql).toContain('drop policy if exists "orders lifecycle write update" on public.orders');
    expect(sql).toContain('drop policy if exists "orders lifecycle write delete" on public.orders');
    expect(sql).toContain('drop policy if exists "order_items lifecycle write" on public.order_items');
    expect(sql).toContain('drop policy if exists "order_items lifecycle write update" on public.order_items');
    expect(sql).toContain('drop policy if exists "order_items lifecycle write delete" on public.order_items');

    expect(sql).toContain('create policy "orders lifecycle write" on public.orders');
    expect(sql).toContain('create policy "orders lifecycle write update" on public.orders');
    expect(sql).toContain('create policy "orders lifecycle write delete" on public.orders');
    expect(sql).toContain('create policy "order_items lifecycle write" on public.order_items');
    expect(sql).toContain('create policy "order_items lifecycle write update" on public.order_items');
    expect(sql).toContain('create policy "order_items lifecycle write delete" on public.order_items');

    // Staff-only write quals — no orders.checkout customer branch.
    expect(sql).not.toMatch(
      /create policy "orders lifecycle write[\s\S]*?has_cms_permission\('orders\.checkout'/
    );
    expect(sql).not.toMatch(
      /create policy "order_items lifecycle write[\s\S]*?has_cms_permission\('orders\.checkout'/
    );
    expect(sql).toContain("has_any_cms_permission(array['orders.lifecycle'::text, 'orders.write'::text])");
  });

  it("does not remove customer SELECT policies in the lock migration", () => {
    const lockName = findLockCustomerOrderWritesMigration();
    expect(lockName).toBeTruthy();
    const sql = readMigration(lockName!);

    expect(sql).not.toContain('drop policy if exists "orders select combined"');
    expect(sql).not.toContain('drop policy if exists "order_items select combined"');
  });
});
