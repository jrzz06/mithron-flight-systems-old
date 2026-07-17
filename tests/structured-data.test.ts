import { describe, expect, it, beforeEach, afterEach } from "vitest";
import type { Product } from "@/config/types";
import {
  buildProductJsonLd,
  buildProductStructuredData,
  buildSiteStructuredData
} from "@/lib/structured-data";

const baseProduct: Product = {
  slug: "source-agri-kisan-drone-medium-10-liter",
  productUrl: "/product/source-agri-kisan-drone-medium-10-liter",
  name: "Agri Kisan Drone Medium - 10 Liter",
  tagline: "Field-ready spraying platform",
  price: 450000,
  category: "Agri Drones",
  interests: ["agriculture"],
  chargeTax: true,
  taxGroup: "agri-drones",
  taxRate: 5,
  taxIncluded: true,
  image: { src: "/media/mithron/products/agri-kisan.jpg", alt: "Agri Kisan drone" },
  hero: { src: "/media/mithron/products/agri-kisan-hero.jpg", alt: "Agri Kisan hero" },
  gallery: [],
  variants: [],
  bundles: [],
  story: [],
  specs: { Availability: "In stock" },
  anchors: ["Overview", "Specs"]
};

describe("structured data", () => {
  const previousSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://mithron.com";
  });

  afterEach(() => {
    if (previousSiteUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = previousSiteUrl;
    }
  });

  it("builds site organization and website schemas", () => {
    const schemas = buildSiteStructuredData();
    expect(schemas).toHaveLength(2);
    expect(schemas[0]).toMatchObject({
      "@type": "Organization",
      name: "Mithron",
      url: "https://mithron.com/"
    });
    expect(schemas[1]).toMatchObject({
      "@type": "WebSite",
      url: "https://mithron.com/"
    });
  });

  it("builds product offer pricing with inclusive GST totals", () => {
    const schema = buildProductJsonLd(baseProduct);
    expect(schema).toMatchObject({
      "@type": "Product",
      name: baseProduct.name,
      sku: baseProduct.slug,
      offers: {
        "@type": "Offer",
        priceCurrency: "INR",
        price: "450000.00",
        availability: "https://schema.org/InStock"
      }
    });
    expect(schema.image).toEqual([
      "https://mithron.com/media/mithron/products/agri-kisan-hero.jpg",
      "https://mithron.com/media/mithron/products/agri-kisan.jpg"
    ]);
  });

  it("includes breadcrumb structured data for product pages", () => {
    const schemas = buildProductStructuredData(baseProduct);
    expect(schemas).toHaveLength(2);
    expect(schemas[1]).toMatchObject({
      "@type": "BreadcrumbList",
      itemListElement: [
        { position: 1, name: "Home", item: "https://mithron.com/" },
        { position: 2, name: "Products", item: "https://mithron.com/products" },
        {
          position: 3,
          name: baseProduct.name,
          item: "https://mithron.com/product/source-agri-kisan-drone-medium-10-liter"
        }
      ]
    });
  });
});
