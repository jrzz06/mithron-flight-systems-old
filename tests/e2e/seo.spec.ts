import { expect, test } from "@playwright/test";
import { navigateToKnownProductPdp } from "./helpers/product";
import {
  fetchRobotsText,
  fetchSitemapUrls,
  jsonLdIncludesType,
  readPageSeo,
  sitemapExcludesPath,
  sitemapIncludesPath
} from "./helpers/seo";

test.describe("Production SEO testing", () => {
  test("sitemap.xml includes core storefront URLs", async ({ request, baseURL }) => {
    const urls = await fetchSitemapUrls(request, baseURL!);

    expect(urls.length).toBeGreaterThan(5);
    expect(sitemapIncludesPath(urls, "/products")).toBe(true);
    expect(sitemapIncludesPath(urls, "/category/agri-drones")).toBe(true);
    expect(sitemapIncludesPath(urls, "/product/")).toBe(true);
    expect(sitemapExcludesPath(urls, "/cart")).toBe(true);
    expect(sitemapExcludesPath(urls, "/checkout")).toBe(true);
  });

  test("robots.txt disallows private paths and references sitemap", async ({ request, baseURL }) => {
    const robots = await fetchRobotsText(request, baseURL!);

    expect(robots).toContain("Disallow: /admin/");
    expect(robots).toContain("Disallow: /checkout");
    expect(robots).toContain("Disallow: /api/");
    expect(robots.toLowerCase()).toContain("sitemap:");
  });

  test("homepage exposes organization and website structured data", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const seo = await readPageSeo(page);

    expect(seo.title.toLowerCase()).toContain("mithron");
    expect(jsonLdIncludesType(seo.jsonLd, "Organization")).toBe(true);
    expect(jsonLdIncludesType(seo.jsonLd, "WebSite")).toBe(true);
  });

  test("product detail page exposes metadata and product JSON-LD", async ({ page }) => {
    await navigateToKnownProductPdp(page);
    const seo = await readPageSeo(page);

    expect(seo.title.length).toBeGreaterThan(10);
    expect(seo.description.length).toBeGreaterThan(0);
    expect(seo.canonical.length).toBeGreaterThan(0);
    expect(jsonLdIncludesType(seo.jsonLd, "Product")).toBe(true);
    expect(jsonLdIncludesType(seo.jsonLd, "BreadcrumbList")).toBe(true);
  });

  test("catalog page has a document title", async ({ page }) => {
    await page.goto("/products", { waitUntil: "domcontentloaded" });
    const seo = await readPageSeo(page);

    expect(seo.title.length).toBeGreaterThan(0);
    expect(seo.title.toLowerCase()).toMatch(/mithron|products|catalog/i);
  });
});
