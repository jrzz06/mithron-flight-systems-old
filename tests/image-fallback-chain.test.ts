import { describe, expect, it } from "vitest";
import { buildImageFallbackChain, buildResponsiveImageModel } from "@/lib/media/responsive-image-model";

describe("image fallback chain", () => {
  it("appends trusted remote HTTPS urls after supabase candidates", () => {
    const model = buildResponsiveImageModel({
      src: "https://example.supabase.co/storage/v1/object/public/mithron-products/catalog-cutouts/v1/demo.webp",
      responsive: {
        assetId: "demo",
        bucket: "mithron-products",
        assetRole: "product",
        category: "product",
        generatedPromptId: "demo",
        status: "generated",
        fallbackSrc: "https://static.wixstatic.com/media/demo.png",
        fallbackAlt: "Demo",
        width: 1200,
        height: 900,
        dominantColor: "#fff",
        variants: {
          webp: [
            {
              src: "https://example.supabase.co/storage/v1/object/public/mithron-products/demo-768w-v1.webp",
              width: 768,
              height: 576,
              format: "webp",
              storagePath: "catalog-cutouts/v1/demo-768w-v1.webp"
            }
          ]
        }
      },
      imageRole: "card"
    });

    expect(buildImageFallbackChain(model)).toEqual([
      model.primarySrc,
      model.resolvedSrc,
      model.responsive?.fallbackSrc
    ]);
  });

  it("appends responsive variant urls when useSourceImage is enabled", () => {
    const variantSrc = "https://example.supabase.co/storage/v1/object/public/mithron-products/demo-768w-v1.webp";
    const model = buildResponsiveImageModel({
      src: "https://example.supabase.co/storage/v1/object/public/mithron-products/catalog-cutouts/v1/demo.webp",
      useSourceImage: true,
      responsive: {
        assetId: "demo",
        bucket: "mithron-products",
        assetRole: "product",
        category: "product",
        generatedPromptId: "demo",
        status: "generated",
        fallbackSrc: "https://example.supabase.co/storage/v1/object/public/mithron-products/catalog-cutouts/v1/demo.webp",
        fallbackAlt: "Demo",
        width: 1200,
        height: 900,
        dominantColor: "#fff",
        variants: {
          webp: [
            {
              src: variantSrc,
              width: 768,
              height: 576,
              format: "webp",
              storagePath: "catalog-cutouts/v1/demo-768w-v1.webp"
            }
          ]
        }
      }
    });

    expect(buildImageFallbackChain(model)).toEqual([
      model.primarySrc,
      variantSrc
    ]);
  });
});
