import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertWritableCmsTable } from "@/lib/cms/deprecated-tables";
import { assertOptionalCmsMediaSrc, assertValidCmsMediaSrc } from "@/lib/cms/media-validation";
import { isCmsStrictMode } from "@/lib/cms/strict-mode";
import { mergeHomepageCmsContent } from "@/services/homepage-cms";
import { getDefaultHomepageCmsContent } from "@/config/homepage-cms";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("CMS production hardening", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("enables strict mode in production runtime or when MITHRON_CMS_STRICT=true", () => {
    expect(isCmsStrictMode({ NODE_ENV: "development" })).toBe(false);
    expect(isCmsStrictMode({ NODE_ENV: "development", MITHRON_CMS_STRICT: "true" })).toBe(true);
    expect(isCmsStrictMode({ NODE_ENV: "production" })).toBe(true);
    expect(isCmsStrictMode({ NODE_ENV: "production", NEXT_PHASE: "phase-production-build" })).toBe(false);
  });

  it("blocks writes to removed legacy storefront tables", () => {
    expect(() => assertWritableCmsTable("homepage_sections")).toThrow(/removed/i);
    expect(() => assertWritableCmsTable("testimonials")).toThrow(/removed/i);
    expect(() => assertWritableCmsTable("hero_banners")).not.toThrow();
  });

  it("validates CMS media paths on save", () => {
    expect(assertValidCmsMediaSrc("/media/hero.jpg", "Hero image")).toBe("/media/hero.jpg");
    expect(() => assertValidCmsMediaSrc("", "Hero image")).toThrow(/required/i);
    expect(() => assertValidCmsMediaSrc("http://evil.example/x.jpg", "Hero image")).toThrow(/HTTPS/i);
    expect(assertOptionalCmsMediaSrc("", "Hero image")).toBe("");
  });

  it("merges saved fields and uses storefront base layer for missing fields", () => {
    const merged = mergeHomepageCmsContent({
      testimonials: { title: "Live testimonials title" }
    });

    expect(merged.testimonials.title).toBe("Live testimonials title");
    expect(merged.testimonials.eyebrow).toBe(getDefaultHomepageCmsContent().testimonials.eyebrow);
    expect(merged.shelves.droneWorld.title).toBe("Drone World");
  });

  it("still merges TypeScript defaults in non-strict development", () => {
    vi.stubEnv("MITHRON_CMS_STRICT", "false");
    vi.stubEnv("NODE_ENV", "development");

    const merged = mergeHomepageCmsContent({});
    expect(merged.testimonials.eyebrow).toBe(getDefaultHomepageCmsContent().testimonials.eyebrow);
  });

  it("surfaces draft → publish UX in the section editor", () => {
    const editor = source("features/admin/cms/cms-section-editor.tsx");
    const miniCarousel = source("components/admin/cms/mini-carousel-slot-editor.tsx");
    expect(editor).toContain("CmsEditorActionBar");
    expect(editor).toContain("isDirty");
    expect(editor).toContain("CmsLivePreviewPanel");
    expect(editor).toContain("publishHomepageV2ClientAction");
    expect(editor).toContain("HomepageSectionPreview");
    expect(editor).not.toContain("AdminStickyActionFooter");
    expect(miniCarousel).not.toContain("AdminStickyActionFooter");
    expect(miniCarousel).not.toContain("Save Draft");
  });

  it("disables deprecated CMS table actions in advanced workspace", () => {
    const workspace = source("features/admin/cms/cms-visual-workspace.tsx");
    expect(workspace).toContain("isDeprecatedCmsStorefrontTable");
    expect(workspace).toContain("data-cms-deprecated-actions-notice");
    expect(workspace).not.toContain("saveHomepageSectionDraftFormAction");
    expect(workspace).not.toContain("saveHomepageOrderingDraftFormAction");
  });
});
