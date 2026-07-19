import { assertSupabaseAdminConfig } from "@/lib/env";
import { upsertMediaAssetRecord } from "@/services/admin-actions";
import {
  assertAllowedMediaMimeType,
  assertMediaMimeMatchesContent,
  buildMediaAssetId,
  buildMediaAssetRecordFromFormData,
  buildStorageObjectPath
} from "@/services/media-manager";
import {
  buildOptimizedVariantStoragePath,
  buildResponsiveVariantsMetadata,
  buildSupabasePublicObjectUrl,
  createOptimizedImageThumbnail,
  findLargestStoredAvifVariant,
  findStoredOptimizedVariant,
  readImageBufferMetadata,
  type StoredOptimizedImageVariant
} from "@/services/media-optimization";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

async function uploadStorageObject(bucket: string, storagePath: string, contentType: string, buffer: Buffer) {
  const config = assertSupabaseAdminConfig();
  const uploadBody = new Uint8Array(buffer.byteLength);
  uploadBody.set(buffer);
  const encodedPath = storagePath.split("/").map((segment) => encodeURIComponent(segment)).join("/");

  const response = await fetchWithTimeout(`${config.url}/storage/v1/object/${bucket}/${encodedPath}`, {
    method: "POST",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable"
    },
    body: uploadBody
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Storage upload failed: ${response.status} ${text}`);
  }

  return buildSupabasePublicObjectUrl(config.url, bucket, storagePath);
}

async function deleteStorageObjects(bucket: string, paths: string[]) {
  const config = assertSupabaseAdminConfig();
  for (const storagePath of paths) {
    if (!storagePath) continue;
    try {
      const encodedPath = storagePath.split("/").map((segment) => encodeURIComponent(segment)).join("/");
      await fetchWithTimeout(`${config.url}/storage/v1/object/${bucket}/${encodedPath}`, {
        method: "DELETE",
        headers: {
          apikey: config.serviceRoleKey,
          Authorization: `Bearer ${config.serviceRoleKey}`
        }
      });
    } catch {
      // Best-effort cleanup after a failed DB write.
    }
  }
}

/** Original-first upload with a single thumbnail encode on the request path. */
async function uploadThumbnailVariant(bucket: string, storagePath: string, buffer: Buffer, mimeType: string) {
  const config = assertSupabaseAdminConfig();
  const thumbnail = await createOptimizedImageThumbnail(buffer, mimeType);
  if (!thumbnail) return [] as StoredOptimizedImageVariant[];

  const variantPath = buildOptimizedVariantStoragePath(storagePath, thumbnail);
  await uploadStorageObject(bucket, variantPath, thumbnail.mimeType, thumbnail.buffer);
  return [{
    ...thumbnail,
    storagePath: variantPath,
    publicUrl: buildSupabasePublicObjectUrl(config.url, bucket, variantPath)
  }] satisfies StoredOptimizedImageVariant[];
}

export async function uploadEditorInlineImage(input: {
  file: File;
  documentType: string;
  documentId: string;
  actorId: string | null;
}) {
  const bucket = "mithron-products";
  const declaredMime = assertAllowedMediaMimeType(input.file.type || "application/octet-stream", bucket);
  if (!declaredMime.startsWith("image/")) {
    throw new Error("Only image uploads are supported in the editor.");
  }
  if (input.file.size > 12 * 1024 * 1024) {
    throw new Error("Image must be 12 MB or smaller.");
  }

  const uploadedAt = new Date().toISOString();
  const folder = `editor/${input.documentType}/${input.documentId}`;
  const storagePath = buildStorageObjectPath({
    bucket,
    folder,
    fileName: input.file.name,
    at: uploadedAt
  });
  const buffer = Buffer.from(await input.file.arrayBuffer());
  const mimeType = assertMediaMimeMatchesContent({
    declaredMime,
    bytes: new Uint8Array(buffer)
  });
  const metadata = await readImageBufferMetadata(buffer, mimeType);
  const publicUrl = await uploadStorageObject(bucket, storagePath, mimeType, buffer);
  const optimizedVariants = await uploadThumbnailVariant(bucket, storagePath, buffer, mimeType);
  const mediaAssetId = buildMediaAssetId(bucket, storagePath);
  const thumbnailVariant = findStoredOptimizedVariant(optimizedVariants, "thumbnail", "webp");
  const webpVariant = thumbnailVariant;
  const avifVariant = findLargestStoredAvifVariant(optimizedVariants);

  const recordForm = new FormData();
  recordForm.set("id", mediaAssetId);
  recordForm.set("bucket", bucket);
  recordForm.set("folder", folder);
  recordForm.set("storage_path", storagePath);
  recordForm.set("public_url", publicUrl);
  recordForm.set("mime_type", mimeType);
  recordForm.set("file_size_bytes", String(buffer.byteLength));
  recordForm.set("visibility", "public");
  recordForm.set("usage_scope", "editor-inline");
  recordForm.set("tags", `editor, ${input.documentType}`);
  recordForm.set("alt_text", input.file.name);
  recordForm.set("width", metadata.width ? String(metadata.width) : "");
  recordForm.set("height", metadata.height ? String(metadata.height) : "");
  recordForm.set("webp_path", webpVariant?.storagePath ?? "");
  recordForm.set("thumbnail_path", thumbnailVariant?.storagePath ?? "");
  recordForm.set("avif_path", avifVariant?.storagePath ?? "");
  recordForm.set(
    "responsive_variants",
    JSON.stringify(
      buildResponsiveVariantsMetadata(optimizedVariants, {
        width: metadata.width,
        height: metadata.height,
        sizeBytes: input.file.size,
        mimeType,
        storagePath,
        publicUrl,
        uploadedBytes: optimizedVariants.reduce((total, variant) => total + variant.sizeBytes, 0) + buffer.byteLength
      })
    )
  );

  const uploadedPaths = [storagePath, ...optimizedVariants.map((variant) => variant.storagePath)];
  try {
    await upsertMediaAssetRecord(buildMediaAssetRecordFromFormData(recordForm, { actorId: input.actorId, at: uploadedAt }), input.actorId);
  } catch (error) {
    await deleteStorageObjects(bucket, uploadedPaths);
    throw error;
  }

  return { publicUrl, mediaAssetId };
}
