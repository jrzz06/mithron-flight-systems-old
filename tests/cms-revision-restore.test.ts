import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildContentRevisionRestorePayload,
  diffContentRevisionSnapshots
} from "@/services/cms-crud";
import { buildContentRevisionRestoreFromFormData } from "@/services/cms-admin-forms";

function formData(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

describe("content revision restore workflow", () => {
  it("maps restore form data into a restore-safe revision input", () => {
    expect(buildContentRevisionRestoreFromFormData(formData({
      entity_table: "cms_pages",
      entity_id: "home",
      revision: "4",
      snapshot: "{\"id\":\"home\",\"slug\":\"home\",\"title\":\"Homepage\",\"status\":\"published\"}",
      change_summary: "Restore homepage revision 4"
    }))).toEqual({
      table: "cms_pages",
      entityId: "home",
      revision: 4,
      snapshot: {
        id: "home",
        slug: "home",
        title: "Homepage",
        status: "published"
      },
      changeSummary: "Restore homepage revision 4"
    });
  });

  it("builds a restore patch without local revision allocation", () => {
    expect(buildContentRevisionRestorePayload({
      table: "cms_pages",
      entityId: "home",
      actorId: "actor-1",
      now: "2026-05-24T00:00:00.000Z",
      snapshot: {
        id: "home",
        slug: "home",
        title: "Homepage",
        status: "published",
        revision: 4,
        created_at: "2026-05-20T00:00:00.000Z",
        updated_at: "2026-05-21T00:00:00.000Z",
        updated_by: "spoofed"
      }
    })).toEqual({
      payload: {
        id: "home",
        slug: "home",
        title: "Homepage",
        status: "published",
        updated_by: "actor-1",
        updated_at: "2026-05-24T00:00:00.000Z"
      }
    });
  });

  it("diffs revision snapshots without treating system fields as content changes", () => {
    expect(diffContentRevisionSnapshots(
      { id: "home", slug: "home", title: "Homepage", status: "draft", revision: 7 },
      { id: "home", slug: "home", title: "Homepage 2", status: "published", revision: 8 }
    )).toEqual([
      {
        field: "title",
        previous: "Homepage",
        next: "Homepage 2"
      }
    ]);
  });

  it("wires the restore action into the CMS admin revision workflow without changing storefront loaders", () => {
    const workspaceSource = readFileSync(join(process.cwd(), "features/admin/cms/cms-visual-workspace.tsx"), "utf8");
    const actionSource = readFileSync(join(process.cwd(), "app/admin/cms/actions.ts"), "utf8");

    expect(workspaceSource).toContain("content-revision-timeline");
    expect(workspaceSource).toContain("restoreContentRevisionAction");
    expect(actionSource).toContain("buildContentRevisionRestoreFromFormData");
    expect(actionSource).toContain("restoreContentRevisionAction");
    expect(actionSource).not.toContain("getPublicCmsSnapshot");
  });
});

