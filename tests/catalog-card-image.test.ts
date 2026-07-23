import { describe, expect, it } from "vitest";
import type { Product } from "@/config/types";
import { buildCatalogCardImageCandidates, resolveCatalogCardImage } from "@/lib/media/catalog-card-image";

function product(overrides: Partial<Product> & Pick<Product, "slug">): Product {
  return {
    productUrl: `/product/${overrides.slug}`,
    name: overrides.name ?? overrides.slug,
    tagline: "test",
    category: "Agri Drones",
    price: 100,
    image: { src: "/primary.webp", alt: "primary", width: 100, height: 100 },
    hero: { src: "/hero.webp", alt: "hero", width: 100, height: 100 },
    gallery: [],
    interests: [],
    specs: {},
    variants: [],
    bundles: [],
    hotspots: [],
    story: [],
    anchors: [],
    workflowStatus: "published",
    isVisible: true,
    ...overrides
  };
}

describe("resolveCatalogCardImage", () => {
  it("keeps non-cutout primary src instead of swapping to a cutout fallbackSrc", () => {
    const resolved = resolveCatalogCardImage({
      src: "https://example.supabase.co/storage/v1/object/public/mithron-products/ag10-lite-480w-v1.2427a172.webp",
      alt: "Agri Kisan Drone Small",
      responsive: {
        assetId: "demo",
        bucket: "mithron-products",
        assetRole: "product",
        category: "product",
        generatedPromptId: "demo",
        status: "generated",
        fallbackSrc: "https://example.supabase.co/storage/v1/object/public/mithron-products/catalog-cutouts/v1/agri-kisan.webp",
        fallbackAlt: "Agri Kisan Drone Small",
        width: 1200,
        height: 900,
        dominantColor: "#fff",
        variants: {
          webp: [
            {
              src: "https://example.supabase.co/storage/v1/object/public/mithron-products/ag10-lite-480w-v1.2427a172.webp",
              storagePath: "ag10-lite-480w-v1.2427a172.webp",
              width: 480,
              height: 360,
              format: "webp"
            }
          ]
        }
      }
    });

    expect(resolved.src).toContain("ag10-lite-480w");
    expect(resolved.src).not.toContain("catalog-cutouts");
    expect(resolved.alt).toBe("Agri Kisan Drone Small");
  });

  it("keeps src when no supabase fallback exists", () => {
    const src = "https://example.supabase.co/storage/v1/object/public/mithron-products/demo.webp";
    const resolved = resolveCatalogCardImage({ src, alt: "Demo" });
    expect(resolved.src).toBe(src);
  });
});

