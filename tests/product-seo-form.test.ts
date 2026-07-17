import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildProductSeoDraftFromFormData } from "@/services/product-admin-forms";
import { buildProductMetadata } from "@/services/product-metadata";
import type { Product } from "@/config/types";

function formData(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

describe("product seo workflow", () => {
  it("maps product seo form data into an auditable mithron_products workflow input", () => {
    expect(buildProductSeoDraftFromFormData(formData({
      product_slug: "source-agri-kisan-drone-small-8-liter",
      seo_title: "Agri Kisan Drone Small | Mithron Flight Systems",
      seo_description: "Premium agricultural drone with modular payload delivery.",
      og_title: "Agri Kisan Drone Small | Mithron",
      og_description: "Cinematic product preview for social sharing.",
      og_image: "{\"src\":\"/assets/products/agri-8l-og.webp\",\"alt\":\"Agri Kisan Drone Small\"}",
      change_summary: "Update product SEO metadata"
    }))).toEqual({
      table: "mithron_products",
      identity: {
        slug: "source-agri-kisan-drone-small-8-liter"
      },
      fields: {
        seo_title: "Agri Kisan Drone Small | Mithron Flight Systems",
        seo_description: "Premium agricultural drone with modular payload delivery.",
        og_title: "Agri Kisan Drone Small | Mithron",
        og_description: "Cinematic product preview for social sharing.",
        og_image: {
          src: "/assets/products/agri-8l-og.webp",
          alt: "Agri Kisan Drone Small"
        }
      },
      entityId: "source-agri-kisan-drone-small-8-liter",
      changeSummary: "Update product SEO metadata"
    });
  });

  it("builds product metadata from the schema-true SEO fields without changing storefront URLs", () => {
    const product = {
      slug: "source-agri-kisan-drone-small-8-liter",
      productUrl: "/product/source-agri-kisan-drone-small-8-liter",
      name: "Agri Kisan Drone Small",
      tagline: "Compact field deployment platform",
      seoTitle: "Agri Kisan Drone Small | Mithron Flight Systems",
      seoDescription: "Premium agricultural drone with modular payload delivery.",
      ogTitle: "Agri Kisan Drone Small | Mithron",
      ogDescription: "Cinematic product preview for social sharing.",
      ogImage: {
        src: "/assets/products/agri-8l-og.webp",
        alt: "Agri Kisan Drone Small",
        kind: "image",
        local: true
      },
      price: 120000,
      category: "Agri Drones",
      interests: [],
      image: {
        src: "/assets/products/agri-8l.webp",
        alt: "Agri Kisan Drone Small",
        kind: "image",
        local: true
      },
      hero: {
        src: "/assets/products/agri-8l-hero.webp",
        alt: "Agri Kisan Drone Small",
        kind: "image",
        local: true
      },
      gallery: [],
      variants: [],
      bundles: [],
      story: [],
      specs: {},
      anchors: []
    } satisfies Product;

    const metadata = buildProductMetadata(product);
    const openGraph = metadata.openGraph as {
      title?: string;
      description?: string;
      images?: Array<{ url: string; alt?: string }>;
    };
    const twitter = metadata.twitter as unknown as {
      title?: string;
      description?: string;
      images?: string[];
    };

    expect(metadata.title).toBe("Agri Kisan Drone Small | Mithron Flight Systems");
    expect(metadata.description).toBe("Premium agricultural drone with modular payload delivery.");
    expect(metadata.alternates?.canonical).toBe("/product/source-agri-kisan-drone-small-8-liter");
    expect(openGraph.title).toBe("Agri Kisan Drone Small | Mithron");
    expect(openGraph.description).toBe("Cinematic product preview for social sharing.");
    expect(openGraph.images?.[0]).toMatchObject({
      url: "/assets/products/agri-8l-og.webp",
      alt: "Agri Kisan Drone Small"
    });
    expect(twitter.title).toBe("Agri Kisan Drone Small | Mithron");
    expect(twitter.description).toBe("Cinematic product preview for social sharing.");
    expect(twitter.images?.[0]).toBe("/assets/products/agri-8l-og.webp");
  });

  it("wires the product seo form and metadata helper without changing storefront loaders", () => {
    const pageSource = readFileSync(join(process.cwd(), "app/admin/products/page.tsx"), "utf8");
    const actionSource = readFileSync(join(process.cwd(), "app/admin/products/actions.ts"), "utf8");
    const pageSourceFront = readFileSync(join(process.cwd(), "app/(storefront)/product/[slug]/page.tsx"), "utf8");
    const helperSource = readFileSync(join(process.cwd(), "services/product-metadata.ts"), "utf8");

    expect(pageSource).toContain("saveProductSeoFormAction");
    expect(pageSource).toContain("data-product-seo-table=\"mithron_products\"");
    expect(actionSource).toContain("buildProductSeoDraftFromFormData");
    expect(actionSource).toContain("saveProductSeoFormAction");
    expect(pageSourceFront).toContain("buildProductMetadata");
    expect(helperSource).toContain("seoTitle");
    expect(helperSource).toContain("alternates");
  });
});
