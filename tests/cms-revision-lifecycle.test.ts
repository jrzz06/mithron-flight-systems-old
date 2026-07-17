import { describe, expect, it } from "vitest";
import {
  archiveCmsWorkflowRecord,
  publishCmsWorkflowRecord,
  saveCmsWorkflowDraft
} from "@/services/cms-admin-workflows";

describe("CMS revision lifecycle", () => {
  it("keeps draft saves revision-free so only atomic publish flows allocate revisions", async () => {
    const saveDraft = async () => ({
      id: "section-home-hero",
      page_id: "home",
      section_key: "hero",
      component_key: "HeroCarousel",
      title: "Homepage hero",
      payload: { source: "hero_banners" },
      status: "draft"
    }) as never;
    const record = await saveCmsWorkflowDraft({
      table: "cms_sections",
      actorId: "actor-1",
      identity: {
        id: "section-home-hero",
        page_id: "home",
        section_key: "hero"
      },
      fields: {
        component_key: "HeroCarousel",
        title: "Homepage hero",
        payload: { source: "hero_banners" }
      },
      entityId: "section-home-hero",
      changeSummary: "Save homepage hero draft"
    }, {
      saveDraft
    });

    expect(record).toMatchObject({ status: "draft" });
  });

  it("passes publish and archive transitions to the atomic mutation helpers", async () => {
    const publishCalls: unknown[] = [];
    const archiveCalls: unknown[] = [];

    await publishCmsWorkflowRecord({
      table: "cms_pages",
      actorId: "actor-1",
      entityId: "home",
      changeSummary: "Publish homepage"
    }, {
      publishRecord: async (input) => {
        publishCalls.push(input);
        return ({
        id: "home",
        slug: "home",
        title: "Homepage",
        status: "published",
        revision: 5
        }) as never;
      }
    });

    await archiveCmsWorkflowRecord({
      table: "cms_pages",
      actorId: "actor-1",
      entityId: "home",
      changeSummary: "Archive homepage"
    }, {
      archiveRecord: async (input) => {
        archiveCalls.push(input);
        return ({
        id: "home",
        slug: "home",
        title: "Homepage",
        status: "archived",
        revision: 6
        }) as never;
      }
    });

    expect(publishCalls).toHaveLength(1);
    expect(publishCalls[0]).toMatchObject({
      table: "cms_pages",
      idColumn: "slug",
      idValue: "home",
      changeSummary: "Publish homepage",
      requestId: null
    });
    expect(archiveCalls).toHaveLength(1);
    expect(archiveCalls[0]).toMatchObject({
      table: "cms_pages",
      idColumn: "slug",
      idValue: "home",
      changeSummary: "Archive homepage",
      requestId: null
    });
  });
});
