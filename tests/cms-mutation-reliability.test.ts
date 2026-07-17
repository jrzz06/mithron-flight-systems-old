import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCmsDraftPayload,
  buildCmsPublishPatch,
  buildCmsArchivePatch,
  getDefaultCmsConflictColumn,
  getUnsupportedCmsPayloadKeys
} from "@/services/cms-crud";
import {
  buildCmsSectionDraftFromFormData,
  buildHeroBannerDraftFromFormData,
  buildSectionVisibilityDraftFromFormData
} from "@/services/cms-admin-forms";

const actorId = "00000000-0000-0000-0000-000000000001";
const now = "2026-05-24T12:30:00.000Z";

function formData(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

describe("CMS mutation reliability", () => {
  it("strips unsupported audit columns from product reviews and promotional campaigns without local revision allocation", () => {
    const review = buildCmsDraftPayload({
      table: "product_reviews",
      actorId,
      identity: { id: "review-reliability" },
      fields: {
        reviewer_name: "Reliability Operator",
        body: "CMS mutation reliability is visible.",
        created_by: "spoofed",
        updated_by: "spoofed"
      },
      sortOrder: 10,
      isVisible: true,
      now
    });

    expect(review).toMatchObject({
      id: "review-reliability",
      reviewer_name: "Reliability Operator",
      body: "CMS mutation reliability is visible.",
      status: "draft",
      is_visible: true,
      sort_order: 10,
      updated_at: now
    });
    expect(review).not.toHaveProperty("revision");
    expect(review).not.toHaveProperty("created_by");
    expect(review).not.toHaveProperty("updated_by");

    const campaign = buildCmsDraftPayload({
      table: "promotional_campaigns",
      actorId,
      identity: { id: "campaign-reliability" },
      fields: {
        label: "Reliability",
        headline: "Schema-safe CMS mutations",
        created_by: "spoofed",
        updated_by: "spoofed"
      },
      now
    });

    expect(campaign).toMatchObject({
      id: "campaign-reliability",
      label: "Reliability",
      headline: "Schema-safe CMS mutations",
      status: "draft",
      updated_at: now
    });
    expect(campaign).not.toHaveProperty("revision");
    expect(campaign).not.toHaveProperty("created_by");
    expect(campaign).not.toHaveProperty("updated_by");
  });

  it("builds publish and archive patches without sending unsupported audit columns", () => {
    expect(buildCmsPublishPatch({
      table: "product_reviews",
      actorId,
      now
    })).toEqual({
      status: "published",
      is_visible: true,
      updated_at: now
    });

    expect(buildCmsArchivePatch({
      table: "promotional_campaigns",
      actorId,
      now
    })).toEqual({
      status: "archived",
      is_visible: false,
      updated_at: now
    });

    expect(buildCmsPublishPatch({
      table: "cms_pages",
      actorId,
      now
    })).toEqual({
      status: "published",
      is_visible: true,
      updated_by: actorId,
      updated_at: now
    });
  });

  it("uses schema-safe conflict identities for uuid-backed CMS tables", () => {
    expect(getDefaultCmsConflictColumn("section_visibility")).toBe("section_key,route_path");
    expect(getDefaultCmsConflictColumn("cms_sections")).toBe("page_id,section_key");

    const visibility = buildSectionVisibilityDraftFromFormData(formData({
      section_key: "hero",
      route_path: "/",
      starts_at: "2026-06-01T00:00:00.000Z",
      ends_at: "2026-07-01T00:00:00.000Z",
      is_visible: "on",
      change_summary: "Schema-safe visibility"
    }));
    expect(visibility.identity).toEqual({ section_key: "hero", route_path: "/" });
    expect(visibility.entityId).toBe("hero:/");

    const section = buildCmsSectionDraftFromFormData(formData({
      page_id: "home",
      section_key: "hero",
      component_key: "HeroCarousel",
      title: "Homepage hero",
      payload: "{\"source\":\"hero_banners\"}",
      is_visible: "on"
    }));
    expect(section.identity).toEqual({ page_id: "home", section_key: "hero" });
    expect(section.entityId).toBe("home:hero");
  });

  it("builds operator-usable hero banner form input with media, ordering, visibility, and publish metadata", () => {
    const hero = buildHeroBannerDraftFromFormData(formData({
      id: "hero-reliability",
      product_slug: "source-agri-kisan-drone-small-8-liter",
      title: "Reliability hero",
      subtitle: "Draft-safe hero workflow",
      cta_label: "Explore systems",
      href: "/agriculture",
      image: "{\"src\":\"/assets/hero/hero-slide-01.webp\",\"alt\":\"Hero image\"}",
      poster: "{\"src\":\"/assets/hero/hero-slide-01.webp\",\"alt\":\"Hero poster\"}",
      video: "{\"src\":\"/media/mithron/story/preview.webm\",\"alt\":\"Hero preview\"}",
      theme: "dark",
      composition: "{\"mode\":\"full-bleed\"}",
      title_color: "#ffffff",
      subtitle_color: "rgba(255,255,255,.82)",
      starts_at: "2026-06-01T00:00:00.000Z",
      ends_at: "2026-07-01T00:00:00.000Z",
      sort_order: "15",
      is_visible: "on",
      change_summary: "Draft hero reliability"
    }));

    expect(hero).toMatchObject({
      id: "hero-reliability",
      productSlug: "source-agri-kisan-drone-small-8-liter",
      title: "Reliability hero",
      subtitle: "Draft-safe hero workflow",
      ctaLabel: "Explore systems",
      href: "/agriculture",
      theme: "dark",
      titleColor: "#ffffff",
      subtitleColor: "rgba(255,255,255,.82)",
      sortOrder: 15,
      isVisible: true,
      changeSummary: "Draft hero reliability"
    });
    expect(hero.image).toEqual({ src: "/assets/hero/hero-slide-01.webp", alt: "Hero image" });
    expect(hero.composition).toMatchObject({ mode: "full-bleed" });
  });

  it("preserves existing hero media and composition through simple visual-editor fields", () => {
    const hero = buildHeroBannerDraftFromFormData(formData({
      id: "hero-preserve",
      product_slug: "ag10-arrival",
      title: "Preserve hero",
      subtitle: "Existing media survives a text edit",
      cta_label: "Plan deployment",
      href: "/agriculture",
      image_src: "/media/hero/current.webp",
      image_alt: "Current hero",
      poster_src: "/media/hero/current-poster.webp",
      poster_alt: "Current poster",
      video_src: "/media/hero/current.webm",
      video_alt: "Current video",
      theme: "dark",
      composition_mode: "full-bleed",
      composition_text_tone: "light",
      composition_media_position: "61% 50%",
      composition_mobile_media_position: "58% 40%",
      composition_product_dominance: "flagship",
      is_visible: "on"
    }));

    expect(hero.image).toEqual({ src: "/media/hero/current.webp", alt: "Current hero", kind: "image", local: false, priority: true });
    expect(hero.poster).toEqual({ src: "/media/hero/current-poster.webp", alt: "Current poster", kind: "image", local: false });
    expect(hero.video).toEqual({ src: "/media/hero/current.webm", alt: "Current video", kind: "video", local: false });
    expect(hero.composition).toEqual({
      mode: "full-bleed",
      textTone: "light",
      mediaPosition: "61% 50%",
      mobileMediaPosition: "58% 40%",
      productDominance: "flagship"
    });
  });

  it("surfaces CMS form mutation results in admin actions and workspace UI", () => {
    const actionsSource = readFileSync(join(process.cwd(), "app", "admin", "cms", "actions.ts"), "utf8");
    const pageSource = readFileSync(join(process.cwd(), "app", "admin", "cms", "page.tsx"), "utf8");
    const workspaceSource = readFileSync(join(process.cwd(), "features", "admin", "cms", "cms-visual-workspace.tsx"), "utf8");
    const sectionEditorSource = readFileSync(join(process.cwd(), "features", "admin", "cms", "cms-section-editor.tsx"), "utf8");

    expect(actionsSource).toContain("runCmsFormMutation");
    expect(actionsSource).toContain("saveHeroBannerDraftFormAction");
    expect(actionsSource).toContain("publishHeroBannerFormAction");
    expect(actionsSource).toContain("archiveHeroBannerFormAction");
    expect(actionsSource).toContain("revalidateTag(\"cms\", \"max\")");
    expect(actionsSource).toContain("revalidatePath(\"/products\")");
    expect(actionsSource).toContain("related_publish_table");
    expect(pageSource).toContain("cms-status");
    expect(pageSource).toContain("stateEntityId: routeKey");
    expect(pageSource).toContain("relatedPublishTargets");
    expect(workspaceSource).toContain("saveHeroBannerDraftFormAction");
    expect(workspaceSource).toContain("data-cms-table=\"hero_banners\"");
    expect(workspaceSource).toContain("stateEntityId ?? activeSection.entityId");
    expect(workspaceSource).toContain("related_publish_entity_id");
    expect(workspaceSource).toContain("\"No local edits\"");
    expect(workspaceSource).not.toContain("All changes saved");
    expect(sectionEditorSource).toContain("HeroCarouselSlideEditor");
  });

  it("reports unsupported payload keys for diagnostics without blocking schema-safe mutation filtering", () => {
    expect(getUnsupportedCmsPayloadKeys("product_reviews", {
      id: "review",
      reviewer_name: "Pilot",
      body: "Reliable",
      created_by: actorId,
      updated_by: actorId
    })).toEqual(["created_by", "updated_by"]);
  });
});

