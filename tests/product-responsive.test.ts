import { describe, expect, it } from "vitest";
import { buildProductResponsiveAsset } from "@/lib/media/product-responsive";

describe("product responsive hydration", () => {
  it("maps uploaded product responsive variants into storefront delivery metadata", () => {
    const responsive = buildProductResponsiveAsset(
      {
        id: "media-product-demo",
        bucket: "mithron-products",
        public_url: "https://example.supabase.co/storage/v1/object/public/mithron-products/products/demo/source.png",
        width: 2048,
        height: 2048,
        responsive_variants: {
          generated: {
            thumbnail: {
              format: "webp",
              public_url: "https://example.supabase.co/storage/v1/object/public/mithron-products/products/demo/source.thumbnail.webp",
              storage_path: "products/demo/source.thumbnail.webp",
              width: 320,
              height: 320,
              size_bytes: 4200
            },
            large: {
              format: "webp",
              public_url: "https://example.supabase.co/storage/v1/object/public/mithron-products/products/demo/source.large.webp",
              storage_path: "products/demo/source.large.webp",
              width: 1600,
              height: 1600,
              size_bytes: 182000
            }
          }
        }
      },
      "Demo product"
    );

    expect(responsive?.status).toBe("generated");
    expect(responsive?.variants.webp?.map((variant) => variant.width)).toEqual([320, 1600]);
    expect(responsive?.fallbackSrc).toContain("source.png");
    expect(responsive?.dominantColor).toBe("#f8f8f8");
  });

  it("uses transparent dominantColor for ai-cutout assets", () => {
    const responsive = buildProductResponsiveAsset(
      {
        id: "product.ai-cutout.demo.01.abc",
        bucket: "mithron-products",
        storage_path: "products/demo/ai-cutout/01-abc.webp",
        public_url: "https://example.supabase.co/storage/v1/object/public/mithron-products/products/demo/ai-cutout/01-abc.webp",
        width: 1000,
        height: 1000,
        responsive_variants: {
          generated: {
            thumbnail: {
              format: "webp",
              public_url: "https://example.supabase.co/storage/v1/object/public/mithron-products/products/demo/ai-cutout/01-abc.thumbnail.webp",
              storage_path: "products/demo/ai-cutout/01-abc.thumbnail.webp",
              width: 320,
              height: 320,
              size_bytes: 12000
            },
            medium: {
              format: "webp",
              public_url: "https://example.supabase.co/storage/v1/object/public/mithron-products/products/demo/ai-cutout/01-abc.medium.webp",
              storage_path: "products/demo/ai-cutout/01-abc.medium.webp",
              width: 960,
              height: 960,
              size_bytes: 48000
            }
          }
        }
      },
      "Demo cutout"
    );

    expect(responsive?.dominantColor).toBe("transparent");
    expect(responsive?.variants.webp?.map((variant) => variant.width)).toEqual([320, 960]);
  });
});
