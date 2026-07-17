import { describe, expect, it } from "vitest";
import { normalizeWixProduct } from "@/lib/wix/catalog-client";

describe("wix catalog client", () => {
  it("normalizes a stores v3 product payload", () => {
    const extractedAt = "2026-06-23T00:00:00.000Z";
    const normalized = normalizeWixProduct(
      {
        id: "prod-1",
        slug: "10l-agri-drone-best-price",
        name: "10L Agri Drone Best Price",
        visible: true,
        plainDescription: "GST Extra at 5%\n\nIncludes battery.",
        price: {
          price: {
            price: 341000,
            discountedPrice: 341000
          }
        },
        media: {
          items: [{ image: { url: "https://static.wixstatic.com/media/example.png" } }]
        },
        breadcrumbsInfo: {
          breadcrumbs: [{ name: "Store" }, { name: "Agri Drones" }]
        },
        updatedDate: extractedAt
      },
      extractedAt
    );

    expect(normalized).toMatchObject({
      wix_product_id: "prod-1",
      wix_slug: "10l-agri-drone-best-price",
      name: "10L Agri Drone Best Price",
      price: 341000,
      source_catalog_id: "mithron-10l-agri-drone-best-price",
      source_url: "https://www.mithron.co/product-page/10l-agri-drone-best-price",
      category: "Agri Drones",
      visible: true
    });
    expect(normalized?.media_urls).toContain("https://static.wixstatic.com/media/example.png");
    expect(normalized?.description_plain).toContain("GST Extra");
    expect(normalized?.rich.specs).toBeDefined();
    expect(normalized?.rich.info_sections).toBeDefined();
  });
});
