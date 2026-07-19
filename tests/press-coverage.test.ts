import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isValidExternalUrl } from "@/lib/press/validate-external-url";
import { pressCtaLabel } from "@/services/press-coverage";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("press coverage system", () => {
  it("defines press_coverage migration with RLS and published listing index", () => {
    const migration = source("supabase/migrations/20260716000100_press_coverage.sql");
    expect(migration).toContain("create table if not exists public.press_coverage");
    expect(migration).toContain("press_coverage_published_idx");
    expect(migration).toContain("press_coverage public published read");
    expect(migration).toContain("has_cms_permission('cms.write')");
    expect(migration).toContain("status = 'published'");
    expect(migration).toContain("yourstory.com/companies/mithron");
  });

  it("exposes press coverage service CRUD and published listing helpers", () => {
    const service = source("services/press-coverage.ts");
    expect(service).toContain("listAdminPressCoverage");
    expect(service).toContain("getPressCoverageById");
    expect(service).toContain("listPublishedPressCoverage");
    expect(service).toContain("createPressCoverage");
    expect(service).toContain("updatePressCoverage");
    expect(service).toContain("publishPressCoverage");
    expect(service).toContain("unpublishPressCoverage");
    expect(service).toContain("archivePressCoverage");
    expect(service).toContain("deletePressCoverage");
    expect(service).toContain("reorderPressCoverage");
    expect(service).toContain("status=eq.published");
    expect(service).toContain("order=sort_order.asc");
  });

  it("validates external article URLs and internal redirect paths", () => {
    expect(isValidExternalUrl("https://yourstory.com/companies/mithron")).toBe(true);
    expect(isValidExternalUrl("/blog/precision-farming")).toBe(true);
    expect(isValidExternalUrl("not-a-url")).toBe(false);
    expect(isValidExternalUrl("http://localhost/test")).toBe(false);
  });

  it("derives publisher CTA labels", () => {
    expect(pressCtaLabel("YOURSTORY")).toContain("YourStory");
    expect(pressCtaLabel("TRACXN")).toContain("Tracxn");
  });

  it("removes legacy press admin UI while keeping storefront press reads", () => {
    const nav = source("components/platform/nav-config.ts");
    expect(nav).not.toContain('label: "In the Press"');
    expect(nav).not.toContain('label: "Articles"');
    expect(nav).not.toContain('href: "/admin/press"');
  });

  it("renders CMS-driven press editorial cards on the homepage", () => {
    const section = source("sections/home/home-related-articles-section.tsx");
    const card = source("components/editorial/editorial-cover-card.tsx");
    const bundle = source("services/homepage-bundle.ts");
    const composite = source("sections/home/home-landing-composite.tsx");

    expect(section).toContain("EditorialCoverCard");
    expect(section).toContain('variant="press"');
    expect(section).toContain("pressItems");
    expect(section).not.toContain("pressLinkCards");
    expect(card).toContain('target="_blank"');
    expect(card).toContain('rel="noopener noreferrer"');
    expect(card).toContain("MithronCardImage");
    expect(card).toContain("item.publisher");
    expect(bundle).toContain("listPublishedPressCoverage({ limit: 40 })");
    expect(bundle).toContain("pressCoverage");
    expect(composite).toContain("pressItems={pressCoverage}");
  });
});
