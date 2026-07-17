import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildProductReviewDraftFromFormData } from "@/services/cms-admin-forms";
import { CMS_RETIRED_ADMIN_TABLES } from "@/config/cms-deprecations";

function formData(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

describe("legacy product review CMS form (retired)", () => {
  it("keeps the form parser for compatibility while product_reviews is retired from admin UI", () => {
    expect(CMS_RETIRED_ADMIN_TABLES).toContain("product_reviews");
    expect(buildProductReviewDraftFromFormData(formData({
      id: "review-atlas",
      reviewer_name: "Atlas Survey Systems",
      product_slug: "source-agri-kisan-drone-small-8-liter",
      body: "The workflow stays calm under load and the handoff to operations is predictable.",
      rating: "4.8",
      sort_order: "40",
      is_visible: "on",
      change_summary: "Draft product review from admin CMS form"
    }))).toEqual({
      table: "product_reviews",
      identity: {
        id: "review-atlas"
      },
      fields: {
        reviewer_name: "Atlas Survey Systems",
        product_slug: "source-agri-kisan-drone-small-8-liter",
        body: "<p>The workflow stays calm under load and the handoff to operations is predictable.</p>",
        rating: 4.8
      },
      entityId: "review-atlas",
      sortOrder: 40,
      isVisible: true,
      changeSummary: "Draft product review from admin CMS form"
    });
  });

  it("redirects legacy CMS product review UI to the live reviews queue", () => {
    const workspaceSource = readFileSync(join(process.cwd(), "features/admin/cms/cms-visual-workspace.tsx"), "utf8");
    const actionSource = readFileSync(join(process.cwd(), "app/admin/cms/actions.ts"), "utf8");

    expect(workspaceSource).toContain('data-cms-table="product_reviews"');
    expect(workspaceSource).toContain("/admin/reviews");
    expect(workspaceSource).toContain("Open Reviews");
    expect(workspaceSource).not.toContain("saveProductReviewDraftFormAction");
    expect(actionSource).toContain("saveProductReviewDraftFormAction");
    expect(actionSource).toContain("Legacy CMS product reviews are retired");
    expect(actionSource).not.toContain("getPublicCmsSnapshot");
  });
});
