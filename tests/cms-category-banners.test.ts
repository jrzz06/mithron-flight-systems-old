import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { catalogRoutes } from "@/config/catalog-routes";
import { fallbackSnapshot } from "@/services/cms";

describe("category banner metadata", () => {
  it("seeds fallback category banners from catalog routes", () => {
    expect(fallbackSnapshot.categories.videoDrones?.showcaseImage?.src).toBe(
      catalogRoutes.videoDrones.showcaseImage?.src
    );
    expect(fallbackSnapshot.categories.agriculture?.title).toBe("Agri drones");
  });

  it("always loads category_metadata for storefront category pages", () => {
    const cmsSource = readFileSync(join(process.cwd(), "services/cms.ts"), "utf8");
    expect(cmsSource).toContain('fetchCmsRows("category_metadata", publicCmsQueries.categoryMetadata)');
    expect(cmsSource).not.toContain('load("category_metadata") ? fetchCmsRows("category_metadata"');
  });

  it("merges CMS category metadata with catalog route fallbacks", () => {
    const cmsSource = readFileSync(join(process.cwd(), "services/cms.ts"), "utf8");
    expect(cmsSource).toContain("mergeCategoryMetadata(routeKey, snapshot.categories[routeKey])");
    expect(cmsSource).toContain("catalogRouteCategories");
  });
});
