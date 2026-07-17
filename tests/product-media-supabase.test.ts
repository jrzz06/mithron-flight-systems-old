import { describe, expect, it } from "vitest";
import {
  assertAllowedProductMediaUrl,
  isAllowedProductMediaUrl,
  isBlockedExternalMediaUrl,
  isWixStaticUrl
} from "@/lib/media/is-blocked-external-media-url";
import {
  buildMigratedProductMediaFields,
  buildProductMediaJson,
  collectExternalProductMediaUrls,
  collectSupabaseProductMediaUrls
} from "@/lib/media/ingest-external-product-url";
import { parseExternalMediaIngestCliArgs } from "@/lib/media/run-external-product-media-ingest";

const SUPABASE_URL = "https://example.supabase.co/storage/v1/object/public/mithron-products/test.webp";
const WIX_URL = "https://static.wixstatic.com/media/abc.png";

describe("blocked external media URLs", () => {
  it("detects Wix static URLs", () => {
    expect(isWixStaticUrl(WIX_URL)).toBe(true);
    expect(isBlockedExternalMediaUrl(WIX_URL)).toBe(true);
  });

  it("allows Supabase storage URLs", () => {
    expect(isAllowedProductMediaUrl(SUPABASE_URL)).toBe(true);
    expect(isBlockedExternalMediaUrl(SUPABASE_URL)).toBe(false);
  });

  it("allows local storefront paths", () => {
    expect(isAllowedProductMediaUrl("/assets/hero/hero-slide-01.webp")).toBe(true);
  });

  it("rejects Wix URLs in admin validation", () => {
    expect(() => assertAllowedProductMediaUrl(WIX_URL, "image_src")).toThrow(/cannot use Wix URLs/);
  });

  it("rejects non-Supabase external HTTPS URLs", () => {
    expect(() => assertAllowedProductMediaUrl("https://example.com/image.jpg", "gallery_urls")).toThrow(/Supabase storage URL/);
  });
});

describe("external product media collection", () => {
  it("collects unique external URLs across image, hero, gallery, and source_images", () => {
    const urls = collectExternalProductMediaUrls({
      slug: "test-drone",
      name: "Test Drone",
      image: { src: WIX_URL },
      hero: { src: WIX_URL },
      gallery: [{ src: "https://cdn.example.com/gallery-1.jpg" }],
      source_images: [{ src: "https://cdn.example.com/gallery-1.jpg" }, WIX_URL]
    });

    expect(urls).toEqual([
      WIX_URL,
      "https://cdn.example.com/gallery-1.jpg"
    ]);
  });

  it("skips Supabase URLs when collecting externals", () => {
    const urls = collectExternalProductMediaUrls({
      slug: "test-drone",
      name: "Test Drone",
      image: { src: SUPABASE_URL },
      gallery: [{ src: WIX_URL }]
    });

    expect(urls).toEqual([WIX_URL]);
    expect(collectSupabaseProductMediaUrls({
      slug: "test-drone",
      name: "Test Drone",
      image: { src: SUPABASE_URL },
      gallery: [{ src: WIX_URL }]
    })).toEqual([SUPABASE_URL]);
  });
});

describe("migrated product media fields", () => {
  it("builds image, hero, gallery, and source_images from ingested uploads", () => {
    const fields = buildMigratedProductMediaFields({
      productName: "Test Drone",
      ingested: [
        {
          sourceUrl: WIX_URL,
          publicUrl: SUPABASE_URL,
          mediaAssetId: "media-1",
          bucket: "mithron-products",
          storagePath: "products/test-drone/test.webp",
          width: 1200,
          height: 900
        },
        {
          sourceUrl: "https://cdn.example.com/gallery-1.jpg",
          publicUrl: "https://example.supabase.co/storage/v1/object/public/mithron-products/gallery-1.webp",
          mediaAssetId: "media-2",
          bucket: "mithron-products",
          storagePath: "products/test-drone/gallery-1.webp",
          width: 800,
          height: 600
        }
      ]
    });

    expect(fields.image).toEqual(buildProductMediaJson({
      src: SUPABASE_URL,
      alt: "Test Drone",
      width: 1200,
      height: 900
    }));
    expect(fields.hero).toEqual(fields.image);
    expect(fields.gallery).toHaveLength(2);
    expect(fields.source_images).toHaveLength(2);
  });
});

describe("ingest external media CLI", () => {
  it("defaults to dry-run unless --apply is passed", () => {
    expect(parseExternalMediaIngestCliArgs(["--all"]).apply).toBe(false);
    expect(parseExternalMediaIngestCliArgs(["--apply", "--all"]).apply).toBe(true);
    expect(parseExternalMediaIngestCliArgs(["--published-only", "--limit=10"]).publishedOnly).toBe(true);
    expect(parseExternalMediaIngestCliArgs(["--slug=layam"]).slug).toBe("layam");
  });
});
