/**
 * Delete catalog cutouts + orphaned pre-migration product uploads from Supabase.
 * Keeps every /wix-content/ asset and every live primary/gallery/hero display image.
 *
 * Default: dry-run. Live requires --apply --confirm=DELETE_CUTOUTS_AND_DUPES
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUCKET = "mithron-products";
const CONFIRM = "DELETE_CUTOUTS_AND_DUPES";
const PAGE = 500;
const STORAGE_BATCH = 80;

type MediaRow = {
  id: string;
  bucket: string | null;
  storage_path: string | null;
  public_url: string | null;
  variants: unknown;
  responsive_variants: unknown;
};

function loadEnv() {
  for (const envPath of [join(root, ".env.local"), join(root, ".env")]) {
    if (!existsSync(envPath)) continue;
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const eq = trimmed.indexOf("=");
      const name = trimmed.slice(0, eq);
      if (!name || process.env[name]) continue;
      process.env[name] = trimmed.slice(eq + 1).replace(/^["']|["']$/g, "");
    }
  }
}

function parseArgs(argv: string[]) {
  return {
    apply: argv.includes("--apply"),
    confirm: argv.find((arg) => arg.startsWith("--confirm="))?.slice("--confirm=".length) ?? null,
    help: argv.includes("--help") || argv.includes("-h")
  };
}

function isCutoutPath(path: string) {
  return path.includes("catalog-cutouts/");
}

function isWixContentPath(path: string) {
  return path.includes("/wix-content/");
}

function collectStoragePaths(value: unknown, output = new Set<string>()) {
  if (Array.isArray(value)) {
    for (const item of value) collectStoragePaths(item, output);
    return output;
  }
  if (!value || typeof value !== "object") return output;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if ((key === "storage_path" || key === "storagePath") && typeof item === "string" && item.trim()) {
      output.add(item.trim());
    } else {
      collectStoragePaths(item, output);
    }
  }
  return output;
}

async function fetchAllMedia(supabase: SupabaseClient): Promise<MediaRow[]> {
  const rows: MediaRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("media_assets")
      .select("id,bucket,storage_path,public_url,variants,responsive_variants")
      .eq("bucket", BUCKET)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    rows.push(...(data as MediaRow[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

async function fetchLiveMediaIds(supabase: SupabaseClient): Promise<Set<string>> {
  const live = new Set<string>();
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("product_media_assets")
      .select("media_asset_id,usage")
      .in("usage", ["primary", "gallery", "hero"])
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const row of data) {
      if (row.media_asset_id) live.add(row.media_asset_id);
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }

  from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("mithron_products")
      .select("image,hero,gallery")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    const urls = new Set<string>();
    for (const product of data) {
      const imageSrc = (product.image as { src?: string } | null)?.src;
      const heroSrc = (product.hero as { src?: string } | null)?.src;
      if (imageSrc) urls.add(imageSrc);
      if (heroSrc) urls.add(heroSrc);
      if (Array.isArray(product.gallery)) {
        for (const item of product.gallery) {
          const src = (item as { src?: string } | null)?.src;
          if (src) urls.add(src);
        }
      }
    }
    if (urls.size) {
      const urlList = [...urls];
      for (let i = 0; i < urlList.length; i += 50) {
        const chunk = urlList.slice(i, i + 50);
        const { data: assets, error: assetError } = await supabase
          .from("media_assets")
          .select("id")
          .in("public_url", chunk);
        if (assetError) throw new Error(assetError.message);
        for (const asset of assets ?? []) live.add(asset.id);
      }
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return live;
}

async function unlinkAllRefs(supabase: SupabaseClient, mediaIds: string[]) {
  let unlinked = 0;
  for (let i = 0; i < mediaIds.length; i += 50) {
    const chunk = mediaIds.slice(i, i + 50);
    const { data, error } = await supabase
      .from("product_media_assets")
      .delete()
      .in("media_asset_id", chunk)
      .select("media_asset_id");
    if (error) throw new Error(error.message);
    unlinked += data?.length ?? 0;
  }
  return unlinked;
}

async function deleteStoragePaths(supabase: SupabaseClient, paths: string[]) {
  let deleted = 0;
  for (let i = 0; i < paths.length; i += STORAGE_BATCH) {
    const chunk = paths.slice(i, i + STORAGE_BATCH);
    const { error } = await supabase.storage.from(BUCKET).remove(chunk);
    if (error) throw new Error(`Storage remove failed: ${error.message}`);
    deleted += chunk.length;
  }
  return deleted;
}

async function deleteMediaRows(supabase: SupabaseClient, ids: string[]) {
  let deleted = 0;
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const { data, error } = await supabase.from("media_assets").delete().in("id", chunk).select("id");
    if (error) throw new Error(error.message);
    deleted += data?.length ?? 0;
  }
  return deleted;
}

async function listLeftoverCutoutStorage(supabase: SupabaseClient) {
  const leftovers: string[] = [];
  const prefixes = ["catalog-cutouts", "catalog-cutouts/v1"];
  for (const prefix of prefixes) {
    let offset = 0;
    while (true) {
      const { data, error } = await supabase.storage.from(BUCKET).list(prefix, {
        limit: 100,
        offset,
        sortBy: { column: "name", order: "asc" }
      });
      if (error) break;
      if (!data?.length) break;
      for (const item of data) {
        if (item.id) leftovers.push(`${prefix}/${item.name}`);
      }
      if (data.length < 100) break;
      offset += 100;
    }
  }
  return leftovers;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(`Delete cutouts + orphan duplicate product uploads from Supabase Storage.

Keeps:
  - all products/*/wix-content/* assets
  - all live primary/gallery/hero display images (including non-Wix products)

Deletes:
  - all catalog-cutouts/* media_assets + Storage objects
  - orphaned products/* uploads that are not wix-content and not live

Usage:
  node --experimental-strip-types tools/cleanup-cutouts-and-duplicate-media.ts
  node --experimental-strip-types tools/cleanup-cutouts-and-duplicate-media.ts --apply --confirm=${CONFIRM}
`);
    return;
  }

  if (options.apply && options.confirm !== CONFIRM) {
    throw new Error(`Live cleanup requires --apply --confirm=${CONFIRM}`);
  }

  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const [media, liveIds] = await Promise.all([fetchAllMedia(supabase), fetchLiveMediaIds(supabase)]);

  const cutouts: MediaRow[] = [];
  const orphanDupes: MediaRow[] = [];
  const keptWix: MediaRow[] = [];
  const keptLiveOther: MediaRow[] = [];

  for (const row of media) {
    const path = row.storage_path ?? "";
    if (!path) continue;
    if (isWixContentPath(path)) {
      keptWix.push(row);
      continue;
    }
    if (isCutoutPath(path)) {
      cutouts.push(row);
      continue;
    }
    if (path.startsWith("products/") && !liveIds.has(row.id)) {
      orphanDupes.push(row);
      continue;
    }
    if (path.startsWith("products/") && liveIds.has(row.id)) {
      keptLiveOther.push(row);
    }
  }

  // Safety: never delete a live asset even if path looks like cutout (should be 0).
  const unsafeCutouts = cutouts.filter((row) => liveIds.has(row.id));
  if (unsafeCutouts.length) {
    throw new Error(`Refusing cleanup: ${unsafeCutouts.length} cutout asset(s) are still live display images.`);
  }

  const deleteTargets = [...cutouts, ...orphanDupes];
  const storagePaths = new Set<string>();
  for (const row of deleteTargets) {
    if (row.storage_path) storagePaths.add(row.storage_path);
    collectStoragePaths(row.variants, storagePaths);
    collectStoragePaths(row.responsive_variants, storagePaths);
  }

  // Only allow deleting cutout paths or non-wix product paths.
  const safeStoragePaths = [...storagePaths].filter(
    (path) => isCutoutPath(path) || (path.startsWith("products/") && !isWixContentPath(path))
  );

  const report = {
    mode: options.apply ? "APPLIED" : "DRY_RUN",
    inventory: {
      total_bucket_assets: media.length,
      cutouts_to_delete: cutouts.length,
      orphan_duplicates_to_delete: orphanDupes.length,
      wix_content_kept: keptWix.length,
      live_non_wix_kept: keptLiveOther.length,
      storage_paths_to_remove: safeStoragePaths.length
    },
    sample_cutouts: cutouts.slice(0, 5).map((row) => row.storage_path),
    sample_dupes: orphanDupes.slice(0, 5).map((row) => row.storage_path),
    sample_kept_live_other: keptLiveOther.slice(0, 10).map((row) => row.storage_path)
  };

  const outDir = join(root, "data", "wix-content-migration", "cleanup");
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = join(outDir, `cutout-dupe-cleanup-${stamp}.json`);
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        ...report,
        cutout_ids: cutouts.map((row) => row.id),
        dupe_ids: orphanDupes.map((row) => row.id),
        storage_paths: safeStoragePaths
      },
      null,
      2
    )
  );

  if (!options.apply) {
    console.log(JSON.stringify({ ...report, report_path: reportPath }, null, 2));
    return;
  }

  const ids = deleteTargets.map((row) => row.id);
  const unlinked = await unlinkAllRefs(supabase, ids);
  const storageDeleted = await deleteStoragePaths(supabase, safeStoragePaths);
  const rowsDeleted = await deleteMediaRows(supabase, ids);

  // Sweep any leftover cutout files still listed in Storage but missing from media_assets.
  const leftovers = await listLeftoverCutoutStorage(supabase);
  let leftoverDeleted = 0;
  if (leftovers.length) {
    leftoverDeleted = await deleteStoragePaths(supabase, leftovers);
  }

  // Final verification
  const { count: remainingCutouts } = await supabase
    .from("media_assets")
    .select("id", { count: "exact", head: true })
    .like("storage_path", "%catalog-cutouts%");
  const { count: remainingWix } = await supabase
    .from("media_assets")
    .select("id", { count: "exact", head: true })
    .like("storage_path", "%/wix-content/%");

  const applied = {
    ...report,
    report_path: reportPath,
    unlinked_product_media_rows: unlinked,
    storage_objects_removed: storageDeleted,
    media_rows_deleted: rowsDeleted,
    leftover_cutout_storage_removed: leftoverDeleted,
    verify: {
      remaining_cutout_media_assets: remainingCutouts ?? null,
      remaining_wix_content_media_assets: remainingWix ?? null
    }
  };
  writeFileSync(reportPath.replace(".json", ".applied.json"), JSON.stringify(applied, null, 2));
  console.log(JSON.stringify(applied, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
