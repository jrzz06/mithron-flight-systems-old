import { describe, expect, it } from "vitest";

import {
  buildCanonicalMediaBackfill,
  parseCliArgs
} from "../tools/backfill-canonical-media.mjs";

const supabaseUrl = "https://ictnoydmxlywwxwnugal.supabase.co";

describe("canonical media backfill tooling", () => {
  it("maps mithron_assets rows into durable media_assets without changing storefront cutover state", () => {
    const result = buildCanonicalMediaBackfill({
      supabaseUrl,
      at: "2026-05-25T12:00:00.000Z",
      products: [
        {
          slug: "source-agri-kisan-drone-small-8-liter",
          name: "Agri Kisan Drone Small 8 Liter",
          source_catalog_id: "mithron-agri-kisan-drone-small-8-liter"
        }
      ],
      assets: [
        {
          asset_id: "retrieved.product.ag10-lite.768.avif.ed7a4ce8",
          product_slug: "source-agri-kisan-drone-small-8-liter",
          source_catalog_id: "mithron-agri-kisan-drone-small-8-liter",
          generated_prompt_id: "retrieved.product.ag10-lite",
          category: "products",
          bucket: "mithron-products",
          storage_path: "ag10-lite-768w-v1.ed7a4ce8.avif",
          asset_role: "product",
          width: 768,
          height: 768,
          variant_width: 768,
          format: "avif",
          mime_type: "image/avif",
          content_hash: "ed7a4ce8",
          optimized_size_kb: 7.54,
          is_primary: true
        },
        {
          asset_id: "retrieved.product.ag10-lite.480.webp.2427a172",
          product_slug: "source-agri-kisan-drone-small-8-liter",
          source_catalog_id: "mithron-agri-kisan-drone-small-8-liter",
          generated_prompt_id: "retrieved.product.ag10-lite",
          category: "products",
          bucket: "mithron-products",
          storage_path: "ag10-lite-480w-v1.2427a172.webp",
          asset_role: "product",
          width: 480,
          height: 480,
          variant_width: 480,
          format: "webp",
          mime_type: "image/webp",
          content_hash: "2427a172",
          optimized_size_kb: 4.5,
          is_primary: false
        }
      ]
    });

    expect(result.summary).toMatchObject({
      sourceAssets: 2,
      mediaAssets: 2,
      productMediaLinks: 2,
      unresolvedProductLinks: 0,
      fallbackPreserved: true,
      storefrontCutover: false
    });

    const primaryMedia = result.mediaAssets[0];
    const primaryLink = result.productMediaAssets[0];
    if (!primaryMedia || !primaryLink) {
      throw new Error("Expected canonical media backfill to produce a primary media row and product media link.");
    }

    expect(primaryMedia).toMatchObject({
      id: "retrieved.product.ag10-lite.768.avif.ed7a4ce8",
      bucket: "mithron-products",
      storage_path: "ag10-lite-768w-v1.ed7a4ce8.avif",
      public_url: `${supabaseUrl}/storage/v1/object/public/mithron-products/ag10-lite-768w-v1.ed7a4ce8.avif`,
      folder: "products/source-agri-kisan-drone-small-8-liter",
      alt_text: "Agri Kisan Drone Small 8 Liter product",
      mime_type: "image/avif",
      file_size_bytes: 7721,
      visibility: "public",
      status: "published",
      uploaded_by: null,
      updated_at: "2026-05-25T12:00:00.000Z"
    });
    expect(primaryMedia.upload_metadata).toMatchObject({
      source_table: "mithron_assets",
      fallback_preserved: true,
      storefront_cutover: false,
      backfill_version: 1
    });
    expect(primaryMedia.responsive_variants?.variants?.avif).toHaveLength(1);
    expect(primaryMedia.responsive_variants?.variants?.webp).toHaveLength(1);

    expect(primaryLink).toMatchObject({
      product_slug: "source-agri-kisan-drone-small-8-liter",
      media_asset_id: "retrieved.product.ag10-lite.768.avif.ed7a4ce8",
      usage: "primary",
      is_primary: true,
      variant_id: "product-768-avif"
    });
  });

  it("only creates product links when a product can be resolved safely", () => {
    const result = buildCanonicalMediaBackfill({
      supabaseUrl,
      products: [
        {
          slug: "source-field-kit",
          name: "Field Kit",
          source_catalog_id: "source-field-kit"
        }
      ],
      assets: [
        {
          asset_id: "linked-by-source-catalog",
          product_slug: null,
          source_catalog_id: "source-field-kit",
          generated_prompt_id: "retrieved.product.field-kit",
          category: "products",
          bucket: "mithron-products",
          storage_path: "field-kit.webp",
          asset_role: "product",
          width: 640,
          height: 640,
          variant_width: 640,
          format: "webp",
          mime_type: "image/webp",
          content_hash: "fieldkit",
          optimized_size_kb: 5,
          is_primary: true
        },
        {
          asset_id: "unresolved-legacy-source-key",
          product_slug: null,
          source_catalog_id: "legacyLocalKey",
          generated_prompt_id: "retrieved.product.legacy",
          category: "products",
          bucket: "mithron-products",
          storage_path: "legacy.webp",
          asset_role: "product",
          width: 640,
          height: 640,
          variant_width: 640,
          format: "webp",
          mime_type: "image/webp",
          content_hash: "legacy",
          optimized_size_kb: 5,
          is_primary: true
        }
      ]
    });

    expect(result.mediaAssets).toHaveLength(2);
    expect(result.productMediaAssets).toHaveLength(1);
    const resolvedLink = result.productMediaAssets[0];
    if (!resolvedLink) {
      throw new Error("Expected canonical media backfill to resolve the source-catalog product media link.");
    }
    expect(resolvedLink).toMatchObject({
      product_slug: "source-field-kit",
      media_asset_id: "linked-by-source-catalog"
    });
    expect(result.unresolvedProductLinks).toEqual([
      expect.objectContaining({
        asset_id: "unresolved-legacy-source-key",
        reason: "unresolved_source_catalog_id"
      })
    ]);
  });

  it("uses explicit legacy source aliases for older retrieved media keys", () => {
    const result = buildCanonicalMediaBackfill({
      supabaseUrl,
      products: [
        {
          slug: "source-agri-kisan-drone-small-8-liter",
          name: "Agri Kisan Drone Small 8 Liter",
          source_catalog_id: "mithron-agri-kisan-drone-small-8-liter"
        }
      ],
      assets: [
        {
          asset_id: "legacy-agri-kisan-media",
          product_slug: null,
          source_catalog_id: "agriKisan8L",
          generated_prompt_id: "retrieved.product.ag10-lite",
          category: "products",
          bucket: "mithron-products",
          storage_path: "ag10-lite.webp",
          asset_role: "product",
          width: 768,
          height: 768,
          variant_width: 768,
          format: "webp",
          mime_type: "image/webp",
          content_hash: "ag10lite",
          optimized_size_kb: 8,
          is_primary: true
        }
      ]
    });

    expect(result.productMediaAssets).toHaveLength(1);
    const aliasLink = result.productMediaAssets[0];
    if (!aliasLink) {
      throw new Error("Expected canonical media backfill to resolve the legacy alias product media link.");
    }
    expect(aliasLink).toMatchObject({
      product_slug: "source-agri-kisan-drone-small-8-liter",
      media_asset_id: "legacy-agri-kisan-media",
      usage: "primary"
    });
    expect(aliasLink.metadata).toMatchObject({
      source_resolution: "source_catalog_alias"
    });
  });

  it("defaults to dry-run mode and requires explicit apply intent", () => {
    expect(parseCliArgs([])).toMatchObject({
      apply: false,
      json: false,
      limit: 1000
    });
    expect(parseCliArgs(["--apply", "--json", "--limit=25"])).toMatchObject({
      apply: true,
      json: true,
      limit: 25
    });
  });
});
