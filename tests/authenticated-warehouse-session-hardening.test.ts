import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("authenticated warehouse operational hardening verifier", () => {
  it("keeps the authenticated warehouse-session verifier real but reversible by default", () => {
    const scriptPath = join(process.cwd(), "tools", "verify-authenticated-warehouse-session.mjs");
    expect(existsSync(scriptPath)).toBe(true);
    const script = readFileSync(scriptPath, "utf8");

    expect(script).toContain("createWarehouseVerificationUser");
    expect(script).toContain("warehouse");
    expect(script).not.toContain("warehouse_manager");
    expect(script).toContain("profiles");
    expect(script).toContain("user_roles");
    expect(script).toContain("signInWithPassword");
    expect(script).toContain("/login?next=/warehouse/fulfillment");
    expect(script).toContain("/admin/cms");
    expect(script).toContain("data-warehouse-fulfillment-route");
    expect(script).toContain("/warehouse/fulfillment");
    expect(script).toContain("persistAuthenticatedWarehouseRows");
    expect(script).not.toContain("persistDurableWarehouseRows");
    expect(script).toContain("WAREHOUSE_HARDENING_RUN_ID");
    expect(script).toContain("WAREHOUSE_HARDENING_RETAIN_ROWS");
    expect(script).toContain("cleanupAuthenticatedWarehouseRows");
    expect(script).toContain("verified_reversible");
    expect(script).not.toContain('const sku = process.env.WAREHOUSE_HARDENING_SKU ?? "HARDENING-AG-8L-BASE";');
    expect(script).not.toContain('const warehouseCode = process.env.WAREHOUSE_HARDENING_WAREHOUSE ?? "IN-WEST-01";');
  });

  it("keeps the authenticated warehouse-session verifier script on disk", () => {
    const scriptPath = join(process.cwd(), "tools", "verify-authenticated-warehouse-session.mjs");
    expect(existsSync(scriptPath)).toBe(true);
  });
});
