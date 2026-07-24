import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("inventory permanent delete from admin", () => {
  it("wires permanent delete only for archived inventory rows through product hard-delete pipeline", () => {
    const manager = source("components/admin/inventory-manager.tsx");
    const bridge = source("components/admin/inventory-action-bridge.tsx");
    const page = source("app/admin/inventory/page.tsx");
    const actions = source("app/admin/inventory/actions.ts");

    expect(actions).toContain("permanentDeleteAdminInventoryAction");
    expect(actions).toContain("forceDeleteAdminInventoryAction");
    expect(actions).toContain("previewInventoryProductDeleteAction");
    expect(actions).toContain('mode: "hard"');
    expect(actions).toContain('mode: "force_hard"');
    expect(actions).toContain("deleteOrArchiveProduct");
    expect(actions).toContain('requireAdminPermission("products.permanent_delete")');

    expect(page).toContain("permanentDeleteAdminInventoryAction");
    expect(page).toContain("forceDeleteAdminInventoryAction");
    expect(page).toContain("canForceDelete");
    expect(page).toContain('roleHasPermission(authContext.role, "products.permanent_delete")');
    expect(page).toContain("InventoryActionBridge");

    expect(bridge).toContain("permanentDeleteAction");
    expect(bridge).toContain("forceDeleteAction");
    expect(bridge).toContain("canForceDelete");
    expect(bridge).toContain("removeOnSuccess");

    expect(manager).toContain('data-inventory-action="permanent-delete"');
    expect(manager).toContain("data-inventory-delete-modal");
    expect(manager).toContain("showPermanentDelete={Boolean(permanentDeleteAction) && row.isArchived}");
    expect(manager).toContain("requireTypedText={deleteRow.productSlug}");
    expect(manager).toContain("previewInventoryProductDeleteAction");
    expect(manager).toContain("Force delete product");
    expect(manager).not.toContain('data-inventory-action="hard-delete"');
  });

  it("keeps product, order, and lead hard-delete wiring unchanged", () => {
    const productGrid = source("app/admin/products/product-catalog-grid.tsx");
    const productActions = source("app/admin/products/actions.ts");
    const orderActions = source("app/admin/orders/actions.ts");
    const orderWorkflow = source("services/order-workflow.ts");
    const leads = source("services/leads.ts");
    const leadQueue = source("components/admin/admin-lead-queue.tsx");

    expect(productGrid).toContain('data-product-row-action={isArchivedView ? "permanent-delete" : "remove"}');
    expect(productActions).toContain("saveProductHardDeleteFormAction");
    expect(productActions).toContain("saveProductForceDeleteFormAction");
    expect(orderActions).toContain("permanentDeleteAdminOrderFormAction");
    expect(orderWorkflow).toContain("permanentDeleteAdminOrderWorkflow");
    expect(leads).toContain('deleteAdminRecord("leads"');
    expect(leadQueue).toContain("deleteLead");
  });
});
