#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const workspaceRoot = process.cwd();
const mediaExtensions = new Set([".avif", ".gif", ".jpeg", ".jpg", ".mp4", ".png", ".webm", ".webp"]);
const imageExtensions = new Set([".avif", ".gif", ".jpeg", ".jpg", ".png", ".webp"]);
const ignoredDirectories = new Set([".git", ".next", "node_modules", "test-results"]);
const jsonMode = process.argv.includes("--json");

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return null;
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

function relativePath(filePath) {
  return path.relative(workspaceRoot, filePath).replace(/\\/g, "/");
}

async function collectMediaFiles(root) {
  const files = [];
  if (!existsSync(root)) return files;

  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) {
          await walk(path.join(directory, entry.name));
        }
        continue;
      }

      if (!entry.isFile()) continue;
      const filePath = path.join(directory, entry.name);
      if (mediaExtensions.has(path.extname(entry.name).toLowerCase())) {
        files.push(filePath);
      }
    }
  }

  await walk(root);
  return files;
}

async function describeLocalAsset(filePath) {
  const fileStat = await stat(filePath);
  const extension = path.extname(filePath).toLowerCase();
  const asset = {
    path: relativePath(filePath),
    bytes: fileStat.size,
    size: formatBytes(fileStat.size),
    extension,
    category: "UNCLASSIFIED"
  };

  if (imageExtensions.has(extension)) {
    try {
      const metadata = await sharp(filePath, { failOn: "none" }).metadata();
      asset.width = metadata.width ?? null;
      asset.height = metadata.height ?? null;
    } catch {
      asset.width = null;
      asset.height = null;
    }
  }

  asset.category = classifyMediaPath(asset.path, extension);
  return asset;
}

function classifyMediaPath(assetPath, extension) {
  const normalizedPath = assetPath.toLowerCase();
  if (/\.(mp4|webm|mov)$/.test(extension)) return "HOVER_PREVIEW_MEDIA";
  if (normalizedPath.includes("/assets/hero/") || normalizedPath.includes("/media/mithron/hero/")) return "CRITICAL_HERO_MEDIA";
  if (normalizedPath.includes("/product") || normalizedPath.includes("/catalog") || normalizedPath.includes("/categories/")) return "PRODUCT_MEDIA";
  if (normalizedPath.includes("/operations/")) return "BACKGROUND_MEDIA";
  if (normalizedPath.includes("/admin") || normalizedPath.includes("/thumbnail")) return "ADMIN_THUMBNAILS";
  if (normalizedPath.includes("/source/")) return "ROLLBACK_SOURCE_MEDIA";
  return "EDITORIAL_MEDIA";
}

async function hashFile(filePath) {
  const buffer = await readFile(filePath);
  return createHash("sha256").update(buffer).digest("hex");
}

async function findDuplicateAssets(files) {
  const byHash = new Map();
  for (const filePath of files) {
    const fileHash = await hashFile(filePath);
    const group = byHash.get(fileHash) ?? [];
    group.push(filePath);
    byHash.set(fileHash, group);
  }

  const duplicates = [];
  for (const group of byHash.values()) {
    if (group.length <= 1) continue;
    const firstStat = await stat(group[0]);
    duplicates.push({
      bytesEach: firstStat.size,
      sizeEach: formatBytes(firstStat.size),
      count: group.length,
      paths: group.map(relativePath)
    });
  }

  return duplicates.sort((first, second) => second.bytesEach * second.count - first.bytesEach * first.count).slice(0, 20);
}

