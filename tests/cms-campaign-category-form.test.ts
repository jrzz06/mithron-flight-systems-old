import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCategoryMetadataDraftFromFormData, buildPromotionalCampaignDraftFromFormData } from "@/services/cms-admin-forms";

function formData(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

describe("campaign and category CMS draft forms", () => {
  it("maps promotional campaign form data into the registered promotional_campaigns draft workflow input", () => {
    expect(buildPromotionalCampaignDraftFromFormData(formData({
      id: "campaign-q2-launch",
      label: "Q2 Launch",
      headline: "Launch support for survey fleets",
      body: "Bundle mission-ready accessories for the deployment window.",
      cta_label: "Explore fleets",
      href: "/products",
      media_asset_id: "media-campaign-q2",
      starts_at: "2026-06-01T00:00:00.000Z",
      ends_at: "2026-07-01T00:00:00.000Z",
      sort_order: "50",
      is_visible: "on",
      change_summary: "Draft promotional campaign from admin CMS form"
    }))).toEqual({
      table: "promotional_campaigns",
      identity: {
        id: "campaign-q2-launch"
      },
      fields: {
        label: "Q2 Launch",
        headline: "Launch support for survey fleets",
        body: "<p>Bundle mission-ready accessories for the deployment window.</p>",
        cta_label: "Explore fleets",
        href: "/products",
        media_asset_id: "media-campaign-q2",
        starts_at: "2026-06-01T00:00:00.000Z",
        ends_at: "2026-07-01T00:00:00.000Z"
      },
      entityId: "campaign-q2-launch",
      sortOrder: 50,
      isVisible: true,
      changeSummary: "Draft promotional campaign from admin CMS form"
    });
  });

  it("maps category metadata form data into the registered category_metadata draft workflow input", () => {
    expect(buildCategoryMetadataDraftFromFormData(formData({
      route_key: "agriculture",
      title: "Agriculture",
      subtitle: "Precision spraying and field response",
      hero_image: "/media/mithron/categories/agriculture-hero.webp",
      showcase_image: "{\"src\":\"/media/mithron/categories/agriculture-showcase.webp\",\"alt\":\"Agriculture showcase\"}",
      personality: "Field-first",
      featured_product_slugs: "agri-pro, agri-pro-plus",
      ecosystem_payload: "{\"source\":\"category_metadata\"}",
      sort_order: "60",
      is_visible: "on",
      change_summary: "Draft category metadata from admin CMS form"
    }))).toEqual({
      table: "category_metadata",
      identity: {
        route_key: "agriculture"
      },
      fields: {
        title: "Agriculture",
        subtitle: "Precision spraying and field response",
        hero_image: "/media/mithron/categories/agriculture-hero.webp",
        showcase_image: {
          src: "/media/mithron/categories/agriculture-showcase.webp",
          alt: "Agriculture showcase"
        },
        personality: "Field-first",
        featured_product_slugs: ["agri-pro", "agri-pro-plus"],
        ecosystem_payload: { source: "category_metadata" }
      },
      entityId: "agriculture",
      sortOrder: 60,
      isVisible: true,
      changeSummary: "Draft category metadata from admin CMS form"
    });
  });

  it("wires the draft-only category and campaign forms to the server action and admin CMS workspace", () => {
    const workspaceSource = readFileSync(join(process.cwd(), "features/admin/cms/cms-visual-workspace.tsx"), "utf8");
    const actionSource = readFileSync(join(process.cwd(), "app/admin/cms/actions.ts"), "utf8");
    const pageSource = readFileSync(join(process.cwd(), "app/admin/cms/page.tsx"), "utf8");

    expect(workspaceSource).toContain("data-cms-table=\"promotional_campaigns\"");
    expect(workspaceSource).toContain("data-cms-table=\"section_visibility\"");
    expect(workspaceSource).toContain("saveCategoryMetadataDraftFormAction");
    expect(workspaceSource).toContain("data-cms-table=\"category_metadata\"");
    expect(pageSource).toContain("categoryRows");
    expect(pageSource).toContain("campaignSections");
    expect(pageSource).toContain("visibilitySections");
    expect(pageSource).toContain("stateEntityId: routeKey");
    expect(actionSource).toContain("buildCategoryMetadataDraftFromFormData");
    expect(actionSource).toContain("saveCategoryMetadataDraftFormAction");
    expect(actionSource).toContain("savePromotionalCampaignDraftFormAction");
    expect(actionSource).toContain("saveSectionVisibilityDraftFormAction");
    expect(actionSource).not.toContain("getPublicCmsSnapshot");
  });
});

