import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  CMS_DEPRECATED_WORKFLOW_TABLES,
  CMS_WORKFLOW_TABLES,
  archiveCmsWorkflowRecord,
  buildCmsWorkflowDraftInput,
  publishCmsWorkflowRecord,
  saveCmsWorkflowDraft
} from "@/services/cms-admin-workflows";
import { CmsValidationError } from "@/services/cms-crud";

const actorId = "00000000-0000-0000-0000-000000000001";
const now = "2026-05-24T01:00:00.000Z";

describe("CMS workflow registry", () => {
  it("registers the next safe CMS tables without switching storefront sources", () => {
    expect(CMS_WORKFLOW_TABLES).toEqual([
      "section_visibility",
      "homepage_ordering",
      "cms_pages",
      "cms_sections",
      "site_navigation",
      "footer_columns",
      "footer_links",
      "faqs",
      "product_reviews",
      "promotional_campaigns",
      "category_metadata"
    ]);
    expect(CMS_DEPRECATED_WORKFLOW_TABLES).toContain("homepage_sections");
  });

  it("builds cms page drafts with schema identities and protected fields stripped", () => {
    const draft = buildCmsWorkflowDraftInput({
      table: "cms_pages",
      actorId,
      identity: {
        id: "page-home",
        slug: "home"
      },
      fields: {
        title: "Homepage",
        route_path: "/",
        status: "published",
        revision: 99,
        updated_by: "spoofed"
      },
      sortOrder: 10,
      isVisible: true,
      now
    });

    expect(draft).toMatchObject({
      table: "cms_pages",
      conflictColumn: "slug",
      actorId,
      identity: {
        id: "page-home",
        slug: "home"
      },
      sortOrder: 10,
      isVisible: true,
      now
    });
    expect(draft.fields).toMatchObject({
      title: "Homepage",
      route_path: "/"
    });
    expect(draft.fields).not.toHaveProperty("status");
    expect(draft.fields).not.toHaveProperty("revision");
    expect(draft.fields).not.toHaveProperty("updated_by");
  });

  it("validates navigation, footer, FAQ, testimonial, campaign, and category draft payload requirements", () => {
    const cases = [
      {
        table: "site_navigation",
        identity: { id: "nav-agriculture" },
        fields: { label: "Agri Drones", href: "/agriculture", placement: "primary" }
      },
      {
        table: "footer_columns",
        identity: { id: "footer-products" },
        fields: { title: "Products" }
      },
      {
        table: "footer_links",
        identity: { id: "footer-agriculture" },
        fields: { column_id: "footer-products", label: "Agri Drones", href: "/agriculture" }
      },
      {
        table: "faqs",
        identity: { id: "faq-support" },
        fields: { scope: "global", question: "How do deployments start?", answer: "Through a scoped operations review." }
      },
      {
        table: "product_reviews",
        identity: { id: "review-atlas" },
        fields: { reviewer_name: "Atlas Survey Systems", body: "The workflow stays calm under load.", product_slug: "source-agri-kisan-drone-small-8-liter", rating: 4.8 }
      },
      {
        table: "promotional_campaigns",
        identity: { id: "campaign-q2-launch" },
        fields: {
          label: "Q2 Launch",
          headline: "Launch support for survey fleets",
          body: "Bundle mission-ready accessories for the deployment window.",
          cta_label: "Explore fleets",
          href: "/products",
          media_asset_id: "media-campaign-q2",
          starts_at: "2026-06-01T00:00:00.000Z",
          ends_at: "2026-07-01T00:00:00.000Z"
        }
      },
      {
        table: "category_metadata",
        identity: { route_key: "agriculture" },
        fields: {
          title: "Agriculture",
          subtitle: "Precision spraying and field response",
          hero_image: "/media/mithron/categories/agriculture-hero.webp",
          showcase_image: { src: "/media/mithron/categories/agriculture-showcase.webp", alt: "Agriculture showcase" },
          personality: "Field-first",
          featured_product_slugs: ["agri-pro", "agri-pro-plus"],
          ecosystem_payload: { source: "category_metadata" }
        }
      },
      {
        table: "section_visibility",
        identity: { section_key: "hero", route_path: "/" },
        fields: {
          section_key: "hero",
          route_path: "/",
          starts_at: "2026-06-01T00:00:00.000Z",
          ends_at: "2026-07-01T00:00:00.000Z"
        }
      },
      {
        table: "homepage_ordering",
        identity: { section_key: "hero" },
        fields: {}
      }
    ] as const;

    for (const item of cases) {
      const draft = buildCmsWorkflowDraftInput({
        table: item.table,
        actorId,
        identity: item.identity,
        fields: item.fields,
        now,
        ...(item.table === "homepage_ordering"
          ? { sortOrder: 5, isVisible: true }
          : {})
      });

      expect(draft.table).toBe(item.table);
      expect(draft.conflictColumn).toBe(
        item.table === "category_metadata"
          ? "route_key"
          : item.table === "section_visibility"
            ? "section_key,route_path"
          : item.table === "homepage_ordering"
            ? "section_key"
            : "id"
      );
      expect(draft.identity).toEqual(item.identity);
      expect(draft.fields).toMatchObject(item.fields);
      if (item.table === "section_visibility") {
        expect(draft.includeAuditFields).toBe(false);
      }
      if (item.table === "homepage_ordering") {
        expect(draft.includeAuditFields).toBe(false);
        expect(draft.sortOrder).toBe(5);
        expect(draft.isVisible).toBe(true);
      }
    }
  });

  it("rejects unsupported workflow tables and missing required fields", () => {
    expect(() => buildCmsWorkflowDraftInput({
      table: "hero_banners",
      actorId,
      identity: { id: "hero" },
      fields: { title: "Hero" }
    })).toThrow(CmsValidationError);

    expect(() => buildCmsWorkflowDraftInput({
      table: "footer_links",
      actorId,
      identity: { id: "footer-agriculture" },
      fields: { label: "Agri Drones", href: "/agriculture" }
    })).toThrow("column_id");
  });

  it("saves registered CMS drafts without allocating local revisions", async () => {
    const saveDraft = vi.fn().mockResolvedValue({
      id: "home-hero",
      section_key: "hero",
      status: "draft"
    });

    await saveCmsWorkflowDraft({
      table: "cms_pages",
      actorId,
      identity: { id: "page-home", slug: "home" },
      fields: {
        title: "Homepage",
        route_path: "/"
      },
      entityId: "page-home",
      changeSummary: "Draft homepage page",
      now
    }, {
      saveDraft
    });

    expect(saveDraft).toHaveBeenCalledWith(expect.objectContaining({
      table: "cms_pages",
      conflictColumn: "slug",
      identity: { id: "page-home", slug: "home" }
    }));
  });

  it("publishes and archives registered CMS records using table conflict identity through atomic mutation", async () => {
    const publishRecord = vi.fn().mockResolvedValue({
      section_key: "hero",
      revision: 4,
      status: "published"
    });
    const archiveRecord = vi.fn().mockResolvedValue({
      id: "footer-agriculture",
      revision: 5,
      status: "archived"
    });

    await publishCmsWorkflowRecord({
      table: "cms_pages",
      actorId,
      entityId: "home",
      now,
      changeSummary: "Publish homepage page"
    }, {
      publishRecord
    });

    await archiveCmsWorkflowRecord({
      table: "footer_links",
      actorId,
      entityId: "footer-agriculture",
      now,
      changeSummary: "Archive footer link"
    }, {
      archiveRecord
    });

    expect(publishRecord).toHaveBeenCalledWith({
      table: "cms_pages",
      idColumn: "slug",
      idValue: "home",
      actorId,
      now,
      changeSummary: "Publish homepage page",
      requestId: null
    });
    expect(archiveRecord).toHaveBeenCalledWith({
      table: "footer_links",
      idColumn: "id",
      idValue: "footer-agriculture",
      actorId,
      now,
      changeSummary: "Archive footer link",
      requestId: null
    });
  });

  it("exposes generic server actions without trusting client actor ids", () => {
    const source = readFileSync(join(process.cwd(), "app/admin/cms/actions.ts"), "utf8");

    expect(source).toContain("saveCmsWorkflowDraftAction");
    expect(source).toContain("publishCmsWorkflowRecordAction");
    expect(source).toContain("archiveCmsWorkflowRecordAction");
    expect(source).not.toContain("actorId: input.actorId");
  });
});
