import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildContentRevisionRecordFromFormData } from "@/services/cms-admin-forms";

function formData(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

describe("content revisions admin form", () => {
  it("maps form data into a direct content revision record request without requiring local revision state", () => {
    expect(buildContentRevisionRecordFromFormData(formData({
      entity_table: "hero_banners",
      entity_id: "hero-agriculture",
      snapshot: "{\"id\":\"hero-agriculture\",\"title\":\"Agriculture\",\"status\":\"draft\"}",
      change_summary: "Record hero banner revision"
    }))).toEqual({
      table: "hero_banners",
      entityId: "hero-agriculture",
      snapshot: {
        id: "hero-agriculture",
        title: "Agriculture",
        status: "draft"
      },
      changeSummary: "Record hero banner revision"
    });
  });

  it("wires the content revisions form to the server action and admin page without changing storefront loaders", () => {
    const workspaceSource = readFileSync(join(process.cwd(), "features/admin/cms/cms-visual-workspace.tsx"), "utf8");
    const actionSource = readFileSync(join(process.cwd(), "app/admin/cms/actions.ts"), "utf8");

    expect(workspaceSource).not.toContain("data-cms-table=\"content_revisions\"");
    expect(workspaceSource).toContain("data-content-revision-timeline");
    expect(actionSource).toContain("buildContentRevisionRecordFromFormData");
    expect(actionSource).toContain("recordContentRevisionFormAction");
    expect(actionSource).not.toContain("getPublicCmsSnapshot");
  });
});

