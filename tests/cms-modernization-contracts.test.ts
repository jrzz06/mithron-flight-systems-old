/**
 * Phase 0 safety net — contracts the CMS modernization must preserve/upgrade.
 * These tests lock current behavior and document target post-refactor guarantees.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mergeHomepageCmsContent, mergeHomepageV1DraftPreviewFromPayload } from "@/services/homepage-cms";
import { mergeHomepageV2DraftPreviewFromPayload } from "@/services/homepage-cms-v2";
import { mergeHomepageCmsV2Content } from "@/config/homepage-cms-v2";
import { homepageSectionRegistry } from "@/config/homepage-section-registry";
import { estimateReadingTimeMinutes, normalizeBlogSlug } from "@/services/blog-posts";
import { buildCmsPreviewHref } from "@/lib/cms/preview-href";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("cms modernization contracts — phase 0", () => {
  it("homepage section registry covers hero, shelves, banners, missions, reviews, articles, footer", () => {
    const ids = homepageSectionRegistry.map((s) => s.id);
    expect(ids).toContain("hero");
    expect(ids).toContain("mini-carousel");
    expect(ids).toContain("shelf-drone-world");
    expect(ids).toContain("banner-inter-shelf-1");
    expect(ids).toContain("banner-full-viewport-1");
    expect(ids).toContain("mission-agri");
    expect(ids).toContain("testimonials");
    expect(ids).toContain("related-articles");
    expect(ids).toContain("footer");
  });

  it("v1 merge preserves shelves and missions shape", () => {
    const merged = mergeHomepageCmsContent({
      shelves: {
        droneWorld: { title: "Custom Shelf", productSlugs: ["alpha", "beta"] }
      },
      missions: {
        agri: { title: "Agri Custom" }
      }
    });
    expect(merged.shelves.droneWorld.title).toBe("Custom Shelf");
    expect(merged.shelves.droneWorld.productSlugs).toEqual(["alpha", "beta"]);
    expect(merged.missions.agri.title).toBe("Agri Custom");
  });

  it("v1 draft preview merges draftV1 over published shelves", () => {
    const preview = mergeHomepageV1DraftPreviewFromPayload({
      homepage: {
        shelves: {
          droneWorld: { title: "Live Shelf", productSlugs: ["live"] }
        },
        draftV1: {
          shelves: {
            droneWorld: { title: "Draft Shelf", productSlugs: ["draft-a", "draft-b"] }
          }
        }
      }
    });
    expect(preview.shelves.droneWorld.title).toBe("Draft Shelf");
    expect(preview.shelves.droneWorld.productSlugs).toEqual(["draft-a", "draft-b"]);
  });

  it("editable homepage sections use draft-publish workflow", () => {
    const editable = homepageSectionRegistry.filter((s) => s.editable && s.id !== "footer");
    for (const section of editable) {
      expect(["draft-publish", "live-with-draft"]).toContain(section.workflow);
    }
  });

  it("v2 draft preview merges draftV2 over published v2", () => {
    const preview = mergeHomepageV2DraftPreviewFromPayload({
      homepage: {
        v2: {
          reviews: { enabled: true, maxCount: 3, sortOrder: "newest" },
          miniCarousel: { enabled: true, slides: [] }
        },
        draftV2: {
          reviews: { enabled: true, maxCount: 9, sortOrder: "manual" },
          miniCarousel: {
            enabled: true,
            slides: [{ id: "s1", enabled: true, heading: "Draft slide", sortOrder: 0 }]
          }
        }
      }
    });
    expect(preview.reviews.maxCount).toBe(9);
    expect(preview.reviews.sortOrder).toBe("manual");
    expect(preview.miniCarousel.slides[0]?.heading).toBe("Draft slide");
  });

  it("v2 merge keeps banner slot counts stable", () => {
    const merged = mergeHomepageCmsV2Content({});
    expect(merged.banners.interShelf).toHaveLength(3);
    expect(merged.banners.fullViewport).toHaveLength(2);
    expect(merged.relatedArticles.items).toHaveLength(3);
  });

  it("draft preview helper builds admin-gated storefront preview URLs", () => {
    const href = buildCmsPreviewHref({ anchor: "hero", draft: true });
    expect(href).toContain("/preview/home");
    expect(href).toContain("#hero");
  });

  it("blog helpers normalize slugs and estimate reading time", () => {
    expect(normalizeBlogSlug("Hello World!")).toBe("hello-world");
    expect(estimateReadingTimeMinutes("word ".repeat(400))).toBe(2);
  });

  it("blog service exposes CRUD + published listing", () => {
    const service = source("services/blog-posts.ts");
    expect(service).toContain("listPublishedBlogPosts");
    expect(service).toContain("createBlogPost");
    expect(service).toContain("updateBlogPost");
    expect(service).toContain("publishBlogPost");
  });

  it("reviews admin mutations revalidate storefront tags", () => {
    const actions = source("app/admin/reviews/actions.ts");
    expect(actions).toContain('revalidateTag("reviews:home"');
    expect(actions).toContain("revalidatePath(\"/\")");
  });

  it("homepage bundle bypasses redis cache for draft preview", () => {
    const bundle = source("services/homepage-bundle.ts");
    expect(bundle).toContain("cmsDraftPreview");
    expect(bundle).toContain("getHomepageCmsDraftPreviewContent");
    expect(bundle).toContain("getHomepageCmsV2DraftPreviewContent");
  });

  it("cms preview access is admin-gated", () => {
    const preview = source("lib/cms/cms-preview-mode.ts");
    expect(preview).toContain("isStrictAdminRole");
    expect(preview).toContain('previewParam === "draft"');
  });
});
