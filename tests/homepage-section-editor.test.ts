import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CMS_EDITOR_PREVIEW_BREAKPOINTS, CMS_IMAGE_SPECS, homepageSectionRegistry } from "@/config/homepage-section-registry";
import { SHELF_PRODUCT_CARD_SLOTS } from "@/config/homepage-shelf";
import { CMS_PREVIEW_DEVICE_WIDTHS } from "@/components/admin/cms/cms-responsive-preview-frame";
import { validateImageDimensions, validateSectionForPublish } from "@/lib/cms/section-validation";
import { resolveClientShelfSlotSources } from "@/lib/cms/homepage-slot-assignment";
import { adminRouteTitles, buildAdminNavGroups } from "@/components/platform/nav-config";
import type { Product } from "@/config/types";

const sampleProducts = [
  { slug: "a" },
  { slug: "b" },
  { slug: "c" },
  { slug: "d" }
] as Product[];

describe("homepage section editor contracts", () => {
  it("locks shelf product slots to 4", () => {
    expect(SHELF_PRODUCT_CARD_SLOTS).toBe(4);
  });

  it("locks preview breakpoints to 390 / 768 / 1280", () => {
    expect(CMS_EDITOR_PREVIEW_BREAKPOINTS).toEqual({ mobile: 390, tablet: 768, desktop: 1280 });
    expect(CMS_PREVIEW_DEVICE_WIDTHS).toEqual({ mobile: 390, tablet: 768, desktop: 1280 });
  });

  it("enforces hero min dimensions with required vs actual messaging", () => {
    const errors = validateImageDimensions(1400, 400, CMS_IMAGE_SPECS.hero);
    expect(errors[0]?.message).toContain("1600×533");
    expect(errors[0]?.message).toContain("1400×400");
  });

  it("accepts hero dimensions meeting min size and ~3:1 aspect", () => {
    expect(validateImageDimensions(2400, 800, CMS_IMAGE_SPECS.hero)).toEqual([]);
    expect(validateImageDimensions(1600, 533, CMS_IMAGE_SPECS.hero)).toEqual([]);
  });

  it("requires exactly 4 shelf product slots to publish", () => {
    const tooFew = validateSectionForPublish("product-shelf", {
      title: "Drone World",
      productSlugs: ["a", "b", "c"]
    });
    expect(tooFew.valid).toBe(false);
    expect(tooFew.errors.some((error) => error.message.includes("exactly 4"))).toBe(true);

    const ok = validateSectionForPublish("product-shelf", {
      title: "Drone World",
      productSlugs: ["a", "b", "c", "d"]
    });
    expect(ok.valid).toBe(true);
  });

  it("derives slot badge sources from client productSlugs", () => {
    expect(resolveClientShelfSlotSources(["a", "b", "c", "d"], true, sampleProducts)).toEqual([
      "inferred",
      "inferred",
      "inferred",
      "inferred"
    ]);
    expect(resolveClientShelfSlotSources(["a", "b", "c", "d"], false, sampleProducts)).toEqual([
      "pinned",
      "pinned",
      "pinned",
      "pinned"
    ]);
    expect(resolveClientShelfSlotSources(["a", "missing", "", "d"], false, sampleProducts)).toEqual([
      "pinned",
      "missing",
      "missing",
      "pinned"
    ]);
  });

  it("validates CMS-owned testimonials and related article slots", () => {
    const testimonials = validateSectionForPublish("reviews-section", {
      title: "What customers say",
      cards: [
        {
          enabled: true,
          authorName: "Asha",
          body: "Great drone.",
          rating: 5,
          productSlug: "drone-x",
          hrefOverride: ""
        }
      ]
    });
    expect(testimonials.valid).toBe(true);

    const related = validateSectionForPublish("related-articles", {
      items: [
        {
          enabled: true,
          title: "Press",
          imageSrc: "https://cdn.example/a.webp",
          href: "https://example.com/story"
        },
        { enabled: false, title: "", imageSrc: "", href: "" },
        { enabled: false, title: "", imageSrc: "", href: "" }
      ]
    });
    expect(related.valid).toBe(true);

    const relatedRelative = validateSectionForPublish("related-articles", {
      items: [{ enabled: true, title: "X", imageSrc: "https://cdn.example/a.webp", href: "/blog/story" }]
    });
    expect(relatedRelative.valid).toBe(true);

    const emptySlots = validateSectionForPublish("related-articles", {
      items: [
        { enabled: false, title: "", imageSrc: "", href: "" },
        { enabled: false, title: "", imageSrc: "", href: "" },
        { enabled: false, title: "", imageSrc: "", href: "" }
      ]
    });
    expect(emptySlots.valid).toBe(false);

    const badRelated = validateSectionForPublish("related-articles", {
      items: [{ enabled: true, title: "X", imageSrc: "https://cdn.example/a.webp", href: "javascript:alert(1)" }]
    });
    expect(badRelated.valid).toBe(false);
  });

  it("merges variable related articles and testimonial cards from v2 payload", async () => {
    const { mergeHomepageCmsV2Content } = await import("@/config/homepage-cms-v2");
    const merged = mergeHomepageCmsV2Content({
      testimonialCards: [{ id: "t1", authorName: "Sam", body: "Nice", rating: 4, productSlug: "p1" }],
      relatedArticles: {
        enabled: true,
        sectionTitle: "From the press",
        sectionLead: "Real coverage",
        browseAllHref: "/blog",
        items: [
          { id: "a1", title: "One", href: "https://a.com", imageSrc: "/a.jpg", enabled: true },
          { id: "a2", title: "Two", href: "https://b.com", imageSrc: "/b.jpg", enabled: true }
        ]
      }
    });
    expect(merged.testimonialCards).toHaveLength(1);
    expect(merged.relatedArticles.items).toHaveLength(2);
    expect(merged.relatedArticles.items[0]?.ctaLabel).toBe("Read Article");
    expect(merged.relatedArticles.sectionTitle).toBe("From the press");
    expect(merged.relatedArticles.sectionLead).toBe("Real coverage");
    expect(merged.relatedArticles.browseAllHref).toBe("/blog");
  });

  it("resolves CMS testimonials without filler author/product names", async () => {
    const { pickHomeTestimonialItemsFromCms } = await import(
      "@/sections/home/home-client-testimonials-section"
    );
    const items = pickHomeTestimonialItemsFromCms(
      [
        {
          id: "t1",
          enabled: true,
          authorName: "Asha",
          body: "Great drone.",
          rating: 5,
          productSlug: "drone-x",
          hrefOverride: "",
          avatarSrc: "",
          avatarAlt: "",
          sortOrder: 0
        },
        {
          id: "t2",
          enabled: true,
          authorName: "",
          body: "Missing author",
          rating: 4,
          productSlug: "drone-x",
          hrefOverride: "",
          avatarSrc: "",
          avatarAlt: "",
          sortOrder: 1
        }
      ],
      [
        {
          slug: "drone-x",
          name: "Drone X",
          image: { src: "https://cdn.example/drone.webp" }
        } as Product
      ],
      6
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.authorName).toBe("Asha");
    expect(items[0]?.productName).toBe("Drone X");
    expect(JSON.stringify(items)).not.toContain("Verified Customer");
  });

  it("wires Content → Homepage nav to /admin/cms", () => {
    const groups = buildAdminNavGroups("admin");
    const content = groups.find((group) => group.label === "Content");
    expect(content?.items.map((item) => ({ label: item.label, href: item.href }))).toEqual([
      { label: "Homepage", href: "/admin/cms" }
    ]);
    expect(adminRouteTitles.some((route) => route.href === "/admin/cms" && route.title === "Homepage")).toBe(true);
  });

  it("keeps registry editorKinds for the planned section set", () => {
    const kinds = new Set(homepageSectionRegistry.map((section) => section.editorKind));
    expect(kinds).toEqual(
      new Set([
        "hero-carousel",
        "mini-carousel",
        "product-shelf",
        "inter-shelf-banner",
        "full-viewport-banner",
        "mission-world",
        "reviews-section",
        "related-articles",
        "footer-view"
      ])
    );
  });

  it("hides empty optional banners and footer, but always shows testimonials and related articles", async () => {
    const { shouldShowInHomepageOutline } = await import("@/lib/cms/section-content-status");
    expect(shouldShowInHomepageOutline("footer", { contentReady: true })).toBe(false);
    expect(shouldShowInHomepageOutline("banner-inter-shelf-1", { contentReady: false })).toBe(false);
    expect(shouldShowInHomepageOutline("banner-inter-shelf-1", { contentReady: true })).toBe(true);
    expect(shouldShowInHomepageOutline("related-articles", { contentReady: false })).toBe(true);
    expect(shouldShowInHomepageOutline("testimonials", { contentReady: false })).toBe(true);
    expect(shouldShowInHomepageOutline("hero", { contentReady: false })).toBe(true);
  });

  it("uses semantic builder labels instead of Banner 1 / Product Shelf 1", async () => {
    const { getBuilderSectionLabel } = await import("@/config/homepage-section-registry");
    expect(getBuilderSectionLabel("shelf-drone-world")).toBe("Drone World shelf");
    expect(getBuilderSectionLabel("shelf-drone-care")).toBe("Drone Care shelf");
    expect(getBuilderSectionLabel("shelf-global-products")).toBe("Global Products shelf");
    expect(getBuilderSectionLabel("banner-inter-shelf-1")).toBe("After Drone World");
    expect(getBuilderSectionLabel("banner-inter-shelf-2")).toBe("After Drone Care");
    expect(getBuilderSectionLabel("banner-inter-shelf-3")).toBe("After Global Products");
    expect(getBuilderSectionLabel("banner-full-viewport-1")).toBe("Full-screen banner A");
    expect(getBuilderSectionLabel("banner-full-viewport-2")).toBe("Full-screen banner B");
    expect(getBuilderSectionLabel("testimonials")).toBe("Customer Testimonials");
    expect(getBuilderSectionLabel("related-articles")).toBe("Related Articles");
  });

  it("seeds related-articles and testimonials in homepage ordering and visibility", () => {
    const related = readFileSync(
      join(process.cwd(), "supabase/migrations/20260719100000_related_articles_section_visibility.sql"),
      "utf8"
    );
    expect(related).toContain("'related-articles'");
    expect(related).toContain("homepage_ordering");
    expect(related).toContain("section_visibility");

    const testimonials = readFileSync(
      join(process.cwd(), "supabase/migrations/20260719110000_testimonials_section_visible.sql"),
      "utf8"
    );
    expect(testimonials).toContain("'testimonials'");
    expect(testimonials).toContain("is_visible = true");
  });

  it("locks related articles editor to 3 slots without fake href defaults", () => {
    const editor = readFileSync(
      join(process.cwd(), "components/admin/cms/related-articles-section-editor.tsx"),
      "utf8"
    );
    expect(editor).toContain("RELATED_ARTICLE_SLOTS = 3");
    expect(editor).toContain("padRelatedArticleSlots");
    expect(editor).not.toContain("https://mithronsmart.com");
    expect(editor).toContain('name="section_title"');
    expect(editor).toContain('name="section_lead"');
    expect(editor).toContain('name="browse_all_href"');
  });

  it("caps testimonial cards at maxCount in the editor", () => {
    const editor = readFileSync(
      join(process.cwd(), "components/admin/cms/testimonials-section-editor.tsx"),
      "utf8"
    );
    expect(editor).toContain("atCardLimit");
    expect(editor).toContain("maxCards");
  });
});

describe("settings payload homepage preserve helper", () => {
  it("deep-merges without dropping homepage when reconstructing payload", () => {
    const existingPayload = {
      homepage: { hero: { slides: [{ id: "keep-me" }] }, v2: { version: 2 } },
      payload_version: 7,
      storefront: { currency: "INR" }
    };
    const nextWithoutHomepage = {
      storefront: { currency: "INR", locale: "en-IN" }
    };
    const preserved = {
      ...nextWithoutHomepage,
      ...(existingPayload.homepage !== undefined ? { homepage: existingPayload.homepage } : {}),
      ...(existingPayload.payload_version !== undefined ? { payload_version: existingPayload.payload_version } : {})
    };
    expect(preserved.homepage).toEqual(existingPayload.homepage);
    expect(preserved.payload_version).toBe(7);
    expect(preserved.storefront.locale).toBe("en-IN");
  });
});
