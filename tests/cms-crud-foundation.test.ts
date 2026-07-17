import { describe, expect, it } from "vitest";
import {
  CMS_CONTENT_TABLES,
  CmsValidationError,
  buildCmsArchivePatch,
  buildCmsDraftPayload,
  buildCmsPublishPatch,
  buildContentRevisionPayload,
  getDefaultCmsConflictColumn
} from "@/services/cms-crud";
import { getRequiredPermissionForAdminTable } from "@/services/admin-actions";

describe("CMS CRUD foundation", () => {
  it("keeps CMS mutation tables explicit and permission guarded", () => {
    expect(CMS_CONTENT_TABLES).toContain("hero_banners");
    expect(CMS_CONTENT_TABLES).not.toContain("homepage_sections");
    expect(CMS_CONTENT_TABLES).not.toContain("testimonials");
    expect(CMS_CONTENT_TABLES).not.toContain("ecosystem_cards");
    expect(CMS_CONTENT_TABLES).not.toContain("deployment_locations");
    expect(CMS_CONTENT_TABLES).toContain("site_navigation");
    expect(CMS_CONTENT_TABLES).toContain("cms_pages");
    expect(CMS_CONTENT_TABLES).toContain("cms_sections");
    expect(CMS_CONTENT_TABLES).toContain("content_revisions");

    expect(getRequiredPermissionForAdminTable("hero_banners")).toBe("cms.write");
    expect(getRequiredPermissionForAdminTable("cms_pages")).toBe("cms.write");
    expect(getRequiredPermissionForAdminTable("cms_sections")).toBe("cms.write");
    expect(getRequiredPermissionForAdminTable("content_revisions")).toBe("cms.write");
    expect(getRequiredPermissionForAdminTable("section_visibility")).toBe("cms.write");
    expect(getRequiredPermissionForAdminTable("homepage_ordering")).toBe("cms.write");
    expect(getDefaultCmsConflictColumn("hero_banners")).toBe("id");
    expect(getDefaultCmsConflictColumn("cms_pages")).toBe("slug");
    expect(getDefaultCmsConflictColumn("cms_sections")).toBe("page_id,section_key");
    expect(getDefaultCmsConflictColumn("category_metadata")).toBe("route_key");
  });

  it("builds draft payloads without allowing protected field overrides", () => {
    const payload = buildCmsDraftPayload({
      table: "hero_banners",
      actorId: "actor-1",
      identity: { id: "hero-agriculture" },
      fields: {
        title: "Agriculture",
        status: "published",
        revision: 99,
        updated_by: "spoofed"
      },
      sortOrder: 10,
      isVisible: false,
      now: "2026-05-24T00:00:00.000Z"
    });

    expect(payload).toMatchObject({
      id: "hero-agriculture",
      title: "Agriculture",
      status: "draft",
      sort_order: 10,
      is_visible: false,
      updated_by: "actor-1",
      updated_at: "2026-05-24T00:00:00.000Z"
    });
    expect(payload).not.toHaveProperty("revision");
    expect(payload).not.toHaveProperty("created_by");
    expect(payload.updated_by).not.toBe("spoofed");
  });

  it("omits sort_order for CMS drafts that do not use ordering", () => {
    const payload = buildCmsDraftPayload({
      table: "section_visibility",
      actorId: "actor-1",
      identity: { id: "00000000-0000-4000-8000-000000000101", section_key: "hero", route_path: "/" },
      fields: {
        section_key: "hero",
        route_path: "/",
        is_visible: false,
        starts_at: "2026-06-01T00:00:00.000Z",
        ends_at: "2026-07-01T00:00:00.000Z"
      },
      isVisible: false,
      now: "2026-05-24T00:00:00.000Z",
      includeAuditFields: false
    });

    expect(payload).toMatchObject({
      id: "00000000-0000-4000-8000-000000000101",
      section_key: "hero",
      route_path: "/",
      is_visible: false,
      status: "draft"
    });
    expect(payload).not.toHaveProperty("sort_order");
    expect(payload).not.toHaveProperty("revision");
    expect(payload).not.toHaveProperty("created_by");
    expect(payload).not.toHaveProperty("updated_by");
    expect(payload).not.toHaveProperty("updated_at");
  });

  it("builds publish and archive patches without local revision allocation", () => {
    expect(buildCmsPublishPatch({
      actorId: "actor-1",
      now: "2026-05-24T00:00:00.000Z"
    })).toMatchObject({
      status: "published",
      is_visible: true,
      updated_by: "actor-1",
      updated_at: "2026-05-24T00:00:00.000Z"
    });
    expect(buildCmsPublishPatch({
      actorId: "actor-1",
      now: "2026-05-24T00:00:00.000Z"
    })).not.toHaveProperty("revision");

    expect(buildCmsArchivePatch({
      actorId: "actor-1",
      now: "2026-05-24T00:00:01.000Z"
    })).toMatchObject({
      status: "archived",
      is_visible: false,
      updated_by: "actor-1",
      updated_at: "2026-05-24T00:00:01.000Z"
    });
    expect(buildCmsArchivePatch({
      actorId: "actor-1",
      now: "2026-05-24T00:00:01.000Z"
    })).not.toHaveProperty("revision");
  });

  it("builds content revision payloads for rollback-safe publishing", () => {
    const revision = buildContentRevisionPayload({
      table: "hero_banners",
      entityId: "hero-agriculture",
      actorId: "actor-1",
      snapshot: { title: "Agriculture", status: "published" },
      changeSummary: "Publish agriculture hero"
    });

    expect(revision).toEqual({
      entity_table: "hero_banners",
      entity_id: "hero-agriculture",
      snapshot: { title: "Agriculture", status: "published" },
      change_summary: "Publish agriculture hero",
      created_by: "actor-1"
    });
  });

  it("rejects unsafe CMS payloads before admin service-role writes", () => {
    expect(() => buildCmsDraftPayload({
      table: "unsupported_table",
      actorId: "actor-1",
      identity: { id: "bad" },
      fields: {}
    })).toThrow(CmsValidationError);

    expect(() => buildCmsDraftPayload({
      table: "hero_banners",
      actorId: "",
      identity: { id: "bad" },
      fields: {}
    })).toThrow("actor id");

    expect(buildContentRevisionPayload({
      table: "hero_banners",
      entityId: "hero",
      revision: 0,
      actorId: "actor-1",
      snapshot: {}
    })).not.toHaveProperty("revision");
  });
});
