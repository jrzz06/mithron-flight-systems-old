import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildProductDeleteFromFormData, buildProductPublishStateFromFormData } from "@/services/product-admin-forms";

function formData(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

describe("product publish workflow", () => {
  it("maps product publish form data into an auditable mithron_products workflow input", () => {
    expect(buildProductPublishStateFromFormData(formData({
      product_slug: "source-agri-kisan-drone-small-8-liter",
      workflow_status: "archived",
      is_visible: "off",
      change_summary: "Archive discontinued product"
    }))).toEqual({
      table: "mithron_products",
      identity: {
        slug: "source-agri-kisan-drone-small-8-liter"
      },
      fields: {
        workflow_status: "archived",
        is_visible: false
      },
      entityId: "source-agri-kisan-drone-small-8-liter",
      changeSummary: "Archive discontinued product"
    });
  });

  it("wires the product publish workflow to the server action and admin page without changing storefront loaders", () => {
    const pageSource = readFileSync(join(process.cwd(), "app/admin/products/page.tsx"), "utf8");
    const actionSource = readFileSync(join(process.cwd(), "app/admin/products/actions.ts"), "utf8");
    const catalogSource = readFileSync(join(process.cwd(), "services/catalog.ts"), "utf8");

    expect(pageSource).toContain("saveProductPublishStateFormAction");
    expect(pageSource).toContain("data-product-publish-table=\"mithron_products\"");
    expect(actionSource).toContain("buildProductPublishStateFromFormData");
    expect(actionSource).toContain("saveProductPublishStateFormAction");
    expect(catalogSource).toContain("workflow_status=eq.published");
  });

  it("maps product hard delete form data with explicit confirmation", () => {
    expect(buildProductDeleteFromFormData(formData({
      product_slug: "source-delete-me",
      confirm_slug: "source-delete-me",
      change_summary: "Remove duplicate draft"
    }))).toEqual({
      table: "mithron_products",
      identity: {
        slug: "source-delete-me"
      },
      fields: {
        confirm_slug: "source-delete-me"
      },
      entityId: "source-delete-me",
      changeSummary: "Remove duplicate draft"
    });
  });

  it("rejects product hard delete when confirmation does not match slug", () => {
    expect(() => buildProductDeleteFromFormData(formData({
      product_slug: "source-delete-me",
      confirm_slug: "wrong-product"
    }))).toThrow("Product delete confirmation must match the product slug exactly.");
  });

  it("wires row-level product remove and archived permanent delete to guarded server actions", () => {
    const pageSource = readFileSync(join(process.cwd(), "app/admin/products/page.tsx"), "utf8");
    const gridSource = readFileSync(join(process.cwd(), "app/admin/products/product-catalog-grid.tsx"), "utf8");
    const actionSource = readFileSync(join(process.cwd(), "app/admin/products/actions.ts"), "utf8");

    expect(pageSource).toContain("ProductCatalogGrid");
    expect(gridSource).toContain("ProductPublishToggle");
    expect(gridSource).toContain("data-product-row-action=\"publish\"");
    expect(gridSource).toContain("saveProductRemoveFormAction");
    expect(gridSource).toContain("saveProductHardDeleteFormAction");
    expect(gridSource).toContain("saveProductForceDeleteFormAction");
    expect(gridSource).toContain('data-product-row-action={isArchivedView ? "permanent-delete" : "remove"}');
    expect(gridSource).toContain("name=\"confirm_slug\"");
    expect(pageSource).not.toContain("data-product-hard-delete-table=\"mithron_products\"");
    expect(pageSource).not.toContain("Hard delete product");
    expect(pageSource).not.toContain("data-product-row-action=\"hard-delete\"");
    expect(actionSource).toContain("buildProductRemoveFromFormData");
    expect(actionSource).toContain("buildProductDeleteFromFormData");
    expect(actionSource).toContain("deleteOrArchiveProduct");
    expect(actionSource).toContain("products.archive");
    expect(actionSource).toContain("products.hard_delete");
  });
});
