import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildFooterColumnDraftFromFormData, buildFooterLinkDraftFromFormData } from "@/services/cms-admin-forms";

function formData(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

describe("footer CMS draft forms", () => {
  it("maps footer column form data into the registered footer_columns draft workflow input", () => {
    expect(buildFooterColumnDraftFromFormData(formData({
      id: "footer-products",
      title: "Products",
      sort_order: "20",
      is_visible: "on",
      change_summary: "Draft footer column from admin CMS form"
    }))).toEqual({
      table: "footer_columns",
      identity: {
        id: "footer-products"
      },
      fields: {
        title: "Products"
      },
      entityId: "footer-products",
      sortOrder: 20,
      isVisible: true,
      changeSummary: "Draft footer column from admin CMS form"
    });
  });

  it("maps footer link form data into the registered footer_links draft workflow input", () => {
    expect(buildFooterLinkDraftFromFormData(formData({
      id: "footer-precision-spraying",
      column_id: "footer-products",
      label: "Precision Spraying",
      href: "/agriculture",
      sort_order: "21",
      is_visible: "on",
      change_summary: "Draft footer link from admin CMS form"
    }))).toEqual({
      table: "footer_links",
      identity: {
        id: "footer-precision-spraying"
      },
      fields: {
        column_id: "footer-products",
        label: "Precision Spraying",
        href: "/agriculture"
      },
      entityId: "footer-precision-spraying",
      sortOrder: 21,
      isVisible: true,
      changeSummary: "Draft footer link from admin CMS form"
    });
  });

  it("wires footer draft forms to the server action and admin page without changing storefront loaders", () => {
    const workspaceSource = readFileSync(join(process.cwd(), "features/admin/cms/cms-visual-workspace.tsx"), "utf8");
    const actionSource = readFileSync(join(process.cwd(), "app/admin/cms/actions.ts"), "utf8");

    expect(workspaceSource).toContain("saveFooterColumnDraftFormAction");
    expect(workspaceSource).toContain("saveFooterLinkDraftFormAction");
    expect(workspaceSource).toContain("data-cms-table=\"footer_columns\"");
    expect(workspaceSource).toContain("data-cms-table=\"footer_links\"");
    expect(actionSource).toContain("buildFooterColumnDraftFromFormData");
    expect(actionSource).toContain("buildFooterLinkDraftFromFormData");
    expect(actionSource).toContain("saveFooterColumnDraftFormAction");
    expect(actionSource).toContain("saveFooterLinkDraftFormAction");
    expect(actionSource).not.toContain("getPublicCmsSnapshot");
  });
});

