import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isSupabaseProductStorageUrl,
  resolveMediaAssetFromPublicUrl
} from "@/lib/product-media-cleanup";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("product media cleanup", () => {
  it("detects Supabase storage URLs", () => {
    expect(isSupabaseProductStorageUrl("https://abc.supabase.co/storage/v1/object/public/mithron-products/products/foo.webp")).toBe(true);
    expect(isSupabaseProductStorageUrl("https://static.wixstatic.com/media/hero.jpg")).toBe(false);
  });

  it("resolves media asset ids from Supabase public URLs", () => {
    const resolved = resolveMediaAssetFromPublicUrl(
      "https://abc.supabase.co/storage/v1/object/public/mithron-products/products/agri-drone/2026-01-01T00-00-00-000Z-primary.webp"
    );

    expect(resolved).toMatchObject({
      bucket: "mithron-products",
      storagePath: "products/agri-drone/2026-01-01T00-00-00-000Z-primary.webp"
    });
    expect(resolved?.mediaAssetId).toContain("media-products-");
  });

  it("exports unlink, ensure, and displaced-url helpers for admin actions", () => {
    const cleanup = source("lib/product-media-cleanup.ts");
    const actions = source("app/admin/products/actions.ts");
    const admin = source("services/admin.ts");
    const adminActions = source("services/admin-actions.ts");

    expect(cleanup).toContain("export async function unlinkRemovedProductMedia");
    expect(cleanup).toContain("export async function ensureProductMediaLinksForProduct");
    expect(cleanup).toContain("export function collectDisplacedProductMediaUrls");
    expect(cleanup).toContain("export async function cleanupOrphanMediaAsset");
    expect(actions).toContain("unlinkRemovedProductMedia");
    expect(actions).toContain("ensureProductMediaLinksForProduct");
    expect(actions).toContain("collectDisplacedProductMediaUrls");
    expect(adminActions).toContain("cleanupOrphanMediaAsset");
    expect(admin).toContain("description,description_json,specs");
  });

  it("reuses content_hash on product image upload retries", () => {
    const upload = source("services/product-image-upload.ts");
    expect(upload).toContain("createHash(\"sha256\")");
    expect(upload).toContain("content_hash");
    expect(upload).toContain("findReusableMediaAssetByContentHash");
  });
});
