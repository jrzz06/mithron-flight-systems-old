import { describe, expect, it } from "vitest";
import {
  buildPrimaryMediaAssetId,
  buildPrimaryMediaBackfill,
  mimeTypeFromStoragePath,
  parseStoragePublicUrl
} from "@/lib/media/backfill-primary-media";

const supabaseUrl = "https://ictnoydmxlywwxwnugal.supabase.co";

describe("primary media backfill", () => {
  it("parses Supabase public storage URLs", () => {
    expect(parseStoragePublicUrl(
      `${supabaseUrl}/storage/v1/object/public/mithron-products/source-example-480w.webp`
    )).toEqual({
      bucket: "mithron-products",
      storagePath: "source-example-480w.webp"
    });
  });

  it("builds canonical media_assets and product_media_assets rows without touching linked products", () => {
    const linkedSlugs = new Set(["already-linked"]);
    const result = buildPrimaryMediaBackfill({
      supabaseUrl,
      linkedSlugs,
      at: "2026-06-23T12:00:00.000Z",
      products: [
        { slug: "already-linked", name: "Linked Product", image: { src: `${supabaseUrl}/storage/v1/object/public/mithron-products/linked.webp`, width: 480, height: 480 } },
        {
          slug: "source-example",
          name: "Example Product",
          image: {
            src: `${supabaseUrl}/storage/v1/object/public/mithron-products/source-example-480w.webp`,
            alt: "Example alt",
            width: 480,
            height: 480
          }
        },
        { slug: "missing-image", name: "Missing Image", image: null }
      ]
    });

    expect(result.summary).toMatchObject({
      candidates: 3,
      linkedSkipped: 1,
      mediaAssets: 1,
      productMediaLinks: 1,
      skipped: 1,
      fallbackPreserved: true
    });

    const media = result.mediaAssets[0];
    const link = result.productMediaAssets[0];
    expect(media?.id).toBe(buildPrimaryMediaAssetId("source-example"));
    expect(media?.mime_type).toBe(mimeTypeFromStoragePath("source-example-480w.webp"));
    expect(link).toMatchObject({
      product_slug: "source-example",
      media_asset_id: buildPrimaryMediaAssetId("source-example"),
      usage: "primary",
      is_primary: true
    });
    expect(media?.upload_metadata).toMatchObject({ fallback_preserved: true });
  });
});
