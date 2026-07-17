import "server-only";

import { createClient } from "@supabase/supabase-js";
import { assertSupabaseAdminConfig } from "@/lib/env";
import { parseStoragePublicUrl } from "@/lib/media/backfill-primary-media";
import { buildMediaAssetId } from "@/services/media-manager";

type JsonRecord = Record<string, unknown>;

function normalizeUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function collectStrings(value: unknown, output = new Set<string>()) {
  if (typeof value === "string") {
    const normalized = normalizeUrl(value);
    if (normalized) output.add(normalized);
    return output;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, output);
    return output;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value as JsonRecord)) collectStrings(item, output);
  }
  return output;
}

function collectStoragePaths(value: unknown, output = new Set<string>()) {
  if (Array.isArray(value)) {
    for (const item of value) collectStoragePaths(item, output);
    return output;
  }
  if (!value || typeof value !== "object") return output;
  for (const [key, item] of Object.entries(value as JsonRecord)) {
    if ((key === "storage_path" || key === "storagePath") && typeof item === "string" && item.trim()) {
      output.add(item.trim());
    } else {
      collectStoragePaths(item, output);
    }
  }
  return output;
}

export async function cleanupReplacedCmsMedia(input: {
  oldUrls: Array<string | null | undefined>;
  nextCmsState: unknown;
  additionalReferences?: unknown;
}) {
  const references = collectStrings(input.nextCmsState);
  collectStrings(input.additionalReferences, references);
  const candidates = [...new Set(input.oldUrls.map((url) => normalizeUrl(String(url ?? ""))).filter(Boolean))]
    .filter((url) => !references.has(url));
  if (!candidates.length) return { deleted: 0 };

  const config = assertSupabaseAdminConfig();
  const supabase = createClient(config.url, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  let deleted = 0;

  for (const publicUrl of candidates) {
    const parsed = parseStoragePublicUrl(publicUrl);
    if (!parsed || parsed.bucket !== "mithron-products" || !parsed.storagePath.startsWith("cms/")) continue;

    const { data: byUrl, error: urlReadError } = await supabase
      .from("media_assets")
      .select("id,bucket,storage_path,public_url,variants,responsive_variants")
      .eq("public_url", publicUrl)
      .limit(1);
    if (urlReadError) throw new Error(`Failed to inspect replaced CMS media: ${urlReadError.message}`);
    const fallbackId = buildMediaAssetId(parsed.bucket, parsed.storagePath);
    const fallbackResult = byUrl?.length
      ? { data: [] as JsonRecord[], error: null }
      : await supabase
          .from("media_assets")
          .select("id,bucket,storage_path,public_url,variants,responsive_variants")
          .eq("id", fallbackId)
          .limit(1);
    if (fallbackResult.error) throw new Error(`Failed to inspect replaced CMS media: ${fallbackResult.error.message}`);

    const asset = (byUrl?.[0] ?? fallbackResult.data?.[0]) as JsonRecord | undefined;
    const bucket = typeof asset?.bucket === "string" ? asset.bucket : parsed.bucket;
    const storagePath = typeof asset?.storage_path === "string" ? asset.storage_path : parsed.storagePath;
    if (bucket !== "mithron-products" || !storagePath.startsWith("cms/")) continue;

    const paths = new Set<string>([storagePath]);
    collectStoragePaths(asset?.variants, paths);
    collectStoragePaths(asset?.responsive_variants, paths);
    const safePaths = [...paths].filter((path) => path.startsWith("cms/"));

    const { error: storageError } = await supabase.storage.from(bucket).remove(safePaths);
    if (storageError) throw new Error(`Failed to delete replaced CMS image: ${storageError.message}`);

    const assetId = typeof asset?.id === "string" ? asset.id : buildMediaAssetId(bucket, storagePath);
    const { error: rowError } = await supabase.from("media_assets").delete().eq("id", assetId);
    if (rowError) throw new Error(`Failed to delete replaced CMS media record: ${rowError.message}`);
    deleted += 1;
  }

  return { deleted };
}