describe("buildCatalogCardImageCandidates", () => {
  it("prefers primary/Wix original and ignores cutout hero fallback", () => {
    const cutoutSrc = "https://example.supabase.co/storage/v1/object/public/mithron-products/catalog-cutouts/v1/agri-kisan.webp";
    const rawSrc = "https://example.supabase.co/storage/v1/object/public/mithron-products/products/source-agri-kisan/raw.jpg";

    const candidates = buildCatalogCardImageCandidates(
      product({
        slug: "agri-kisan",
        image: { src: rawSrc, alt: "Raw upload", width: 800, height: 800 },
        hero: { src: cutoutSrc, alt: "Agri Kisan Drone Small", width: 1024, height: 1024 }
      })
    );

    expect(candidates[0]?.src).toBe(rawSrc);
    expect(candidates.map((item) => item.src)).not.toContain(cutoutSrc);
  });

  it("returns no candidates when only a cutout image exists", () => {
    const cutoutSrc = "https://example.supabase.co/storage/v1/object/public/mithron-products/catalog-cutouts/v1/demo.webp";
    const candidates = buildCatalogCardImageCandidates(
      product({
        slug: "demo",
        image: { src: cutoutSrc, alt: "Demo cutout", width: 1024, height: 1024 },
        hero: undefined,
        gallery: []
      })
    );

    expect(candidates).toEqual([]);
  });

  it("never includes cutout fallbackSrc in candidates", () => {
    const responsive = {
      assetId: "demo",
      bucket: "mithron-products" as const,
      assetRole: "product" as const,
      category: "product" as const,
      generatedPromptId: "demo",
      status: "generated" as const,
      fallbackSrc: "https://example.supabase.co/storage/v1/object/public/mithron-products/catalog-cutouts/v1/agri-kisan.webp",
      fallbackAlt: "Agri Kisan Drone Small",
      width: 1200,
      height: 900,
      dominantColor: "#fff",
      variants: {
        webp: [
          {
            src: "https://example.supabase.co/storage/v1/object/public/mithron-products/ag10-lite-480w-v1.2427a172.webp",
            storagePath: "ag10-lite-480w-v1.2427a172.webp",
            width: 480,
            height: 360,
            format: "webp" as const
          }
        ]
      }
    };

    const candidates = buildCatalogCardImageCandidates(
      product({
        slug: "agri-kisan",
        image: {
          src: "https://example.supabase.co/storage/v1/object/public/mithron-products/ag10-lite-480w-v1.2427a172.webp",
          alt: "Agri Kisan Drone Small",
          width: 480,
          height: 360,
          responsive
        },
        hero: undefined,
        gallery: []
      })
    );

    expect(candidates[0]?.src).toContain("ag10-lite-480w");
    expect(candidates.map((item) => item.src).some((src) => src.includes("catalog-cutouts"))).toBe(false);
  });

  it("dedupes repeated urls across image, hero, and gallery", () => {
    const sharedSrc = "https://example.supabase.co/storage/v1/object/public/mithron-products/shared.webp";
    const candidates = buildCatalogCardImageCandidates(
      product({
        slug: "shared",
        image: { src: sharedSrc, alt: "Shared", width: 100, height: 100 },
        hero: { src: sharedSrc, alt: "Shared hero", width: 100, height: 100 },
        gallery: [{ src: sharedSrc, alt: "Shared gallery", width: 100, height: 100 }]
      })
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.src).toBe(sharedSrc);
  });

  it("uses gallery original when primary is a cutout", () => {
    const candidates = buildCatalogCardImageCandidates(
      product({
        slug: "fallbacks",
        image: {
          src: "https://example.supabase.co/storage/v1/object/public/mithron-products/catalog-cutouts/v1/broken.webp",
          alt: "Cutout",
          width: 100,
          height: 100
        },
        hero: {
          src: "https://static.wixstatic.com/media/hero.jpg",
          alt: "Hero",
          width: 100,
          height: 100
        },
        gallery: [
          {
            src: "https://example.supabase.co/storage/v1/object/public/mithron-products/products/primary.webp",
            alt: "Gallery primary",
            width: 100,
            height: 100
          }
        ]
      })
    );

    expect(candidates.map((candidate) => candidate.src)).toEqual([
      "https://example.supabase.co/storage/v1/object/public/mithron-products/products/primary.webp"
    ]);
    expect(candidates.some((candidate) => candidate.src.includes("wixstatic.com"))).toBe(false);
    expect(candidates.some((candidate) => candidate.src.includes("catalog-cutouts"))).toBe(false);
  });

  it("allows ai-cutout primary for storefront cards", () => {
    const aiCutout = "https://example.supabase.co/storage/v1/object/public/mithron-products/products/demo/ai-cutout/abc.webp";
    const candidates = buildCatalogCardImageCandidates(
      product({
        slug: "demo",
        image: { src: aiCutout, alt: "Demo", width: 512, height: 512 },
        hero: undefined,
        gallery: []
      })
    );
    expect(candidates[0]?.src).toBe(aiCutout);
    expect(candidates[0]?.useSourceImage).toBe(true);
  });

  it("uses responsive variants for ai-cutout when present", () => {
    const aiCutout = "https://example.supabase.co/storage/v1/object/public/mithron-products/products/demo/ai-cutout/abc.webp";
    const thumb = "https://example.supabase.co/storage/v1/object/public/mithron-products/products/demo/ai-cutout/abc.thumbnail.webp";
    const candidates = buildCatalogCardImageCandidates(
      product({
        slug: "demo",
        image: {
          src: aiCutout,
          alt: "Demo",
          width: 1000,
          height: 1000,
          responsive: {
            assetId: "demo-cutout",
            bucket: "mithron-products",
            assetRole: "product",
            category: "product",
            generatedPromptId: "catalog.product-media",
            status: "generated",
            fallbackSrc: aiCutout,
            fallbackAlt: "Demo",
            width: 1000,
            height: 1000,
            dominantColor: "#f8f8f8",
            variants: {
              webp: [
                {
                  src: thumb,
                  storagePath: "products/demo/ai-cutout/abc.thumbnail.webp",
                  width: 320,
                  height: 320,
                  format: "webp"
                }
              ]
            }
          }
        },
        hero: undefined,
        gallery: []
      })
    );
    expect(candidates[0]?.src).toBe(aiCutout);
    expect(candidates[0]?.useSourceImage).toBe(false);
    expect(candidates[0]?.responsive?.variants.webp?.[0]?.src).toBe(thumb);
  });

  it("ignores CDN-rewritten legacy cutout URLs", () => {
    const cdnSrc = "/cdn-media/storage/v1/object/public/mithron-products/catalog-cutouts/v1/5-liter-agri-drone.webp";
    const candidates = buildCatalogCardImageCandidates(
      product({
        slug: "source-5-liter-agri-drone",
        image: { src: cdnSrc, alt: "5 Liter Agri Drone", width: 400, height: 430 },
        hero: undefined,
        gallery: []
      })
    );

    expect(candidates).toEqual([]);
  });
});
