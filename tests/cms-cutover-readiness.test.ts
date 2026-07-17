import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildPublicCmsSnapshotFromRows,
  fallbackSnapshot,
  getCmsCutoverDiagnostics,
  type CmsRowsByTable
} from "@/services/cms";

function readWorkspaceFile(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const baseRows: CmsRowsByTable = {
  hero_banners: [],
  site_navigation: [
    { id: "agri-drones", label: "Agri Drones", href: "/agriculture", sort_order: 10 },
    { id: "mapping", label: "Survey Drones", href: "/mapping", sort_order: 20 }
  ],
  footer_columns: [
    { id: "products", title: "Products", sort_order: 10 },
    { id: "company", title: "Company", sort_order: 20 }
  ],
  footer_links: [
    { id: "footer-products-agri", column_id: "products", label: "Agri Drones", href: "/agriculture", sort_order: 10 },
    { id: "footer-company-care", column_id: "company", label: "Drone Care Centers", href: "/product/mithron-care-plus", sort_order: 10 }
  ],
  trust_cards: [],
  faqs: [
    { id: "deployment", scope: "product-support", question: "How is deployment qualified?", answer: "With published CMS content.", sort_order: 10 },
    { id: "draft-faq", scope: "product-support", question: "Draft?", answer: "Hidden", status: "draft", is_visible: true, sort_order: 20 }
  ],
  product_reviews: [
    { id: "review-atlas", reviewer_name: "Atlas Farms", body: "Remote published review.", product_slug: "source-agri-kisan-drone-small-8-liter", rating: 4.8, sort_order: 10 },
    { id: "review-draft", reviewer_name: "Draft", body: "Hidden draft", status: "draft", is_visible: true, sort_order: 20 }
  ],
  category_metadata: [
    { route_key: "agriculture", title: "Agriculture", subtitle: "Farm missions", hero_image: "https://cdn.example.com/agriculture.webp", sort_order: 10 },
    { route_key: "mapping", title: "Mapping", subtitle: "Survey missions", hero_image: "https://cdn.example.com/mapping.webp", sort_order: 20 },
    { route_key: "smart-farming", title: "Smart Farming", subtitle: "Crop intelligence", hero_image: "https://cdn.example.com/smart-farming.webp", sort_order: 30 }
  ],
  cms_pages: [],
  cms_sections: []
};

describe("CMS cutover readiness", () => {
  it("builds a remote-first snapshot with per-surface diagnostics", () => {
    const snapshot = buildPublicCmsSnapshotFromRows(baseRows);

    expect(snapshot.source).toBe("mixed");
    expect(snapshot.navigation[0]).toEqual({ label: "Agri Drones", href: "/agriculture" });
    expect(snapshot.footer.columns.map((column) => column.title)).toEqual(["Products", "Company"]);
    expect(snapshot.productSupport.faqs).toEqual([["How is deployment qualified?", "With published CMS content."]]);
    expect(snapshot.productSupport.reviews).toHaveLength(1);
    expect(snapshot.home.interests.map((interest) => interest.slug)).toEqual(expect.arrayContaining(["agriculture", "mapping", "smart-farming"]));

    expect(snapshot.diagnostics.surfaces.navigation.source).toBe("supabase");
    expect(snapshot.diagnostics.surfaces.reviews.source).toBe("supabase");
    expect(snapshot.diagnostics.surfaces.heroBanners.source).toBe("fallback");
    expect(snapshot.diagnostics.fallbackSurfaces).toContain("heroBanners");
    expect(snapshot.diagnostics.filteredDraftRows).toBeGreaterThanOrEqual(2);
  });

  it("falls back atomically for invalid CMS surfaces without dropping the whole storefront", () => {
    const snapshot = buildPublicCmsSnapshotFromRows({
      ...baseRows,
      site_navigation: [{ id: "broken", label: "", href: "", sort_order: 10 }],
      footer_links: [],
      product_reviews: []
    });

    expect(snapshot.navigation).toEqual(fallbackSnapshot.navigation);
    expect(snapshot.footer).toEqual(fallbackSnapshot.footer);
    expect(snapshot.productSupport.reviews).toEqual(fallbackSnapshot.productSupport.reviews);
    expect(snapshot.diagnostics.fallbackSurfaces).toEqual(expect.arrayContaining(["navigation", "footer", "reviews"]));
  });

  it("keeps the cutover additive, verifier-backed, and storefront-rendering safe", () => {
    const pageSource = readWorkspaceFile("app/(storefront)/page.tsx");
    const cmsSource = readWorkspaceFile("services/cms.ts");
    const verifier = readWorkspaceFile("tools/verify-enterprise-remote-workflows.mjs");
    const migrationPath = join(process.cwd(), "supabase/migrations/20260524000900_cms_cutover_readiness.sql");

    expect(existsSync(migrationPath)).toBe(true);
    expect(pageSource).toContain("HeroCarouselDynamic");
    expect(pageSource).toContain("cms.home.heroBanners");
    expect(pageSource).not.toContain("CmsHomeSection");
    expect(pageSource).not.toContain("sectionRenderers");
    expect(pageSource).not.toContain("ProductIconRail");
    expect(cmsSource).not.toContain("@/config/products");
    expect(cmsSource).toContain("getCmsCutoverDiagnostics");
    expect(cmsSource).toContain("MITHRON_CMS_STRICT");
    expect(cmsSource).toContain("fetchFooterLeadSettings");
    expect(verifier).toContain("verifyCmsCutoverReadiness");
    expect(verifier).toContain("fallbackRecovery");
    expect(verifier).toContain("publishedRows");
  });

  it("surfaces CMS cutover diagnostics for admin observability", () => {
    const diagnostics = getCmsCutoverDiagnostics(buildPublicCmsSnapshotFromRows(baseRows));

    expect(diagnostics.status).toBe("PARTIAL");
    expect(diagnostics.verifiedRemoteSurfaces).toEqual(expect.arrayContaining(["navigation", "footer", "faq", "reviews"]));
    expect(diagnostics.remainingFallbackSurfaces).toContain("heroBanners");
    expect(diagnostics.cleanupReady).toBe(false);
  });
});
