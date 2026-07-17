import type { AdminMutationOptions } from "@/services/admin-actions";
import { upsertProductMediaAssetRecord } from "@/services/admin-actions";
import type { UploadedProductImage } from "@/services/product-image-upload";

type JsonRecord = Record<string, unknown>;

export function parseGalleryUrls(formData: FormData) {
  const value = formData.get("gallery_urls");
  if (typeof value !== "string" || !value.trim()) return [];
  return value
    .split(/[\n,]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseRemovedGalleryUrls(formData: FormData) {
  return formData
    .getAll("removed_gallery_urls")
    .map((value) => String(value).trim())
    .filter(Boolean);
}

export function readMediaSrc(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const src = (value as JsonRecord).src;
  return typeof src === "string" && src.trim() ? src.trim() : "";
}

export function readProductGalleryFromRow(row: unknown): JsonRecord[] {
  if (!row || typeof row !== "object" || Array.isArray(row)) return [];
  const gallery = (row as JsonRecord).gallery;
  if (!Array.isArray(gallery)) return [];
  return gallery.filter((item): item is JsonRecord => Boolean(item) && typeof item === "object" && !Array.isArray(item));
}

export function dedupeGalleryBySrc(items: JsonRecord[]) {
  const seen = new Set<string>();
  const result: JsonRecord[] = [];

  for (const item of items) {
    const src = readMediaSrc(item);
    if (!src || seen.has(src)) continue;
    seen.add(src);
    result.push(item);
  }

  return result;
}

function mediaFromSrc(src: string, alt: string, priority = false): JsonRecord {
  return {
    src,
    alt,
    kind: "image",
    ...(priority ? { priority: true } : {})
  };
}

export function buildProductGalleryMedia(input: {
  primarySrc: string;
  primaryAlt: string;
  uploadedUrls: string[];
  extraUrls: string[];
  existingGallery?: JsonRecord[];
  removedUrls?: string[];
}) {
  const removed = new Set((input.removedUrls ?? []).map((url) => url.trim()).filter(Boolean));
  const filteredExisting = dedupeGalleryBySrc(
    (input.existingGallery ?? []).filter((item) => !removed.has(readMediaSrc(item)))
  );
  const hasUploads = input.uploadedUrls.length > 0;
  let primarySrc = input.primarySrc.trim();

  if (hasUploads) {
    primarySrc = input.uploadedUrls[0];
  } else if (!primarySrc || removed.has(primarySrc)) {
    primarySrc = readMediaSrc(filteredExisting[0])
      ?? input.extraUrls.map((url) => url.trim()).find((url) => url && !removed.has(url))
      ?? "";
  }

  if (!primarySrc) return null;

  const primary = mediaFromSrc(primarySrc, input.primaryAlt, true);
  const hero = { ...primary };
  const galleryItems: JsonRecord[] = [...filteredExisting];

  const candidateSrcs = [
    ...(hasUploads ? input.uploadedUrls : [primarySrc]),
    ...input.extraUrls
  ];

  for (const src of candidateSrcs) {
    const normalized = src.trim();
    if (!normalized || removed.has(normalized)) continue;
    if (galleryItems.some((item) => readMediaSrc(item) === normalized)) continue;
    galleryItems.push(mediaFromSrc(normalized, input.primaryAlt, normalized === primarySrc));
  }

  const deduped = dedupeGalleryBySrc(galleryItems);
  const withoutPrimary = deduped.filter((item) => readMediaSrc(item) !== primarySrc);
  const gallery = [primary, ...withoutPrimary];

  return { image: primary, hero, gallery };
}

export function hasAnyProductImageInput(formData: FormData, uploadedCount: number) {
  if (uploadedCount > 0) return true;
  if (parseRemovedGalleryUrls(formData).length > 0) return true;
  const imageSrc = String(formData.get("image_src") ?? "").trim();
  if (imageSrc) return true;
  if (parseGalleryUrls(formData).length > 0) return true;
  const legacyImage = String(formData.get("image") ?? "").trim();
  return Boolean(legacyImage);
}

export async function linkUploadedImagesToProduct(
  slug: string,
  uploads: UploadedProductImage[],
  input: {
    name: string;
    source: string;
    actorId: string | null;
    mutationOptions?: AdminMutationOptions;
  }
) {
  for (let index = 0; index < uploads.length; index += 1) {
    const upload = uploads[index];
    await upsertProductMediaAssetRecord(
      {
        product_slug: slug,
        media_asset_id: upload.mediaAssetId,
        usage: index === 0 ? "primary" : "gallery",
        sort_order: index,
        is_primary: index === 0,
        alt_text: input.name,
        caption: input.name,
        metadata: {
          bucket: upload.bucket,
          storage_path: upload.storagePath,
          optimized_storage_path: upload.optimizedStoragePath,
          original_storage_path: upload.storagePath,
          public_url: upload.publicUrl,
          source: input.source
        },
        updated_at: new Date().toISOString()
      },
      input.actorId,
      undefined,
      input.mutationOptions
    );
  }
}
