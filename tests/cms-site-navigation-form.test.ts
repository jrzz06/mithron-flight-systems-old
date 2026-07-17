import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSiteNavigationDraftFromFormData } from "@/services/cms-admin-forms";

describe("site navigation CMS draft form", () => {
  it("maps form data into the registered site_navigation draft workflow input", () => {
    const formData = new FormData();
    formData.set("id", "nav-precision-spraying");
    formData.set("label", "Precision Spraying");
    formData.set("href", "/agriculture");
    formData.set("placement", "secondary");
    formData.set("parent_id", "nav-products");
    formData.set("required_role", "admin");
    formData.set("sort_order", "12");
    formData.set("is_visible", "on");
    formData.set("change_summary", "Draft navigation item for precision spraying");

    const draft = buildSiteNavigationDraftFromFormData(formData);

    expect(draft).toMatchObject({
      table: "site_navigation",
      entityId: "nav-precision-spraying",
      identity: {
        id: "nav-precision-spraying"
      },
      fields: {
        label: "Precision Spraying",
        href: "/agriculture",
        placement: "secondary",
        parent_id: "nav-products",
        required_role: "admin"
      },
      sortOrder: 12,
      isVisible: true,
      changeSummary: "Draft navigation item for precision spraying"
    });
  });

  it("wires the draft-only form action and page to the site navigation workflow", () => {
    const actionsSource = readFileSync(resolve(process.cwd(), "app/admin/cms/actions.ts"), "utf8");
    const workspaceSource = readFileSync(resolve(process.cwd(), "features/admin/cms/cms-visual-workspace.tsx"), "utf8");

    expect(actionsSource).toContain("saveSiteNavigationDraftFormAction");
    expect(actionsSource).toContain("buildSiteNavigationDraftFromFormData");
    expect(workspaceSource).toContain("site_navigation");
    expect(workspaceSource).toContain("navigation");
  });
});

