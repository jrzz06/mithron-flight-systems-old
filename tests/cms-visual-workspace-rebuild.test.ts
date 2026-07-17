import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("CMS visual workspace rebuild", () => {
  it("moves the CMS route into a page-based visual workspace shell", () => {
    const page = source("app/admin/cms/page.tsx");
    const workspace = source("features/admin/cms/cms-visual-workspace.tsx");
    const registry = source("config/cms-workspace.ts");

    expect(page).toContain("CmsVisualWorkspace");
    expect(page).toContain("CMS_WORKSPACE_PAGES");
    expect(workspace).toContain("data-cms-page-sidebar");
    expect(workspace).toContain("data-cms-page-nav-item");
    expect(registry).toContain("Homepage");
    expect(registry).toContain("Category Banners");
    expect(registry).toContain("Footer");
    expect(registry).toContain("Navigation");
    expect(registry).toContain("FAQs");
    expect(registry).toContain("Promotional Campaigns");
    expect(registry).toContain("Section Visibility");
    expect(workspace).toContain("data-cms-section-tree");
    expect(workspace).toContain("data-cms-active-section");
    expect(workspace).toContain("data-cms-page-anchor");
    expect(workspace).toContain("data-cms-route-path");
    expect(workspace).not.toContain("Image JSON");
    expect(workspace).not.toContain("Hero image URL");
  });

  it("provides visual section editing, media picking, and responsive previews", () => {
    const workspace = source("features/admin/cms/cms-visual-workspace.tsx");

    expect(workspace).toContain("data-cms-visual-editor");
    expect(workspace).toContain("data-cms-section-preview");
    expect(workspace).toContain("data-cms-section-controls");
    expect(workspace).toContain("data-cms-media-picker");
    expect(workspace).toContain("data-cms-upload-image");
    expect(workspace).toContain("Select from media library");
    expect(workspace).toContain("Drop image here");
    expect(workspace).toContain("data-cms-desktop-preview");
    expect(workspace).toContain("data-cms-tablet-preview");
    expect(workspace).toContain("data-cms-mobile-preview");
    expect(workspace).toContain("data-cms-live-preview");
    expect(workspace).toContain("useDeferredValue");
    expect(workspace).toContain("resolveInitialWorkspaceSelection");
  });

  it("keeps save and publish actions sticky while hiding technical workflows", () => {
    const workspace = source("features/admin/cms/cms-visual-workspace.tsx");
    const actions = source("app/admin/cms/actions.ts");

    expect(workspace).toContain("data-cms-sticky-action-bar");
    expect(workspace).toContain("Save Draft");
    expect(workspace).toContain("Preview");
    expect(workspace).toContain("Publish");
    expect(workspace).toContain("Restore");
    expect(workspace).toContain("data-cms-autosave-indicator");
    expect(workspace).toContain("data-cms-unsaved-warning");
    expect(workspace).toContain("saveHeroBannerDraftFormAction");
    expect(workspace).toContain("isDeprecatedCmsStorefrontTable");
    expect(workspace).toContain("data-cms-deprecated-actions-notice");
    expect(workspace).not.toContain("saveHomepageSectionDraftFormAction");
    expect(workspace).toContain("saveSiteNavigationDraftFormAction");
    expect(workspace).toContain("saveFooterColumnDraftFormAction");
    expect(workspace).toContain("saveFooterLinkDraftFormAction");
    expect(workspace).toContain("/admin/reviews");
    expect(workspace).not.toContain("saveProductReviewDraftFormAction");
    expect(workspace).toContain("saveCategoryMetadataDraftFormAction");
    expect(actions).toContain("restoreContentRevisionAction");
    expect(workspace).not.toContain("PATCH");
    expect(workspace).not.toContain("AUDITED");
    expect(workspace).not.toContain("WORKFLOW");
  });

  it("routes admin quick links through the CMS workspace registry anchors", () => {
    const registry = source("config/cms-workspace.ts");
    const nav = source("components/platform/nav-config.ts");
    const topbar = source("components/platform/platform-topbar.tsx");
    const workspace = source("features/admin/cms/cms-visual-workspace.tsx");

    expect(registry).toContain("cms-section-hero-banners");
    expect(registry).toContain("cms-page-category-banners");
    expect(nav).toContain("/admin/cms");
    expect(nav).toContain("/admin/media");
    expect(topbar).toContain("CMS_WORKSPACE_LINKS.hero");
    expect(topbar).toContain("CMS_WORKSPACE_LINKS.categoryBanners");
    expect(workspace).toContain("window.location.hash");
    expect(workspace).toContain("replaceHash(section.anchor)");
  });
});

