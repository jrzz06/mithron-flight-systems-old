import { assertSupabaseAdminConfig } from "@/lib/env";
import {
  buildPrimaryMediaAssetId,
  mimeTypeFromStoragePath,
  parseStoragePublicUrl
} from "@/lib/media/backfill-primary-media";
import { readMediaSrc, readProductGalleryFromRow } from "@/lib/product-gallery";
import {
  deleteAdminRecord,
  fetchAdminRecordsByColumn,
  upsertMediaAssetRecord,
  upsertProductMediaAssetRecord
} from "@/services/admin-actions";
import { buildMediaAssetId } from "@/services/media-manager";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

type JsonRecord = Record<string, unknown>;

function encodeObjectPath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function normalizeMediaUrl(url: string) {
  return url.trim().replace(/\/+$/, "");
}

export function isSupabaseProductStorageUrl(url: string) {
  return normalizeMediaUrl(url).includes(".supabase.co/storage/v1/object/public/");
}

export function resolveMediaAssetFromPublicUrl(url: string) {
  const normalized = normalizeMediaUrl(url);
  const parsed = parseStoragePublicUrl(normalized);
  if (!parsed) return null;
  return {
    bucket: parsed.bucket,
    storagePath: parsed.storagePath,
    mediaAssetId: buildMediaAssetId(parsed.bucket, parsed.storagePath),
    publicUrl: normalized
  };
}

function collectSupabaseMediaUrls(input: {
  image?: unknown;
  hero?: unknown;
  gallery?: unknown;
}) {
  const urls: string[] = [];
  const primary = readMediaSrc(input.image) || readMediaSrc(input.hero);
  if (primary && isSupabaseProductStorageUrl(primary)) urls.push(normalizeMediaUrl(primary));

  for (const item of readProductGalleryFromRow({ gallery: input.gallery })) {
    const src = readMediaSrc(item);
    if (src && isSupabaseProductStorageUrl(src)) urls.push(normalizeMediaUrl(src));
  }

  return [...new Set(urls)];
}

async function deleteStorageObject(bucket: string, storagePath: string) {
  const config = assertSupabaseAdminConfig();
  try {
    await fetchWithTimeout(`${config.url}/storage/v1/object/${bucket}/${encodeObjectPath(storagePath)}`, {
      method: "DELETE",
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`
      }
    });
  } catch {
    // Best-effort storage cleanup.
  }
}

async function deleteProductMediaLinksOnly(productSlug: string, mediaAssetId: string) {
  const config = assertSupabaseAdminConfig();
  const response = await fetchWithTimeout(
    `${config.url}/rest/v1/product_media_assets?product_slug=eq.${encodeURIComponent(productSlug)}&media_asset_id=eq.${encodeURIComponent(mediaAssetId)}`,
    {
      method: "DELETE",
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to unlink product media (${productSlug}/${mediaAssetId}): ${response.status} ${response.statusText}`);
  }
}

async function cleanupOrphanMediaAsset(
  mediaAssetId: string,
  productSlug: string,
  actorId: string | null
) {
  const remainingLinks = await fetchAdminRecordsByColumn("product_media_assets", "media_asset_id", mediaAssetId);
  if (remainingLinks.length) return;

  const assets = await fetchAdminRecordsByColumn("media_assets", "id", mediaAssetId);
  const asset = assets[0];
  if (!asset) return;

  const bucket = String(asset.bucket ?? "mithron-products");
  const storagePath = String(asset.storage_path ?? "");
  const ownedByProduct = storagePath.includes(`products/${productSlug}/`) || mediaAssetId === buildPrimaryMediaAssetId(productSlug);
  if (!ownedByProduct) return;

  const paths = new Set<string>();
  if (storagePath) paths.add(storagePath);

  const variants = asset.variants;
  if (variants && typeof variants === "object" && !Array.isArray(variants)) {
    for (const value of Object.values(variants as JsonRecord)) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const variantPath = (value as JsonRecord).storage_path;
        if (typeof variantPath === "string" && variantPath.trim()) paths.add(variantPath.trim());
      }
    }
  }

  const responsiveVariants = asset.responsive_variants;
  if (responsiveVariants && typeof responsiveVariants === "object" && !Array.isArray(responsiveVariants)) {
    for (const value of Object.values(responsiveVariants as JsonRecord)) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const variantPath = (value as JsonRecord).storage_path;
        if (typeof variantPath === "string" && variantPath.trim()) paths.add(variantPath.trim());
      }
    }
  }

  for (const path of paths) {
    await deleteStorageObject(bucket, path);
  }

  try {
    await deleteAdminRecord("media_assets", "id", mediaAssetId, actorId);
  } catch {
    // Best-effort asset row cleanup.
  }
}

