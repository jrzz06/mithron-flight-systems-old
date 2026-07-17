import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildHomepageOrderingDraftFromFormData } from "@/services/cms-admin-forms";

function formData(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

describe("homepage ordering CMS draft form", () => {
  it("maps form data into the registered homepage_ordering draft workflow input", () => {
    expect(buildHomepageOrderingDraftFromFormData(formData({
      section_key: "hero",
      sort_order: "10",
      is_visible: "on",
      change_summary: "Draft homepage ordering from admin CMS form"
    }))).toEqual({
      table: "homepage_ordering",
      identity: {
        section_key: "hero"
      },
      fields: {},
      entityId: "hero",
      sortOrder: 10,
      isVisible: true,
      changeSummary: "Draft homepage ordering from admin CMS form"
    });
  });

  it("wires the draft-only form action and page to the homepage ordering workflow", () => {
    const actionsSource = readFileSync(join(process.cwd(), "app/admin/cms/actions.ts"), "utf8");
    const pageSource = readFileSync(join(process.cwd(), "app/admin/cms/page.tsx"), "utf8");

    expect(actionsSource).toContain("saveHomepageOrderingDraftFormAction");
    expect(actionsSource).toContain("buildHomepageOrderingDraftFromFormData");
    expect(pageSource).not.toContain("data-cms-table=\"homepage_ordering\"");
    expect(pageSource).toContain("homepage-features");
  });
});
