import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertAllowedMediaMimeType,
  buildMediaAssetRecordFromFormData,
  buildStorageObjectPath,
  parseMediaTags
} from "@/services/media-manager";
import { buildProductMediaLinkFromFormData } from "@/services/product-admin-forms";

function formData(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

describe("enterprise media manager workflow", () => {
  it("normalizes canonical media asset metadata for auditable Supabase Storage uploads", () => {
    const record = buildMediaAssetRecordFromFormData(
      formData({
        id: "media-source-agri-hero",
        bucket: "mithron-products",
        storage_path: "products/source-agri/hero-v1.webp",
        public_url: "https://ictnoydmxlywwxwnugal.supabase.co/storage/v1/object/public/mithron-products/products/source-agri/hero-v1.webp",
        folder: "products/source-agri",
        tags: "product, hero, seo",
        alt_text: "Agri drone hero render",
        caption: "Primary product media",
        mime_type: "image/webp",
        file_size_bytes: "123456",
        width: "1600",
        height: "1200",
        avif_path: "products/source-agri/hero-v1.avif",
        webp_path: "products/source-agri/hero-v1.webp",
        thumbnail_path: "products/source-agri/hero-thumb-v1.webp",
        visibility: "public",
        usage_scope: "products"
      }),
      {
        actorId: "00000000-0000-0000-0000-000000000001",
        at: "2026-05-24T10:00:00.000Z"
      }
    );

    expect(record).toMatchObject({
      id: "media-source-agri-hero",
      bucket: "mithron-products",
      storage_path: "products/source-agri/hero-v1.webp",
      folder: "products/source-agri",
      tags: ["product", "hero", "seo"],
      alt: "Agri drone hero render",
      alt_text: "Agri drone hero render",
      caption: "Primary product media",
      mime_type: "image/webp",
      size_bytes: 123456,
      file_size_bytes: 123456,
      width: 1600,
      height: 1200,
      visibility: "public",
      uploaded_by: "00000000-0000-0000-0000-000000000001",
      created_by: "00000000-0000-0000-0000-000000000001",
      updated_at: "2026-05-24T10:00:00.000Z"
    });
    expect(record.variants).toMatchObject({
      avif: { storage_path: "products/source-agri/hero-v1.avif", ready: true },
      webp: { storage_path: "products/source-agri/hero-v1.webp", ready: true },
      thumbnail: { storage_path: "products/source-agri/hero-thumb-v1.webp", ready: true }
    });
    expect(record.upload_metadata).toMatchObject({
      usage_scope: "products",
      optimization: {
        avif_ready: true,
        webp_ready: true,
        thumbnail_ready: true
      }
    });
  });

  it("builds SKU-safe object paths and rejects unsafe media MIME types", () => {
    expect(buildStorageObjectPath({
      bucket: "mithron-products",
      folder: "Hero Banners / May Launch",
      fileName: "Agri Drone HERO 01.PNG",
      at: "2026-05-24T10:00:00.000Z"
    })).toBe("hero-banners/may-launch/20260524T100000000Z-agri-drone-hero-01.png");

    expect(parseMediaTags(" Hero, product\nSEO,, hero ")).toEqual(["hero", "product", "seo"]);
    expect(assertAllowedMediaMimeType("image/avif", "mithron-products")).toBe("image/avif");
    expect(() => assertAllowedMediaMimeType("application/x-msdownload", "mithron-products")).toThrow(/not allowed/i);
  });

  it("extends product media links with variant-safe canonical metadata", () => {
    expect(buildProductMediaLinkFromFormData(formData({
      product_slug: "source-agri-kisan-drone-small-8-liter",
      media_asset_id: "media-source-agri-hero",
      usage: "gallery",
      variant_id: "8-liter-green",
      sort_order: "7",
      is_primary: "on",
      alt_text: "Variant hero media",
      caption: "Variant-specific gallery image"
    }))).toMatchObject({
      table: "product_media_assets",
      identity: {
        product_slug: "source-agri-kisan-drone-small-8-liter",
        media_asset_id: "media-source-agri-hero",
        usage: "gallery"
      },
      fields: {
        variant_id: "8-liter-green",
        sort_order: 7,
        is_primary: true,
        alt_text: "Variant hero media",
        caption: "Variant-specific gallery image"
      }
    });
  });

  it("keeps the media migration additive, indexed, RLS-protected, and realtime-ready", () => {
    const migration = readFileSync(join(process.cwd(), "supabase/migrations/20260524000700_media_manager_completion.sql"), "utf8");

    for (const column of [
      "alt_text",
      "caption",
      "file_size_bytes",
      "responsive_variants",
      "upload_metadata",
      "uploaded_by",
      "visibility",
      "variant_id"
    ]) {
      expect(migration).toContain(column);
    }

    expect(migration).toContain("create index if not exists media_assets_tags_idx");
    expect(migration).toContain("create index if not exists product_media_assets_variant_idx");
    expect(migration).toContain("alter publication supabase_realtime add table public.product_media_assets");
    expect(migration).toContain("'mithron-cms'");
    expect(migration).toContain("'mithron-editorial'");
    expect(migration).toContain("'mithron-warehouse-documents'");
    expect(migration).toContain("public.has_cms_permission('media.write')");
  });

  it("wires product media upload with server action markers and validation", () => {
    const page = readFileSync(join(process.cwd(), "app/admin/products/page.tsx"), "utf8");
    const actions = readFileSync(join(process.cwd(), "app/admin/products/actions.ts"), "utf8");
    const multiImageField = readFileSync(join(process.cwd(), "components/products/product-multi-image-field.tsx"), "utf8");
    const uploadService = readFileSync(join(process.cwd(), "services/product-image-upload.ts"), "utf8");

    expect(page).toContain("data-product-create-media-fields");
    expect(page).toContain("ProductMultiImageField");
    expect(multiImageField).toContain('type="file"');
    expect(multiImageField).toContain('name="image_files"');
    expect(multiImageField).toContain("multiple");
    expect(actions).toContain("uploadProductImagesForDraft");
    expect(uploadService).toContain("assertAllowedMediaMimeType");
    expect(uploadService).toContain("upsertMediaAssetRecord");
    expect(uploadService).toContain("createOptimizedImageVariants");
  });

  it("keeps remote verification focused on canonical media persistence and Storage probes", () => {
    const verifier = readFileSync(join(process.cwd(), "tools/verify-enterprise-remote-workflows.mjs"), "utf8");

    expect(verifier).toContain("verifyMediaStorageWorkflow");
    expect(verifier).toContain("/storage/v1/object/");
    expect(verifier).toContain("createSignedUrl");
    expect(verifier).toContain("product_media_assets");
    expect(verifier).toContain("mediaAssetsUnauthenticatedInsert");
  });
});