export async function unlinkRemovedProductMedia(input: {
  productSlug: string;
  removedUrls: string[];
  actorId: string | null;
}) {
  const removed = new Set(input.removedUrls.map(normalizeMediaUrl).filter(Boolean));
  if (!removed.size) return { unlinked: 0 };

  const productLinks = await fetchAdminRecordsByColumn("product_media_assets", "product_slug", input.productSlug);
  const affectedAssetIds = new Set<string>();

  for (const link of productLinks) {
    const mediaAssetId = String(link.media_asset_id ?? "");
    if (!mediaAssetId) continue;

    const assets = await fetchAdminRecordsByColumn("media_assets", "id", mediaAssetId);
    const asset = assets[0];
    const publicUrl = normalizeMediaUrl(String(asset?.public_url ?? ""));
    const metadataUrl = normalizeMediaUrl(String((link.metadata as JsonRecord | undefined)?.public_url ?? ""));

    const shouldRemove = removed.has(publicUrl)
      || removed.has(metadataUrl)
      || [...removed].some((url) => resolveMediaAssetFromPublicUrl(url)?.mediaAssetId === mediaAssetId);

    if (!shouldRemove) continue;

    await deleteProductMediaLinksOnly(input.productSlug, mediaAssetId);
    affectedAssetIds.add(mediaAssetId);
  }

  for (const mediaAssetId of affectedAssetIds) {
    await cleanupOrphanMediaAsset(mediaAssetId, input.productSlug, input.actorId);
  }

  return { unlinked: affectedAssetIds.size };
}

export async function ensureProductMediaLinksForProduct(input: {
  productSlug: string;
  productName: string;
  media: { image?: unknown; hero?: unknown; gallery?: unknown };
  actorId: string | null;
}) {
  const urls = collectSupabaseMediaUrls(input.media);
  if (!urls.length) return { linked: 0 };

  const existingLinks = await fetchAdminRecordsByColumn("product_media_assets", "product_slug", input.productSlug);
  const linkedAssetIds = new Set(existingLinks.map((link) => String(link.media_asset_id ?? "")).filter(Boolean));
  const linkedUrls = new Set<string>();

  for (const link of existingLinks) {
    const mediaAssetId = String(link.media_asset_id ?? "");
    if (!mediaAssetId) continue;
    const assets = await fetchAdminRecordsByColumn("media_assets", "id", mediaAssetId);
    const publicUrl = normalizeMediaUrl(String(assets[0]?.public_url ?? ""));
    if (publicUrl) linkedUrls.add(publicUrl);
  }

  const primaryUrl = urls[0] ?? "";
  let linked = 0;
  const now = new Date().toISOString();

  for (let index = 0; index < urls.length; index += 1) {
    const url = urls[index];
    if (linkedUrls.has(url)) continue;

    const resolved = resolveMediaAssetFromPublicUrl(url);
    if (!resolved) continue;

    const isPrimary = url === primaryUrl || index === 0;
    const existingAssets = await fetchAdminRecordsByColumn("media_assets", "public_url", url);
    const existingAssetId = existingAssets[0]?.id ? String(existingAssets[0].id) : "";
    const mediaAssetId = existingAssetId
      || (isPrimary ? buildPrimaryMediaAssetId(input.productSlug) : resolved.mediaAssetId);
    if (linkedAssetIds.has(mediaAssetId) && linkedUrls.has(url)) continue;

    if (!existingAssetId) {
      await upsertMediaAssetRecord(
        {
          id: mediaAssetId,
          bucket: resolved.bucket,
          storage_path: resolved.storagePath,
          public_url: resolved.publicUrl,
          alt: input.productName,
          alt_text: input.productName,
          caption: input.productName,
          folder: `products/${input.productSlug}`,
          tags: ["product-media-sync", input.productSlug],
          mime_type: mimeTypeFromStoragePath(resolved.storagePath),
          visibility: "public",
          status: "published",
          is_visible: true,
          is_primary: isPrimary,
          upload_metadata: {
            source: "product-media-sync",
            product_slug: input.productSlug,
            synced_at: now
          },
          updated_at: now
        },
        input.actorId,
        process.env,
        input.actorId ? {} : { allowSystemActor: true }
      );
    }

    await upsertProductMediaAssetRecord(
      {
        product_slug: input.productSlug,
        media_asset_id: mediaAssetId,
        usage: isPrimary ? "primary" : "gallery",
        sort_order: index,
        is_primary: isPrimary,
        alt_text: input.productName,
        caption: input.productName,
        metadata: {
          source: "product-media-sync",
          public_url: resolved.publicUrl
        },
        updated_at: now
      },
      input.actorId,
      process.env,
      input.actorId ? {} : { allowSystemActor: true }
    );

    linkedAssetIds.add(mediaAssetId);
    linkedUrls.add(url);
    linked += 1;
  }

  return { linked };
}
