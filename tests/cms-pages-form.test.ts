import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCmsPageDraftFromFormData } from "@/services/cms-admin-forms";

function formData(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

describe("cms pages draft form", () => {
  it("maps cms page form data into the registered cms_pages draft workflow input", () => {
    expect(buildCmsPageDraftFromFormData(formData({
      id: "home",
      slug: "home",
      title: "Homepage",
      route_path: "/",
      meta_title: "Mithron Drone Ecosystem",
      meta_description: "Premium aerospace ecommerce homepage controlled by Supabase CMS.",
      payload: "{\"source\":\"cms_pages\",\"variant\":\"home\"}",
      sort_order: "10",
      is_visible: "on",
      change_summary: "Draft cms page from admin CMS form"
    }))).toEqual({
      table: "cms_pages",
      identity: {
        id: "home",
        slug: "home"
      },
      fields: {
        title: "Homepage",
        route_path: "/",
        meta_title: "Mithron Drone Ecosystem",
        meta_description: "Premium aerospace ecommerce homepage controlled by Supabase CMS.",
        payload: {
          source: "cms_pages",
          variant: "home"
        }
      },
      entityId: "home",
      sortOrder: 10,
      isVisible: true,
      changeSummary: "Draft cms page from admin CMS form"
    });
  });

  it("wires the draft-only cms pages form to the server action and admin page without changing storefront loaders", () => {
    const pageSource = readFileSync(join(process.cwd(), "app/admin/cms/page.tsx"), "utf8");
    const workspaceSource = readFileSync(join(process.cwd(), "features/admin/cms/cms-visual-workspace.tsx"), "utf8");
    const actionSource = readFileSync(join(process.cwd(), "app/admin/cms/actions.ts"), "utf8");

    expect(pageSource).not.toContain("data-cms-table=\"cms_pages\"");
    expect(workspaceSource).toContain("data-cms-visual-editor");
    expect(actionSource).toContain("buildCmsPageDraftFromFormData");
    expect(actionSource).toContain("saveCmsPageDraftFormAction");
    expect(actionSource).not.toContain("getPublicCmsSnapshot");
  });
});

