#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const manifestPath = join(projectRoot, "data", "mithron-supabase-assets.generated.json");

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const dryRun = !apply;

const ORPHAN_PREFIXES = [
  "mithron-story/home-media-rail/",
  "home-media-rail/"
];

function loadManifestAssetIds() {
  if (!existsSync(manifestPath)) return [];
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  return (manifest.assets ?? [])
    .map((asset) => ({
      assetId: asset.assetId,
      bucket: asset.bucket,
      fallbackSrc: asset.fallbackSrc
    }))
    .filter((asset) => {
      const haystack = `${asset.assetId ?? ""} ${asset.fallbackSrc ?? ""}`.toLowerCase();
      return ORPHAN_PREFIXES.some((prefix) => haystack.includes(prefix.replace(/\/$/, "")));
    });
}

async function deleteStorageObject(bucket, objectPath) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for storage cleanup.");
  }

  const response = await fetch(`${url}/storage/v1/object/${bucket}/${objectPath}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key
    }
  });

  return response.ok;
}

async function main() {
  const candidates = loadManifestAssetIds();
  console.log(`Found ${candidates.length} manifest entries matching home-media-rail orphans.`);

  for (const asset of candidates) {
    const label = `${asset.bucket ?? "unknown"} :: ${asset.assetId} :: ${asset.fallbackSrc ?? ""}`;
    if (dryRun) {
      console.log(`[dry-run] would remove ${label}`);
      continue;
    }

    if (!asset.bucket || !asset.assetId) {
      console.warn(`[skip] missing bucket/assetId for ${label}`);
      continue;
    }

    const removed = await deleteStorageObject(asset.bucket, asset.assetId);
    console.log(removed ? `[removed] ${label}` : `[failed] ${label}`);
  }

  if (dryRun) {
    console.log("Dry run complete. Re-run with --apply to delete Supabase storage objects.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
