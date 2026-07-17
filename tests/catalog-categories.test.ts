import { describe, expect, it } from "vitest";
import {
  CATALOG_CATEGORY_SLUGS,
  filterProductsForCategorySlug,
  getCatalogCategoryDefinition,
  getHomepageShelfCatalogHref,
  getProductsCatalogHref,
  interestSlugToCategorySlug,
  isDroneCareLegacyCatalogHref,
  isDroneCareStorefrontAlias,
  parseProductsCategoryParam,
  resolveCategoryHrefForInterest,
  resolveDroneCareStorefrontHref,
  ACCESSORIES_CATALOG_HREF
} from "@/lib/catalog-categories";
import type { Product } from "@/config/types";
import { getProducts, getProductsForCategorySlug } from "@/services/catalog";

const hasLiveCatalog =
  process.env.RUN_LIVE_CATALOG_TESTS === "1" &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim());

function product(slug: string, name: string, category = "Accessories"): Product {
  return {
    slug,
    productUrl: `/product/${slug}`,
    workflowStatus: "published",
    isVisible: true,
    name,
    tagline: "Catalog item",
    category,
    price: 100,
    image: { src: "/test.webp", alt: name, width: 100, height: 100 },
    hero: { src: "/test.webp", alt: name, width: 100, height: 100 },
    gallery: [],
    interests: [],
    specs: {},
    variants: [],
    bundles: [],
    hotspots: [],
    story: [],
    anchors: []
  };
}

describe("catalog categories", () => {
  it("defines the seven storefront category slugs and routes", () => {
    expect(CATALOG_CATEGORY_SLUGS).toEqual([
      "agri-drones",
      "video-drones",
      "creative-drones",
      "survey-drones",
      "surveillance-drones",
      "accessories",
      "global-products"
    ]);

    expect(getCatalogCategoryDefinition("global-products").href).toBe("/category/global-products");
    expect(getCatalogCategoryDefinition("agri-drones").href).toBe("/category/agri-drones");
    expect(getCatalogCategoryDefinition("survey-drones").categoryNames).toEqual(["Survey Drones"]);
  });

  it("maps legacy interest slugs to canonical category pages", () => {
    expect(resolveCategoryHrefForInterest("agriculture")).toBe("/category/agri-drones");
    expect(resolveCategoryHrefForInterest("mapping")).toBe("/category/survey-drones");
    expect(resolveCategoryHrefForInterest("industrial-inspection")).toBe("/category/global-products");
    expect(resolveCategoryHrefForInterest("unknown-interest")).toBe("/interest/unknown-interest");
    expect(interestSlugToCategorySlug.components).toBe("accessories");
  });

  it("builds homepage shelf catalog routes through the products catalog filter query", () => {
    expect(getHomepageShelfCatalogHref("drone-world")).toBe("/products?filter=drones");
    expect(getHomepageShelfCatalogHref("drone-care")).toBe("/products?filter=accessories-spare-parts");
    expect(getHomepageShelfCatalogHref("global-products")).toBe("/products?filter=global-products");
    expect(getProductsCatalogHref("global-products")).toBe("/products?filter=global-products");
    expect(getProductsCatalogHref("accessories-spare-parts")).toBe("/products?filter=accessories-spare-parts");
    expect(getProductsCatalogHref()).toBe("/products");
    expect(parseProductsCategoryParam("accessories")).toBe("accessories");
    expect(parseProductsCategoryParam("global-product")).toBe("global-products");
    expect(parseProductsCategoryParam("global-products")).toBe("global-products");
    expect(parseProductsCategoryParam("unknown")).toBeNull();
  });

  it("maps Drone Care storefront aliases to the accessories category page", () => {
    expect(resolveDroneCareStorefrontHref("/dronecare")).toBe(ACCESSORIES_CATALOG_HREF);
    expect(resolveDroneCareStorefrontHref("/drone-care")).toBe(ACCESSORIES_CATALOG_HREF);
    expect(resolveDroneCareStorefrontHref("/drone_care")).toBe(ACCESSORIES_CATALOG_HREF);
    expect(resolveDroneCareStorefrontHref("/product/mithron-care-plus")).toBe(ACCESSORIES_CATALOG_HREF);
    expect(resolveDroneCareStorefrontHref("/category/agri-drones")).toBe("/category/agri-drones");
    expect(isDroneCareStorefrontAlias("/DroneCare/")).toBe(true);
    expect(isDroneCareLegacyCatalogHref("/product/mithron-care-plus")).toBe(true);
  });

  it("lists every accessory by category without family dedupe", () => {
    const products = [
      product("source-namoag", "NamoAG"),
      product("source-aerofc-v2-flight-controller-compatible-with-open-source-firmware-and-gcs", "AeroFC V2 Flight Controller"),
      product("source-ag-fc-namoag-gps-with-aerogcs-green-software-combo", "Ag++ (FC), NamoAG GPS with AeroGCS Green Software Combo"),
      product("source-hobbywing-x8-3011-propellers-with-mount-ccw", "Hobbywing X8 3011 Propellers with Mount - CCW"),
      product("source-hobbywing-x8-3011-propellers-cw", "Hobbywing X8 3011 Propellers - CW")
    ];

    expect(filterProductsForCategorySlug(products, "accessories").map((item) => item.slug)).toEqual([
      "source-namoag",
      "source-aerofc-v2-flight-controller-compatible-with-open-source-firmware-and-gcs",
      "source-ag-fc-namoag-gps-with-aerogcs-green-software-combo",
      "source-hobbywing-x8-3011-propellers-with-mount-ccw",
      "source-hobbywing-x8-3011-propellers-cw"
    ]);
  });

  it("keeps survey products on the survey category shelf only", () => {
    const products = [
      product("source-pix4d-survey-software", "Pix4D Survey Software", "Survey Drones"),
      product("source-pix4d-survey-software-accessory", "Pix4D Survey Software", "Accessories"),
      product("source-namoag", "NamoAG", "Accessories")
    ];

    expect(filterProductsForCategorySlug(products, "survey-drones").map((item) => item.slug)).toEqual([
      "source-pix4d-survey-software"
    ]);
    expect(filterProductsForCategorySlug(products, "accessories").map((item) => item.slug)).toEqual([
      "source-pix4d-survey-software-accessory",
      "source-namoag"
    ]);
  });

  it("uses strict surveillance category matching", () => {
    const products = [
      product("source-10l-drone-with-safety-security", "10L Drone With Safety Security", "Surveillance Drones"),
      product("source-mini-x-nano-4k-videography-drone", "MINI X NANO 4K VIDEOGRAPHY DRONE", "Video Drones")
    ];

    expect(filterProductsForCategorySlug(products, "surveillance-drones").map((item) => item.slug)).toEqual([
      "source-10l-drone-with-safety-security"
    ]);
  });

  it.skipIf(!hasLiveCatalog)("loads published products for each category slug from the live catalog", async () => {
    const products = await getProducts();

    for (const slug of CATALOG_CATEGORY_SLUGS) {
      const categoryProducts = await getProductsForCategorySlug(slug);
      const filtered = filterProductsForCategorySlug(products, slug);
      expect(categoryProducts).toEqual(filtered);
      expect(categoryProducts.length).toBeGreaterThan(0);
    }
  });

  it.skipIf(!hasLiveCatalog)("includes Global Products in the global-products category", async () => {
    const globalProducts = await getProductsForCategorySlug("global-products");
    expect(globalProducts.map((product) => product.slug)).toEqual(
      expect.arrayContaining(["zio", "pixy-mr", "pixy-lr"])
    );
  });
});