function parseDotEnv(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    values[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
  return values;
}

async function loadEnvironment() {
  const envPath = path.join(workspaceRoot, ".env.local");
  const fileEnv = existsSync(envPath) ? parseDotEnv(await readFile(envPath, "utf8")) : {};
  return { ...fileEnv, ...process.env };
}

async function fetchRemoteMithronAssets() {
  const env = await loadEnvironment();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return {
      status: "SKIPPED_ENV_MISSING",
      rows: []
    };
  }

  const endpoint = new URL("/rest/v1/mithron_assets", supabaseUrl);
  endpoint.searchParams.set("select", "asset_id,category,bucket,storage_path,asset_role,width,height,variant_width,format,mime_type,optimized_size_kb,created_at");
  endpoint.searchParams.set("order", "optimized_size_kb.desc");
  endpoint.searchParams.set("limit", "25");

  try {
    const response = await fetch(endpoint, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`
      }
    });

    if (!response.ok) {
      return {
        status: "FAILED",
        error: `${response.status} ${response.statusText}`,
        rows: []
      };
    }

    const rows = await response.json();
    return {
      status: "VERIFIED_READ_ONLY_QUERY",
      rows: rows.map((row) => ({
        id: row.asset_id,
        category: row.category,
        bucket: row.bucket,
        storagePath: row.storage_path,
        publicUrl: `${supabaseUrl}/storage/v1/object/public/${row.bucket}/${row.storage_path}`,
        assetRole: row.asset_role,
        width: row.width,
        height: row.height,
        variantWidth: row.variant_width,
        format: row.format,
        mimeType: row.mime_type,
        optimizedSizeKb: row.optimized_size_kb,
        createdAt: row.created_at
      }))
    };
  } catch (error) {
    return {
      status: "FAILED",
      error: error instanceof Error ? error.message : String(error),
      rows: []
    };
  }
}

async function readTextFileIfPresent(filePath) {
  const absolutePath = path.join(workspaceRoot, filePath);
  return existsSync(absolutePath) ? readFile(absolutePath, "utf8") : "";
}

async function collectCodeSignals() {
  const [
    heroCarousel,
    productViewer,
    catalogPage,
    mediaActions
  ] = await Promise.all([
    readTextFileIfPresent("sections/home/hero-carousel.tsx"),
    readTextFileIfPresent("sections/product/product-media-viewer.tsx"),
    readTextFileIfPresent("sections/catalog/catalog-page.tsx"),
    readTextFileIfPresent("app/admin/media/actions.ts")
  ]);

  return {
    sourcePatterns: {
      videoPreload: "video.preload"
    },
    homepageHeroPriorityMarkers: (heroCarousel.match(/priority=\{Boolean\(slide\.image\.priority\)\}/g) ?? []).length,
    productViewerPriorityMarkers: (productViewer.match(/\spriority\b/g) ?? []).length,
    catalogFetchPriorityHighMarkers: (catalogPage.match(/fetchPriority="high"/g) ?? []).length,
    catalogFallbackPriorityMarkers: (catalogPage.match(/<MithronResponsiveImage[\s\S]*?\spriority[\s\S]*?\/>/g) ?? []).length,
    catalogAvifSourceMarkers: (catalogPage.match(/type="image\/avif"/g) ?? []).length,
    adminCmsRevalidationMarkers: (mediaActions.match(/revalidatePath\("\/admin\/cms"\)/g) ?? []).length
  };
}

function summarizeByCategory(assets) {
  const byCategory = new Map();
  for (const asset of assets) {
    const current = byCategory.get(asset.category) ?? { files: 0, bytes: 0, size: "" };
    current.files += 1;
    current.bytes += asset.bytes;
    byCategory.set(asset.category, current);
  }

  return Array.from(byCategory.entries())
    .map(([category, value]) => ({
      category,
      files: value.files,
      bytes: value.bytes,
      size: formatBytes(value.bytes)
    }))
    .sort((first, second) => second.bytes - first.bytes);
}

function buildBandwidthOffenders(largestLocalAssets) {
  return [
    ...largestLocalAssets.map((asset) => ({
      category: asset.category,
      path: asset.path,
      size: asset.size,
      bytes: asset.bytes,
      note: asset.width && asset.height ? `${asset.width}x${asset.height}` : asset.extension
    }))
  ].sort((first, second) => second.bytes - first.bytes).slice(0, 25);
}

async function main() {
  const localFiles = await collectMediaFiles(path.join(workspaceRoot, "public"));
  const describedAssets = await Promise.all(localFiles.map(describeLocalAsset));
  const largestLocalAssets = describedAssets.sort((first, second) => second.bytes - first.bytes).slice(0, 30);
  const duplicateLocalAssets = await findDuplicateAssets(localFiles);
  const [remoteMithronAssets, codeSignals] = await Promise.all([
    fetchRemoteMithronAssets(),
    collectCodeSignals()
  ]);

  const report = {
    generatedAt: new Date().toISOString(),
    totals: {
      localMediaFiles: localFiles.length,
      localMediaBytes: describedAssets.reduce((sum, asset) => sum + asset.bytes, 0),
      localMediaSize: formatBytes(describedAssets.reduce((sum, asset) => sum + asset.bytes, 0))
    },
    categorySummary: summarizeByCategory(describedAssets),
    bandwidthOffenders: buildBandwidthOffenders(largestLocalAssets),
    largestLocalAssets,
    duplicateLocalAssets,
    remoteMithronAssets,
    codeSignals
  };

  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`Media bandwidth audit generated at ${report.generatedAt}`);
  console.log(`Local public media: ${report.totals.localMediaFiles} files, ${report.totals.localMediaSize}`);
  console.log("\nLargest local assets:");
  for (const asset of largestLocalAssets.slice(0, 10)) {
    console.log(`- ${asset.size} ${asset.path}${asset.width && asset.height ? ` ${asset.width}x${asset.height}` : ""}`);
  }
  console.log("\nMedia categories:");
  for (const category of report.categorySummary.slice(0, 8)) {
    console.log(`- ${category.category}: ${category.files} files, ${category.size}`);
  }
  console.log("\nBandwidth offenders:");
  for (const offender of report.bandwidthOffenders.slice(0, 10)) {
    console.log(`- ${offender.category} ${offender.size} ${offender.path} (${offender.note})`);
  }
  console.log("\nLargest Supabase mithron_assets rows:");
  if (remoteMithronAssets.status !== "VERIFIED_READ_ONLY_QUERY") {
    console.log(`- ${remoteMithronAssets.status}${remoteMithronAssets.error ? `: ${remoteMithronAssets.error}` : ""}`);
  } else {
    for (const row of remoteMithronAssets.rows.slice(0, 10)) {
      console.log(`- ${row.optimizedSizeKb ?? "unknown"} KB ${row.bucket}/${row.storagePath}`);
    }
  }
  console.log("\nCode signals:");
  console.log(JSON.stringify(codeSignals, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
