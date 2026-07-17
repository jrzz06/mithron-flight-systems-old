import { describe, expect, it } from "vitest";
import {
  getFeaturedProducts,
  getGlobalProductsForCatalog,
  getProductBySlug,
  getProducts,
  getProductsByInterest,
  getProductsForCatalog
} from "@/services/catalog";
import { isGlobalProductsCategory } from "@/lib/product-shelf-classification";

describe("catalog service", () => {
  it("loads the live Mithron product catalog from Supabase", async () => {
    const products = await getProducts();
    const uniqueSlugs = new Set(products.map((product) => product.slug));

    expect(products.length).toBeGreaterThanOrEqual(130);
    expect(uniqueSlugs.size).toBe(products.length);
    expect(products.some((product) => product.slug.startsWith("source-"))).toBe(true);
    expect(products.map((product) => product.slug)).toContain("source-agri-kisan-drone-small-8-liter");
    expect(products.every((product) => product.specs["Product ID"])).toBe(true);
  });

  it("returns actual source-backed product details, descriptions, prices, and images", async () => {
    const product = await getProductBySlug("source-agri-kisan-drone-small-8-liter");

    expect(product?.name).toBe("Agri Kisan Drone Small - 8 Liter");
    expect(product?.tagline).toContain("8-Liter Agri Kisan Drone");
    expect(product?.price).toBe(425000);
    expect(product?.image.src).toContain("supabase.co/storage/v1/object/public/mithron-products");
    expect(product?.specs["Product ID"]).toBe("mithron-agri-kisan-drone-small-8-liter");
  });

  it("builds storefront rails from database categories and interests", async () => {
    const featured = await getFeaturedProducts();
    const agriculture = await getProductsByInterest("agriculture");
    const components = await getProductsByInterest("components");

    expect(featured.length).toBeGreaterThanOrEqual(20);
    expect(agriculture.length).toBeGreaterThanOrEqual(20);
    expect(components.length).toBeGreaterThan(50);
    expect(agriculture.map((product) => product.slug)).toContain("source-agri-kisan-drone-small-8-liter");
    expect(components.map((product) => product.slug)).toContain("source-siyi-mk-32-agriculture-transmitter-rc-controller-hdmi");
    expect(await getProductBySlug("ag10-sprayer-drone")).toBeUndefined();
  });

  it("loads Global Products from the published catalog by category", async () => {
    const globalProducts = await getGlobalProductsForCatalog();
    const industrialRouteProducts = await getProductsForCatalog("industrial");

    expect(globalProducts.length).toBeGreaterThanOrEqual(3);
    expect(industrialRouteProducts).toEqual(globalProducts);
    expect(globalProducts.every((product) => isGlobalProductsCategory(product))).toBe(true);
    expect(globalProducts.map((product) => product.slug)).toEqual(
      expect.arrayContaining(["zio", "pixy-mr", "pixy-lr"])
    );
  });
});
