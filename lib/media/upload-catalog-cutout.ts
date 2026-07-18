import { createHash } from "node:crypto";
import sharp from "sharp";
import { autoCutoutIfNeeded } from "@/lib/catalog/auto-cutout";
import { assertSupabaseAdminConfig } from "@/lib/env";
import { upsertMediaAssetRecord, upsertProductMediaAssetRecord } from "@/services/admin-actions";
import { buildSupabasePublicObjectUrl } from "@/services/media-optimization";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

const BUCKET = "mithron-products";
const CUTOUT_VARIANT_ID = "catalog-cutout-v1";
const STAGE_SIZE = 1024;

export type UploadCatalogCutoutInput = {
  productSlug: string;
  productName: string;
  sourceBuffer: Buffer;
  sourceMimeType: string;
  actorId?: string | null;
  apply?: boolean;
};

export type UploadCatalogCutoutResult =
  | {
      status: "applied";
      productSlug: string;
      mediaAssetId: string;
      publicUrl: string;
      storagePath: string;
      wasProcessed: boolean;
    }
  | {
      status: "dry_run";
      productSlug: string;
      mediaAssetId: string;
      storagePath: string;
      wouldProcess: boolean;
    }
  | {
      status: "skipped";
      productSlug: string;
      reason: string;
    }
  | {
      status: "rejected";
      productSlug: string;
      reason: string;
    };

function encodeObjectPath(path: string) {
  return path.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

function hashBuffer(buffer: Buffer, size = 12) {
  return createHash("sha256").update(buffer).digest("hex").slice(0, size);
}

export function buildCatalogCutoutStoragePath(productSlug: string, contentHash: string) {
  return `catalog-cutouts/v1/${productSlug}-${contentHash}.webp`;
}

export function buildCatalogCutoutMediaAssetId(productSlug: string, contentHash: string) {
  return `catalog.cutout.v1.${productSlug}.${contentHash}`;
}

async function uploadStorageObject(storagePath: string, contentType: string, buffer: Buffer) {
  const config = assertSupabaseAdminConfig();
  const uploadBody = new Uint8Array(buffer.byteLength);
  uploadBody.set(buffer);

  const response = await fetchWithTimeout(`${config.url}/storage/v1/object/${BUCKET}/${encodeObjectPath(storagePath)}`, {
    method: "POST",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "x-upsert": "false"
    },
    body: uploadBody
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase Storage upload failed for ${BUCKET}/${storagePath}: ${response.status} ${response.statusText} ${text}`);
  }

  return buildSupabasePublicObjectUrl(config.url, BUCKET, storagePath);
}

export async function downloadImageBuffer(url: string) {
  const response = await fetchWithTimeout(url.trim(), { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Failed to download image (${response.status}): ${url}`);
  }

  const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
  const arrayBuffer = await response.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType
  };
}

export async function uploadCatalogCutout(input: UploadCatalogCutoutInput): Promise<UploadCatalogCutoutResult> {
  const productSlug = input.productSlug.trim();
  const productName = input.productName.trim() || productSlug;
  const actorId = input.actorId ?? null;
  const apply = input.apply ?? false;

  if (!productSlug) {
    return { status: "skipped", productSlug: "", reason: "missing_slug" };
  }

  if (!input.sourceBuffer.byteLength) {
    return { status: "skipped", productSlug, reason: "empty_source_buffer" };
  }

  const contentHash = hashBuffer(input.sourceBuffer);
  const storagePath = buildCatalogCutoutStoragePath(productSlug, contentHash);
  const mediaAssetId = buildCatalogCutoutMediaAssetId(productSlug, contentHash);

  const cutoutResult = await autoCutoutIfNeeded(input.sourceBuffer, input.sourceMimeType);
  if (cutoutResult.skipped && !cutoutResult.wasProcessed) {
    return {
      status: "rejected",
      productSlug,
      reason: cutoutResult.skipReason ?? "cutout_rejected"
    };
  }

  if (!apply) {
    return {
      status: "dry_run",
      productSlug,
      mediaAssetId,
      storagePath,
      wouldProcess: true
    };
  }

  let cutoutBuffer = Buffer.from(cutoutResult.buffer);
  let mimeType = cutoutResult.mimeType;

  if (!cutoutResult.wasProcessed) {
    cutoutBuffer = Buffer.from(
      await sharp(cutoutBuffer, { failOn: "none" })
        .resize({
          width: STAGE_SIZE,
          height: STAGE_SIZE,
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .webp({ quality: 92, effort: 6, smartSubsample: true })
        .toBuffer()
    );
    mimeType = "image/webp";
  }

  const metadata = await sharp(cutoutBuffer, { failOn: "none" }).metadata();
  if (!metadata.hasAlpha) {
    return { status: "rejected", productSlug, reason: "processed_webp_lost_alpha" };
  }

  const width = metadata.width ?? STAGE_SIZE;
  const height = metadata.height ?? STAGE_SIZE;
  const now = new Date().toISOString();
  const publicUrl = await uploadStorageObject(storagePath, mimeType, cutoutBuffer);

  await upsertMediaAssetRecord(
    {
      id: mediaAssetId,
      bucket: BUCKET,
      folder: "catalog-cutouts/v1",
      storage_path: storagePath,
      public_url: publicUrl,
      mime_type: mimeType,
      file_size_bytes: cutoutBuffer.byteLength,
      width,
      height,
      content_hash: contentHash,
      alt: productName,
      alt_text: productName,
      caption: productName,
      tags: ["catalog-cutout", productSlug],
      visibility: "public",
      usage_scope: "product-catalog",
      status: "published",
      is_visible: true,
      is_primary: false,
      upload_metadata: {
        source: "catalog-cutout-backfill",
        product_slug: productSlug,
        variant_id: CUTOUT_VARIANT_ID,
        auto_processed: cutoutResult.wasProcessed,
        metrics: cutoutResult.metrics ?? null,
        uploaded_at: now
      },
      updated_at: now
    },
    actorId,
    process.env,
    actorId ? {} : { allowSystemActor: true }
  );

  await upsertProductMediaAssetRecord(
    {
      product_slug: productSlug,
      media_asset_id: mediaAssetId,
      usage: "cms",
      variant_id: CUTOUT_VARIANT_ID,
      sort_order: 0,
      is_primary: false,
      alt_text: productName,
      caption: productName,
      metadata: {
        source: "catalog-cutout-backfill",
        public_url: publicUrl,
        variant_id: CUTOUT_VARIANT_ID
      },
      updated_at: now
    },
    actorId,
    process.env,
    actorId ? {} : { allowSystemActor: true }
  );

  return {
    status: "applied",
    productSlug,
    mediaAssetId,
    publicUrl,
    storagePath,
    wasProcessed: cutoutResult.wasProcessed
  };
}
