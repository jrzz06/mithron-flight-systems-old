import { describe, expect, it } from "vitest";
import {
  CMS_COMPONENT_CONTENT_SOURCES,
  contentSourcesForComponent,
  defaultHomepageContentSources
} from "@/config/cms-resolver-registry";
import { CMS_DEPRECATED_STOREFRONT_TABLES } from "@/config/cms-deprecations";
import {
  resolveCmsPageOrchestration,
  shouldLoadCmsSource
} from "@/services/cms-resolver";

describe("CMS resolver orchestration", () => {
  it("maps storefront components to existing domain tables without duplicate schemas", () => {
    expect(contentSourcesForComponent("HeroCarousel")).toEqual(["hero_banners"]);
    expect(contentSourcesForComponent("HomeLandingComposite")).toEqual(["admin_settings"]);
    expect(contentSourcesForComponent("ProductReviews")).toEqual(["product_reviews"]);
    expect(contentSourcesForComponent("FooterColumns")).toEqual([
      "footer_columns",
      "footer_links",
      "admin_settings"
    ]);
    expect(contentSourcesForComponent("HomepageSection")).toEqual([]);
    expect(contentSourcesForComponent("Testimonials")).toEqual([]);
  });

  it("defaults to the full homepage source set when cms_pages orchestration is empty", () => {
    const defaults = defaultHomepageContentSources();
    expect(defaults).toEqual(
      expect.arrayContaining(["hero_banners", "admin_settings", "product_reviews", "footer_columns", "footer_links", "site_navigation"])
    );
  });

  it("resolves published cms_sections into a content source list", async () => {
    const originalFetch = global.fetch;
    global.fetch = async (input) => {
      const url = String(input);
      if (url.includes("cms_pages")) {
        return new Response(JSON.stringify([{ id: "page-home", route_path: "/", status: "published", is_visible: true }]), { status: 200 });
      }
      if (url.includes("cms_sections")) {
        return new Response(JSON.stringify([
          { page_id: "page-home", component_key: "HeroCarousel", status: "published", is_visible: true, sort_order: 1 },
          { page_id: "page-home", component_key: "ProductReviews", status: "published", is_visible: true, sort_order: 2 },
          { page_id: "page-home", component_key: "HomepageSection", status: "published", is_visible: true, sort_order: 3 }
        ]), { status: 200 });
      }
      return new Response("[]", { status: 200 });
    };

    try {
      const orchestration = await resolveCmsPageOrchestration("/", {
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key"
      });

      expect(orchestration.resolverStatus).toBe("orchestrated");
      expect(orchestration.contentSources).toEqual(
        expect.arrayContaining(["hero_banners", "product_reviews", "admin_settings"])
      );
      expect(orchestration.contentSources).not.toContain("homepage_sections");
      expect(shouldLoadCmsSource(orchestration, "hero_banners")).toBe(true);
      expect(shouldLoadCmsSource(orchestration, "admin_settings")).toBe(true);
      expect(shouldLoadCmsSource(orchestration, "faqs")).toBe(false);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("marks removed legacy storefront tables excluded from the public read path", () => {
    expect(CMS_DEPRECATED_STOREFRONT_TABLES).toEqual(["homepage_sections", "testimonials"]);
    expect(Object.keys(CMS_COMPONENT_CONTENT_SOURCES)).toContain("HeroCarousel");
  });
});
