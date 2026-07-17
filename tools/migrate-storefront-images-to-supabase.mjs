#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import {
  BUCKET_BY_GROUP,
  STOREFRONT_IMAGE_INVENTORY,
  canonicalStorefrontSrc,
  dedupeInventory,
  isAiEnhancementExcluded
} from "./storefront-image-inventory.mjs";
import { ensureRealEsrganBinary } from "./realesrgan-binary.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const publicRoot = join(projectRoot, "public");
const supabaseManifestPath = join(projectRoot, "data", "mithron-supabase-assets.generated.json");
const remoteMapPath = join(projectRoot, "data", "mithron-storefront-remote-map.generated.json");
const stagingManifestPath = join(projectRoot, "tools", ".migrate-storefront-manifest.json");

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const deleteLocal = args.has("--delete-local");
const skipEnhance = args.has("--skip-enhance");
const skipUpload = args.has("--skip-upload");
const forceEnhance = args.has("--force-enhance");

const variantWidths = [3840, 2560, 1920, 1280, 768, 480];
const webpQuality = 96;
const cacheControl = "31536000";

function loadProjectEnv() {
  for (const envPath of [join(projectRoot, ".env.local"), join(projectRoot, ".env")]) {
    if (!existsSync(envPath)) continue;
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [name, ...parts] = trimmed.split("=");
      if (!name || process.env[name]) continue;
      process.env[name] = parts.join("=").replace(/^["']|["']$/g, "");
    }
  }
}

function hashBuffer(buffer, size = 8) {
  return createHash("sha256").update(buffer).digest("hex").slice(0, size);
}

function slugFromSrc(src) {
  return basename(src, extname(src))
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function assetIdFromSrc(src) {
  return `storefront-${slugFromSrc(src)}`;
}

function resolveMasterPath(src) {
  const candidates = [
    join(publicRoot, src.replace(/^\//, "").split("?")[0]),
    join(publicRoot, canonicalStorefrontSrc(src).replace(/^\//, "")),
    join(publicRoot, canonicalStorefrontSrc(src).replace(/^\//, "").replace(/\.webp$/i, ".png")),
    join(publicRoot, src.replace(/^\//, "").split("?")[0].replace(/\.webp$/i, ".png"))
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return candidates[0];
}

function localPathForSrc(src) {
  return resolveMasterPath(src);
}

function isEnhanced(src) {
  return existsSync(`${localPathForSrc(src)}.enhanced.json`);
}

function detectPython() {
  for (const candidate of ["python", "python3", "py"]) {
    const probe = spawnSync(candidate, ["--version"], { shell: false, windowsHide: true });
    if (probe.status === 0) return candidate;
  }
  return null;
}

async function blurDataUrlFor(buffer) {
  const preview = await sharp(buffer).resize(28, 28, { fit: "inside" }).webp({ quality: 34 }).toBuffer();
  return `data:image/webp;base64,${preview.toString("base64")}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(label, fn, { attempts = 6, baseDelayMs = 1500 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = error?.message ?? String(error);
      const retryable = /service unavailable|bad gateway|timeout|rate limit|503|502|504|429|econnreset|fetch failed/i.test(
        message
      );
      if (!retryable || attempt === attempts) throw error;
      const delay = baseDelayMs * 2 ** (attempt - 1);
      console.warn(`${label}: attempt ${attempt}/${attempts} failed (${message}); retrying in ${delay}ms`);
      await sleep(delay);
    }
  }
  throw lastError;
}

async function runEnhancement(inventory) {
  const python = detectPython();
  if (!python) throw new Error("Python not found for enhancement.");

  const manifestItems = inventory
    .filter((item) => !isAiEnhancementExcluded(item.src))
    .filter((item) => existsSync(localPathForSrc(item.src)))
    .filter((item) => forceEnhance || !isEnhanced(item.src))
    .map((item) => ({
      src: item.src,
      maxEdge: item.maxEdge,
      resolvedPath: localPathForSrc(item.src),
      slug: slugFromSrc(item.src)
    }));

  if (manifestItems.length === 0) {
    console.log("No storefront masters need enhancement.");
    return;
  }

  writeFileSync(
    stagingManifestPath,
    JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), items: manifestItems }, null, 2)
  );

  const binaryPath = await ensureRealEsrganBinary();
  const commandArgs = [
    join(projectRoot, "tools", "enhance-source-batch.py"),
    "--manifest",
    stagingManifestPath,
    "--project-root",
    projectRoot,
    "--binary-path",
    binaryPath
  ];
  if (dryRun) commandArgs.push("--dry-run");
  if (forceEnhance) commandArgs.push("--force");

  console.log(`Enhancing ${manifestItems.length} storefront masters...`);
  const result = spawnSync(python, commandArgs, { cwd: projectRoot, stdio: "inherit", shell: false, windowsHide: true });
  if (result.status !== 0) {
    throw new Error(`enhance-source-batch failed with exit code ${result.status ?? "unknown"}`);
  }
}

function readExistingSupabaseManifest() {
  if (!existsSync(supabaseManifestPath)) return { version: 1, assets: [] };
  return JSON.parse(readFileSync(supabaseManifestPath, "utf8"));
}

function buildPublicUrl(bucket, storagePath) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/g, "") ?? "";
  return `${base}/storage/v1/object/public/${bucket}/${storagePath}`;
}

async function uploadInventoryAsset(supabase, item) {
  const masterPath = localPathForSrc(item.src);
  if (!existsSync(masterPath)) {
    return { status: "missing", src: item.src, masterPath };
  }

  const bucket = BUCKET_BY_GROUP[item.group] ?? "mithron-story";
  const baseName = slugFromSrc(item.src);
  const sourceMeta = await sharp(masterPath).metadata();
  const widths = variantWidths.filter((width) => width <= (sourceMeta.width ?? width));
  const webpVariants = [];

  for (const width of widths) {
    const buffer = await sharp(masterPath)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: webpQuality, effort: 6, smartSubsample: true })
      .toBuffer();
    const hash = hashBuffer(buffer, 8);
    const storagePath = `storefront/${baseName}-${width}w-enh-v1.${hash}.webp`;
    if (!dryRun && supabase) {
      await withRetry(`upload ${storagePath}`, async () => {
        const { error } = await supabase.storage.from(bucket).upload(storagePath, buffer, {
          cacheControl,
          contentType: "image/webp",
          upsert: false
        });
        if (error && !/already exists/i.test(error.message)) {
          throw new Error(`Upload failed for ${storagePath}: ${error.message}`);
        }
      });
      await sleep(120);
    }
    const info = await sharp(buffer).metadata();
    webpVariants.push({
      width,
      height: info.height ?? width,
      format: "webp",
      src: buildPublicUrl(bucket, storagePath),
      storagePath,
      optimizedSizeKb: Number((buffer.byteLength / 1024).toFixed(2))
    });
  }

  const masterBuffer = await sharp(masterPath).toBuffer();
  const blurDataUrl = await blurDataUrlFor(masterBuffer);
  const stats = await sharp(masterBuffer).stats();
  const dominant = stats.dominant;
  const dominantColor = `#${[dominant.r, dominant.g, dominant.b]
    .map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
    .join("")}`;

  const best = [...webpVariants].sort((a, b) => a.width - b.width).at(-1);
  return {
    status: "uploaded",
    src: item.src,
    bucket,
    assetId: assetIdFromSrc(item.src),
    alt: item.alt ?? baseName,
    width: sourceMeta.width ?? best?.width ?? 0,
    height: sourceMeta.height ?? best?.height ?? 0,
    blurDataUrl,
    dominantColor,
    variants: { webp: webpVariants },
    primarySrc: best?.src ?? null
  };
}

function mergeManifestAssets(existingAssets, uploadedAssets) {
  const byFallback = new Map(existingAssets.map((asset) => [asset.fallbackSrc, asset]));
  const byAssetId = new Map(existingAssets.map((asset) => [asset.assetId, asset]));

  for (const uploaded of uploadedAssets) {
    if (uploaded.status !== "uploaded") continue;
    const asset = {
      assetId: uploaded.assetId,
      bucket: uploaded.bucket,
      assetRole: uploaded.bucket === "mithron-hero" ? "hero" : uploaded.bucket === "mithron-interests" ? "poster" : "story",
      category: uploaded.bucket === "mithron-hero" ? "hero" : "storefront",
      generatedPromptId: `storefront.${slugFromSrc(uploaded.src)}`,
      status: "generated",
      fallbackSrc: uploaded.src,
      fallbackAlt: uploaded.alt,
      width: uploaded.width,
      height: uploaded.height,
      blurDataUrl: uploaded.blurDataUrl,
      dominantColor: uploaded.dominantColor,
      variants: uploaded.variants
    };
    byFallback.set(uploaded.src, asset);
    byAssetId.set(uploaded.assetId, asset);
  }

  return [...byAssetId.values()];
}

function buildRemoteMap(uploadedAssets) {
  const assets = {};
  for (const uploaded of uploadedAssets) {
    if (uploaded.status !== "uploaded" || !uploaded.primarySrc) continue;
    assets[uploaded.src] = {
      assetId: uploaded.assetId,
      bucket: uploaded.bucket,
      primarySrc: uploaded.primarySrc,
      variants: uploaded.variants
    };
  }
  return { version: 1, updatedAt: new Date().toISOString(), assets };
}

function expandRemoteMapAliases(remoteMap) {
  const aliases = {
    "/media/mithron/hero/ag10-command.webp": "/assets/hero/hero-slide-01.webp",
    "/media/mithron/hero/mapping-flight.webp": "/assets/hero/hero-slide-02.webp",
    "/media/mithron/hero/security-grid.webp": "/assets/hero/hero-slide-04.webp",
    "/media/mithron/banners/ag10-command.webp": "/assets/hero/hero-slide-01.webp",
    "/media/mithron/banners/mapping-flight.webp": "/assets/hero/hero-slide-02.webp",
    "/media/mithron/banners/security-grid.webp": "/assets/hero/hero-slide-04.webp",
    "/media/mithron/carousel/ag10-command.webp": "/assets/hero/hero-slide-01.webp",
    "/media/mithron/carousel/mapping-flight.webp": "/assets/hero/hero-slide-02.webp",
    "/media/mithron/carousel/security-grid.webp": "/assets/hero/hero-slide-04.webp"
  };
  for (const [alias, canonical] of Object.entries(aliases)) {
    if (remoteMap.assets[canonical] && !remoteMap.assets[alias]) {
      remoteMap.assets[alias] = remoteMap.assets[canonical];
    }
  }
  return remoteMap;
}

function deleteLocalRasters(inventory) {
  const deleted = [];
  const kept = [];
  for (const item of inventory) {
    const path = localPathForSrc(item.src);
    if (!existsSync(path)) continue;
    if (dryRun) {
      deleted.push(path);
      continue;
    }
    rmSync(path, { force: true });
    deleted.push(path);
    for (const suffix of [".bak", ".enhanced.json"]) {
      const sidecar = `${path}${suffix}`;
      if (existsSync(sidecar)) rmSync(sidecar, { force: true });
    }
  }

  const optimizedRoot = join(publicRoot, "optimized");
  if (existsSync(optimizedRoot) && !dryRun) {
    rmSync(optimizedRoot, { recursive: true, force: true });
  } else if (existsSync(optimizedRoot)) {
    kept.push(optimizedRoot);
  }

  return { deleted, kept };
}

async function main() {
  loadProjectEnv();
  const inventory = dedupeInventory(STOREFRONT_IMAGE_INVENTORY);
  console.log(`Storefront image inventory: ${inventory.length} unique masters`);

  if (!skipEnhance) {
    await runEnhancement(inventory);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase =
    skipUpload || dryRun
      ? null
      : createClient(url, serviceRoleKey, { auth: { persistSession: false } });

  if (!skipUpload && !dryRun && (!url || !serviceRoleKey)) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for upload.");
  }

  const uploaded = [];
  if (skipUpload) {
    console.log("Skipping Supabase upload (--skip-upload).");
  } else {
    for (const item of inventory) {
      if (isAiEnhancementExcluded(item.src)) {
        console.log(`skip ${item.src}: use tools/upload-wordmark-to-supabase.mjs`);
        continue;
      }
      const result = await uploadInventoryAsset(supabase, item);
      uploaded.push(result);
      if (result.status === "uploaded") {
        console.log(`uploaded ${item.src} → ${result.primarySrc}`);
      } else {
        console.warn(`skip ${item.src}: ${result.status}`);
      }
    }
  }

  const existing = readExistingSupabaseManifest();
  const mergedAssets = skipUpload ? (existing.assets ?? []) : mergeManifestAssets(existing.assets ?? [], uploaded);
  const remoteMap = skipUpload
    ? expandRemoteMapAliases(JSON.parse(readFileSync(remoteMapPath, "utf8")))
    : expandRemoteMapAliases(buildRemoteMap(uploaded));

  if (!dryRun) {
    writeFileSync(
      supabaseManifestPath,
      `${JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), assets: mergedAssets }, null, 2)}\n`
    );
    writeFileSync(remoteMapPath, `${JSON.stringify(remoteMap, null, 2)}\n`);
  }

  let deletion = null;
  if (deleteLocal) {
    deletion = deleteLocalRasters(inventory);
    console.log(`Deleted ${deletion.deleted.length} local raster files`);
  }

  const summary = {
    dryRun,
    skipUpload,
    inventory: inventory.length,
    uploaded: skipUpload ? 0 : uploaded.filter((item) => item.status === "uploaded").length,
    missing: skipUpload ? 0 : uploaded.filter((item) => item.status === "missing").length,
    manifestAssets: mergedAssets.length,
    remoteMapEntries: Object.keys(remoteMap.assets).length,
    deleteLocal: Boolean(deleteLocal),
    deletedLocalCount: deletion?.deleted.length ?? 0
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
