import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("CMS consolidation architecture", () => {
  it("routes public reads through cms resolver orchestration and domain tables", () => {
    const cms = readFileSync(join(process.cwd(), "services/cms.ts"), "utf8");
    const homepageCms = readFileSync(join(process.cwd(), "services/homepage-cms.ts"), "utf8");
    const resolver = readFileSync(join(process.cwd(), "services/cms-resolver.ts"), "utf8");
    const adminPage = readFileSync(join(process.cwd(), "app/admin/cms/page.tsx"), "utf8");
    const editor = readFileSync(join(process.cwd(), "features/admin/cms/cms-section-editor.tsx"), "utf8");

    expect(cms).toContain("getHomepageCmsOrchestration");
    expect(cms).toContain("shouldLoadCmsSource");
    expect(homepageCms).toContain("getCachedAdminSettingsPayload");
    expect(homepageCms).not.toContain("shouldLoadCmsSource");
    expect(resolver).toContain("HOMEPAGE_PINNED_SOURCES");
    expect(adminPage).toContain("getCmsCoreSnapshot");
    expect(adminPage).toContain("getCmsAdvancedWorkspaceSnapshot");
    expect(adminPage).not.toContain('tableRows(snapshot, "homepage_sections")');
    expect(editor).toContain("CmsImageField");
    expect(editor).toContain("HomepageBuilderWorkspace");
  });

  it("exposes workspace pages through page query navigation", () => {
    const adminPage = readFileSync(join(process.cwd(), "app/admin/cms/page.tsx"), "utf8");
    expect(adminPage).toContain("params?.page");
    expect(adminPage).toContain("CmsWorkspaceNav");
  });

  it("ships cms consolidation index migration", () => {
    const migration = readFileSync(
      join(process.cwd(), "supabase/migrations/20260615000100_cms_consolidation_indexes.sql"),
      "utf8"
    );
    expect(migration).toContain("admin_settings_id_updated_idx");
    expect(migration).toContain("homepage_sections_key_status_idx");
  });
});
