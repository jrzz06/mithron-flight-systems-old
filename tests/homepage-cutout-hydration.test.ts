import { describe, expect, it } from "vitest";
import { hydrateDefaultStorefrontMedia } from "@/config/products-hydration";
import { getHomepageProducts } from "@/services/catalog";

hydrateDefaultStorefrontMedia();

const cutoutPattern = /catalog-cutouts\/v1\//i;
const wixContentPattern = /\/wix-content\//i;

describe("homepage image hydration", () => {
  it("serves Wix/original Supabase uploads, never catalog cutouts", async () => {
    const products = await getHomepageProducts();
    const agriKisan = products.find((product) => product.slug === "source-agri-kisan-drone-small-8-liter");

    expect(agriKisan).toBeDefined();
    expect(agriKisan?.image.src).not.toMatch(cutoutPattern);
    expect(agriKisan?.image.src).toMatch(/supabase\.co\/storage\/|\/cdn-media\/storage\//);
  });

  it("never serves catalog-cutouts as homepage card primaries", async () => {
    const products = await getHomepageProducts();
    const cutoutOffenders = products.filter((product) => cutoutPattern.test(product.image.src));

    expect(cutoutOffenders.map((product) => `${product.slug}:${product.image.src}`)).toEqual([]);
    expect(products.some((product) => wixContentPattern.test(product.image.src))).toBe(true);
  });
});
