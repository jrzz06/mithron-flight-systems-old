#!/usr/bin/env node

import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const { loadEnvConfig } = nextEnv;
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const manifestPath = join(projectRoot, "data", "mithron-supabase-assets.generated.json");

const editorialBuckets = new Set(["mithron-hero", "mithron-interests", "mithron-story", "mithron-products"]);

function groupKey(row) {
  const metadata = row.upload_metadata ?? {};
  return String(
    metadata.generated_prompt_id
      ?? metadata.asset_id
      ?? row.id
      ?? row.storage_path
  );
}

function parseVariant(row) {
  const metadata = row.upload_metadata ?? {};
  const responsive = row.responsive_variants ?? {};
  const format = String(responsive.format ?? metadata.format ?? row.mime_type?.split("/")[1] ?? "webp");
  const width = Number(responsive.variant_width ?? metadata.variant_width ?? row.width ?? 0);
  if (!width || !row.public_url) return null;

  return {
    width,
    height: Number(row.height ?? width),
    format,
    src: row.public_url,
    storagePath: row.storage_path,
    optimizedSizeKb: Number((Number(row.size_bytes ?? row.file_size_bytes ?? 0) / 1024).toFixed(2))
  };
}

function buildManifestAsset(groupKeyValue, rows) {
  const primary = rows.find((row) => row.is_primary) ?? rows[0];
  const metadata = primary.upload_metadata ?? {};
  const variants = { avif: [], webp: [] };

  for (const row of rows) {
    const variant = parseVariant(row);
    if (!variant) continue;
    const bucket = variants[variant.format] ?? [];
    bucket.push(variant);
    variants[variant.format] = bucket;
  }

  for (const format of Object.keys(variants)) {
    variants[format] = variants[format].sort((left, right) => right.width - left.width);
  }

  const assetRole = String(metadata.asset_role ?? primary.tags?.[1] ?? "hero");
  const category = String(metadata.category ?? primary.folder ?? "general");
  const fallbackSrc = String(metadata.fallback_src ?? primary.caption ?? `/media/mithron/${primary.storage_path}`);

  return {
    assetId: String(metadata.asset_id ?? groupKeyValue).replace(/[^a-z0-9-]+/gi, "-").toLowerCase(),
    bucket: primary.bucket,
    assetRole,
    category,
    productSlug: metadata.product_slug ?? undefined,
    generatedPromptId: String(metadata.generated_prompt_id ?? groupKeyValue),
    status: variants.avif.length || variants.webp.length ? "generated" : "fallback",
    fallbackSrc: fallbackSrc.startsWith("/") ? fallbackSrc : `/${fallbackSrc}`,
    fallbackAlt: String(primary.alt_text ?? primary.alt ?? groupKeyValue),
    width: Number(primary.width ?? 1920),
    height: Number(primary.height ?? 1080),
    blurhash: primary.variants?.blurhash ?? metadata.blurhash ?? undefined,
    blurDataUrl: metadata.blur_data_url ?? undefined,
    dominantColor: primary.variants?.dominant_color ?? metadata.dominant_color ?? "#eef2f5",
    variants
  };
}

async function fetchMediaRows(supabase) {
  const { data, error } = await supabase
    .from("media_assets")
    .select("id,bucket,storage_path,public_url,mime_type,width,height,size_bytes,file_size_bytes,alt,alt_text,caption,folder,tags,variants,responsive_variants,upload_metadata,is_primary,updated_at")
    .in("bucket", Array.from(editorialBuckets))
    .eq("visibility", "public")
    .limit(5000);

  if (error) throw new Error(`media_assets fetch failed: ${error.message}`);
  return data ?? [];
}

function main() {
  loadEnvConfig(projectRoot);
  const dryRun = process.argv.includes("--dry-run");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

  fetchMediaRows(supabase).then((rows) => {
    const groups = new Map();
    for (const row of rows) {
      const key = groupKey(row);
      const bucket = groups.get(key) ?? [];
      bucket.push(row);
      groups.set(key, bucket);
    }

    const assets = Array.from(groups.entries())
      .map(([key, groupRows]) => buildManifestAsset(key, groupRows))
      .filter((asset) => asset.variants.avif.length || asset.variants.webp.length || asset.fallbackSrc);

    const manifest = {
      version: 1,
      updatedAt: new Date().toISOString(),
      source: "media_assets",
      assets
    };

    if (dryRun) {
      console.log(JSON.stringify({ dryRun: true, assetCount: assets.length, manifestPath }, null, 2));
      return;
    }

    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const syncTool = join(projectRoot, "tools", "sync-storefront-remote-map.mjs");
    if (existsSync(syncTool)) {
      const result = spawnSync(process.execPath, [syncTool], { cwd: projectRoot, stdio: "inherit" });
      if (result.status !== 0) {
        throw new Error("sync-storefront-remote-map.mjs failed");
      }
    }

    console.log(JSON.stringify({ status: "VERIFIED", assetCount: assets.length, manifestPath }, null, 2));
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

main();
