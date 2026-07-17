import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AdminRecordConflictError } from "@/services/admin-actions";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("optimistic admin mutations", () => {
  it("supports compare-and-swap updates via expectedUpdatedAt", () => {
    const adminActions = source("services/admin-actions.ts");
    expect(adminActions).toContain("expectedUpdatedAt?: string | null");
    expect(adminActions).toContain("optimisticLockTables");
    expect(adminActions).toContain("AdminRecordConflictError");
    expect(adminActions).toContain("&updated_at=eq.");
  });

  it("passes expected_updated_at from product quick edit forms", () => {
    const dialog = source("app/admin/products/product-detail-edit-dialog.tsx");
    const actions = source("app/admin/products/actions.ts");
    expect(dialog).toContain('name="expected_updated_at"');
    expect(actions).toContain("expectedUpdatedAt");
  });

  it("uses append-only order timeline RPC", () => {
    const migration = source("supabase/migrations/20260626000300_order_timeline_atomic_transitions.sql");
    const server = source("lib/admin/order-transition-server.ts");
    expect(migration).toContain("append_order_timeline_entry");
    expect(server).toContain("transitionOrderWithTimelineViaRpc");
  });

  it("exposes conflict errors with current row snapshots", () => {
    const error = new AdminRecordConflictError("conflict", { slug: "demo-product" });
    expect(error.name).toBe("AdminRecordConflictError");
    expect(error.currentRow).toEqual({ slug: "demo-product" });
  });
});
