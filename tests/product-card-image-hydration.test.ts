import { describe, expect, it } from "vitest";
import { hydrateDefaultStorefrontMedia } from "@/config/products-hydration";
import { getProducts } from "@/services/catalog";

hydrateDefaultStorefrontMedia();

const cutoutPattern = /catalog-cutouts\/v1\//i;
const wixContentPattern = /\/wix-content\//i;

describe("product card image hydration", () => {
  it("never uses catalog cutouts as product card primaries", async () => {
    const products = await getProducts();
    const cutoutOffenders = products.filter((product) => cutoutPattern.test(product.image.src));

    expect(cutoutOffenders.map((product) => `${product.slug}:${product.image.src}`)).toEqual([]);
  });

  it("keeps migrated products on wix-content Supabase uploads", async () => {
    const products = await getProducts();
    const wixPrimaries = products.filter((product) => wixContentPattern.test(product.image.src));

    expect(wixPrimaries.length).toBeGreaterThan(50);
  });
});
