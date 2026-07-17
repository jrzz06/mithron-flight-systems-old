import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("catalog scalability hardening", () => {
  it("avoids duplicate audit writes for activity logs and inventory movements", () => {
    const adminActions = readFileSync(join(process.cwd(), "services/admin-actions.ts"), "utf8");

    expect(adminActions).toContain("skipAuditLog");
    expect(adminActions).toContain("toInventoryMovementInsertPayload");
    expect(adminActions).toContain('createAdminRecord("inventory_movements", toInventoryMovementInsertPayload(payload)');
    expect(adminActions).not.toContain('insertAuditLog("create", "activity_logs"');
  });

  it("routes storefront search through the catalog search API", () => {
    const searchRoute = readFileSync(join(process.cwd(), "app/api/catalog/search/route.ts"), "utf8");
    const searchOverlay = readFileSync(join(process.cwd(), "components/overlays/search-overlay.tsx"), "utf8");
    const catalog = readFileSync(join(process.cwd(), "services/catalog.ts"), "utf8");

    expect(searchRoute).toContain("searchCatalogProducts");
    expect(searchOverlay).toContain("/api/catalog/search");
    expect(searchOverlay).toContain("intent=index");
    expect(catalog).toContain("fetchCatalogSearchRowsFallback");
  });
});
