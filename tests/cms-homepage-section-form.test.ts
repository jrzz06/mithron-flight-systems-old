import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("homepage section CMS cleanup", () => {
  it("removed homepage_sections draft builder and server action", () => {
    const workspaceSource = readFileSync(join(process.cwd(), "features/admin/cms/cms-visual-workspace.tsx"), "utf8");
    const actionSource = readFileSync(join(process.cwd(), "app/admin/cms/actions.ts"), "utf8");
    const formsSource = readFileSync(join(process.cwd(), "services/cms-admin-forms.ts"), "utf8");

    expect(formsSource).not.toContain("buildHomepageSectionDraftFromFormData");
    expect(actionSource).not.toContain("saveHomepageSectionDraftFormAction");
    expect(actionSource).not.toContain("buildHomepageSectionDraftFromFormData");
    expect(workspaceSource).not.toContain("homepage_sections");
    expect(workspaceSource).not.toContain("saveHomepageSectionDraftFormAction");
    expect(workspaceSource).toContain("Editor not available");
  });
});
