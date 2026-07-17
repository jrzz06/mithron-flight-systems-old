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
  });
});
