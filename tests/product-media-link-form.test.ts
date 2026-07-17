import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildProductMediaLinkFromFormData } from "@/services/product-admin-forms";

function formData(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

describe("product media link draft form", () => {
  it("maps product media link form data into an auditable product_media_assets workflow input", () => {
    expect(buildProductMediaLinkFromFormData(formData({
      product_slug: "source-agri-kisan-drone-small-8-liter",
      media_asset_id: "media-atlas",
      usage: "gallery",
      sort_order: "14",
      is_primary: "on",
      change_summary: "Link product hero media"
    }))).toEqual({
      table: "product_media_assets",
      identity: {
        product_slug: "source-agri-kisan-drone-small-8-liter",
        media_asset_id: "media-atlas",
        usage: "gallery"
      },
      fields: {
        sort_order: 14,
        is_primary: true
      },
      entityId: "source-agri-kisan-drone-small-8-liter:media-atlas:gallery",
      changeSummary: "Link product hero media"
    });
  });

  it("wires the product media link form to the server action and admin page without changing storefront loaders", () => {
    const pageSource = readFileSync(join(process.cwd(), "app/admin/products/page.tsx"), "utf8");
    const actionSource = readFileSync(join(process.cwd(), "app/admin/products/actions.ts"), "utf8");

    expect(pageSource).toContain("saveProductMediaLinkFormAction");
    expect(pageSource).toContain("data-product-media-table=\"product_media_assets\"");
    expect(actionSource).toContain("buildProductMediaLinkFromFormData");
    expect(actionSource).toContain("saveProductMediaLinkFormAction");
    expect(actionSource).toContain("upsertProductMediaAssetRecord");
  });
});
