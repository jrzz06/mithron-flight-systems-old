import { describe, expect, it } from "vitest";
import { hydrateDefaultStorefrontMedia } from "@/config/products-hydration";
import { getProducts } from "@/services/catalog";

hydrateDefaultStorefrontMedia();

const staleVariantPattern = /\/storage\/v1\/object\/public\/mithron-products\/[a-z0-9-]+-\d+w-v\d+\.[a-f0-9]+\.webp$/i;
const cutoutPattern = /catalog-cutouts\/v1\//i;

describe("product card image hydration", () => {
  it("prefers canonical cutout src over stale generated variant urls", async () => {
    const products = await getProducts();
    const offenders = products.filter((product) => {
      const fallbackSrc = product.image.responsive?.fallbackSrc?.trim() ?? "";
      if (!fallbackSrc || !cutoutPattern.test(fallbackSrc)) return false;
      return staleVariantPattern.test(product.image.src);
    });

    expect(offenders.map((product) => `${product.slug}:${product.image.src}`)).toEqual([]);
  });

  it("keeps primary image src aligned with supabase fallbackSrc when present", async () => {
    const products = await getProducts();
    const mismatched = products.filter((product) => {
      const fallbackSrc = product.image.responsive?.fallbackSrc?.trim() ?? "";
      if (!fallbackSrc || !cutoutPattern.test(fallbackSrc)) return false;
      return product.image.src !== fallbackSrc;
    });

    expect(mismatched.map((product) => `${product.slug}:${product.image.src}`)).toEqual([]);
  });
});
