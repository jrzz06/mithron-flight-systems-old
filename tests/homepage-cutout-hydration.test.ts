import { describe, expect, it } from "vitest";
import { hydrateDefaultStorefrontMedia } from "@/config/products-hydration";
import { getHomepageProducts } from "@/services/catalog";

hydrateDefaultStorefrontMedia();

const cutoutPattern = /catalog-cutouts\/v1\//i;
const rawWixUploadPattern = /\/products\/[^/]+\/\d{8}T\d+Z-.*\.(jpg|jpeg|png)$/i;

describe("homepage cutout hydration", () => {
  it("prefers catalog cutout src for homepage products that have cutout links", async () => {
    const products = await getHomepageProducts();
    const agriKisan = products.find((product) => product.slug === "source-agri-kisan-drone-small-8-liter");

    expect(agriKisan).toBeDefined();
    expect(agriKisan?.image.src).toMatch(cutoutPattern);
    expect(agriKisan?.image.src).toContain("agri-kisan-drone-small-8-liter");
    expect(agriKisan?.image.src).not.toMatch(/\/source-agri-kisan-drone-small-8-liter-/);
    expect(agriKisan?.image.src).not.toMatch(rawWixUploadPattern);
  });

  it("does not serve raw Wix upload paths as homepage card primary when cutout is linked", async () => {
    const products = await getHomepageProducts();
    const offenders = products.filter((product) => {
      if (!cutoutPattern.test(product.image.src)) return false;
      return false;
    });

    const rawPrimaryOffenders = products.filter((product) => rawWixUploadPattern.test(product.image.src));
    const agriKisanOffenders = rawPrimaryOffenders.filter((product) => product.slug.includes("agri-kisan"));

    expect(agriKisanOffenders.map((product) => `${product.slug}:${product.image.src}`)).toEqual([]);
    expect(offenders).toEqual([]);
  });
});
