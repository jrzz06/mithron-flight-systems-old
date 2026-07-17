#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pathAliases from "../config/storefront-path-aliases.json" with { type: "json" };

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const supabaseManifestPath = join(projectRoot, "data", "mithron-supabase-assets.generated.json");
const remoteMapPath = join(projectRoot, "data", "mithron-storefront-remote-map.generated.json");

function largestWebpVariant(asset) {
  const webp = asset?.variants?.webp ?? [];
  if (webp.length === 0) return null;
  return [...webp].sort((a, b) => b.width - a.width)[0];
}

function entryFromManifestAsset(asset) {
  if (asset.status !== "generated" || !asset.fallbackSrc?.startsWith("/")) return null;
  const best = largestWebpVariant(asset);
  if (!best?.src) return null;
  return {
    assetId: asset.assetId,
    bucket: asset.bucket,
    primarySrc: best.src,
    variants: { webp: asset.variants?.webp ?? [] }
  };
}

function expandRemoteMapAliases(remoteMap) {
  for (const [alias, canonical] of Object.entries(pathAliases)) {
    if (remoteMap.assets[canonical] && !remoteMap.assets[alias]) {
      remoteMap.assets[alias] = remoteMap.assets[canonical];
    }
  }
  return remoteMap;
}

function main() {
  if (!existsSync(supabaseManifestPath)) {
    throw new Error(`Missing ${supabaseManifestPath}`);
  }

  const manifest = JSON.parse(readFileSync(supabaseManifestPath, "utf8"));
  const existing = existsSync(remoteMapPath)
    ? JSON.parse(readFileSync(remoteMapPath, "utf8"))
    : { version: 1, assets: {} };

  const assets = { ...(existing.assets ?? {}) };
  let added = 0;
  let updated = 0;

  for (const asset of manifest.assets ?? []) {
    const entry = entryFromManifestAsset(asset);
    if (!entry) continue;

    const key = asset.fallbackSrc;
    const prior = assets[key];
    assets[key] = entry;
    if (!prior) added += 1;
    else if (prior.primarySrc !== entry.primarySrc) updated += 1;
  }

  const remoteMap = expandRemoteMapAliases({
    version: 1,
    updatedAt: new Date().toISOString(),
    assets
  });

  writeFileSync(remoteMapPath, `${JSON.stringify(remoteMap, null, 2)}\n`);

  console.log(
    JSON.stringify(
      {
        remoteMapEntries: Object.keys(remoteMap.assets).length,
        added,
        updated,
        output: remoteMapPath
      },
      null,
      2
    )
  );
}

main();
