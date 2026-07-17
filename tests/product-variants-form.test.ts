import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildProductVariantsWorkflowFromFormData } from "@/services/product-admin-forms";

function formData(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

describe("product variants workflow", () => {
  it("maps product variants form data into an auditable mithron_products workflow input", () => {
    expect(buildProductVariantsWorkflowFromFormData(formData({
      product_slug: "source-agri-kisan-drone-small-8-liter",
      variants: "[{\"id\":\"base\",\"name\":\"Base\",\"tone\":\"#f2f4f6\",\"media_asset_id\":\"media-atlas\",\"inventory_sku\":\"AG-8L-BASE\"}]",
      change_summary: "Update product variants"
    }))).toEqual({
      table: "mithron_products",
      identity: {
        slug: "source-agri-kisan-drone-small-8-liter"
      },
      fields: {
        variants: [{
          id: "base",
          name: "Base",
          tone: "#f2f4f6",
          media_asset_id: "media-atlas",
          inventory_sku: "AG-8L-BASE"
        }]
      },
      entityId: "source-agri-kisan-drone-small-8-liter",
      changeSummary: "Update product variants"
    });
  });

  it("wires the product variants form to the server action and admin page without changing storefront loaders", () => {
    const pageSource = readFileSync(join(process.cwd(), "app/admin/products/page.tsx"), "utf8");
    const actionSource = readFileSync(join(process.cwd(), "app/admin/products/actions.ts"), "utf8");

    expect(pageSource).toContain("saveProductVariantsFormAction");
    expect(pageSource).toContain("data-product-variants-table=\"mithron_products\"");
    expect(actionSource).toContain("buildProductVariantsWorkflowFromFormData");
    expect(actionSource).toContain("saveProductVariantsFormAction");
    expect(actionSource).toContain("updateAdminRecord");
  });
});
