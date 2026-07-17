import { describe, expect, it } from "vitest";
import {
  jsonLdIncludesType,
  parseSitemapUrls,
  sitemapExcludesPath,
  sitemapIncludesPath
} from "./e2e/helpers/seo";

describe("production SEO helper utilities", () => {
  const sampleSitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://final-mithron-deploy.vercel.app/</loc></url>
  <url><loc>https://final-mithron-deploy.vercel.app/products</loc></url>
  <url><loc>https://final-mithron-deploy.vercel.app/category/agri-drones</loc></url>
  <url><loc>https://final-mithron-deploy.vercel.app/product/source-agri-kisan-drone-small-8-liter</loc></url>
</urlset>`;

  it("parses sitemap loc entries", () => {
    const urls = parseSitemapUrls(sampleSitemap);
    expect(urls).toHaveLength(4);
    expect(urls[2]).toContain("/category/agri-drones");
  });

  it("detects included storefront paths", () => {
    const urls = parseSitemapUrls(sampleSitemap);
    expect(sitemapIncludesPath(urls, "/products")).toBe(true);
    expect(sitemapIncludesPath(urls, "/product/")).toBe(true);
  });

  it("detects excluded private paths", () => {
    const urls = parseSitemapUrls(sampleSitemap);
    expect(sitemapExcludesPath(urls, "/cart")).toBe(true);
    expect(sitemapExcludesPath(urls, "/checkout")).toBe(true);
  });

  it("detects JSON-LD types inside array payloads", () => {
    const blocks = [JSON.stringify([
      { "@context": "https://schema.org", "@type": "Organization", name: "Mithron" },
      { "@context": "https://schema.org", "@type": "WebSite", name: "Mithron" }
    ])];

    expect(jsonLdIncludesType(blocks, "Organization")).toBe(true);
    expect(jsonLdIncludesType(blocks, "WebSite")).toBe(true);
    expect(jsonLdIncludesType(blocks, "Product")).toBe(false);
  });

  it("matches robots disallow contract from app source", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const robots = readFileSync(join(process.cwd(), "app/robots.ts"), "utf8");

    expect(robots).toContain('"/admin/"');
    expect(robots).toContain('"/checkout"');
    expect(robots).toContain('"/api/"');
    expect(robots).toContain("sitemap:");
  });
});
