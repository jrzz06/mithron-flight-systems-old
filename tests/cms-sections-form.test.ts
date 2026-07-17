import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCmsSectionDraftFromFormData } from "@/services/cms-admin-forms";

function formData(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

describe("cms sections draft form", () => {
  it("maps cms section form data into the registered cms_sections draft workflow input", () => {
    expect(buildCmsSectionDraftFromFormData(formData({
      id: "section-home-hero",
      page_id: "home",
      section_key: "hero",
      component_key: "HeroCarousel",
      title: "Homepage hero",
      payload: "{\"source\":\"hero_banners\",\"variant\":\"hero\"}",
      sort_order: "15",
      is_visible: "on",
      change_summary: "Draft cms section from admin CMS form"
    }))).toEqual({
      table: "cms_sections",
      identity: {
        page_id: "home",
        section_key: "hero"
      },
      fields: {
        component_key: "HeroCarousel",
        title: "Homepage hero",
        payload: {
          source: "hero_banners",
          variant: "hero"
        }
      },
      entityId: "home:hero",
      sortOrder: 15,
      isVisible: true,
      changeSummary: "Draft cms section from admin CMS form"
    });
  });

  it("wires the draft-only cms sections form to the server action and admin page without changing storefront loaders", () => {
    const pageSource = readFileSync(join(process.cwd(), "app/admin/cms/page.tsx"), "utf8");
    const workspaceSource = readFileSync(join(process.cwd(), "features/admin/cms/cms-visual-workspace.tsx"), "utf8");
    const actionSource = readFileSync(join(process.cwd(), "app/admin/cms/actions.ts"), "utf8");

    expect(pageSource).not.toContain("data-cms-table=\"cms_sections\"");
    expect(workspaceSource).not.toContain("homepage_sections");
    expect(actionSource).toContain("buildCmsSectionDraftFromFormData");
    expect(actionSource).toContain("saveCmsSectionDraftFormAction");
    expect(actionSource).not.toContain("getPublicCmsSnapshot");
  });
});

