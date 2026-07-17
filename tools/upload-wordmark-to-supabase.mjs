#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const supabaseManifestPath = join(projectRoot, "data", "mithron-supabase-assets.generated.json");
const remoteMapPath = join(projectRoot, "data", "mithron-storefront-remote-map.generated.json");

const FALLBACK_SRC = "/media/mithron/shell/mithron-wordmark.png";
const ASSET_ID = "storefront-mithron-wordmark";
const BUCKET = "mithron-story";
const BASE_NAME = "mithron-wordmark";
const VERSION_TAG = "v6-mithron-only";
const variantWidths = [1280, 768, 480, 256];
const webpQuality = 95;

/** Navbar wordmark: MITHRON letters only (exclude gold tagline band). */
const WORDMARK_CROP_HEIGHT_RATIO = 0.52;

const restoreMode = process.argv.includes("--restore");

function clamp(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function luminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Soft matte removal — keeps original green pixels + anti-aliased edges.
 */
function keyPixel(r, g, b) {
  const greenness = g - Math.max(r, b);
  const lum = luminance(r, g, b);

  if (r > 115 && g > 85 && b < 75 && greenness < 22) {
    return { r, g, b, a: 0 };
  }

  if (lum < 14 && greenness < 10) {
    return { r, g, b, a: 0 };
  }

  if (greenness >= 5 || (g >= 36 && g >= r && g >= b)) {
    let alpha = 255;
    if (lum < 50) {
      alpha = clamp((lum - 10) * 5 + greenness * 6);
    }
    return { r, g, b, a: clamp(alpha) };
  }

  if (lum >= 14) {
    const alpha = clamp((lum - 14) * 6 + Math.max(greenness, 0) * 3);
    if (alpha <= 6) return { r, g, b, a: 0 };
    return { r, g, b, a: alpha };
  }

  return { r, g, b, a: 0 };
}

async function processNavWordmark(sourcePath) {
  if (restoreMode) {
    return sharp(sourcePath).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  }

  const sourceMeta = await sharp(sourcePath).metadata();
  const cropHeight = Math.max(1, Math.round((sourceMeta.height ?? 1) * WORDMARK_CROP_HEIGHT_RATIO));

  const cropped = await sharp(sourcePath)
    .extract({
      left: 0,
      top: 0,
      width: sourceMeta.width ?? 1,
      height: Math.min(cropHeight, sourceMeta.height ?? cropHeight)
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = cropped;
  for (let i = 0; i < data.length; i += info.channels) {
    const keyed = keyPixel(data[i], data[i + 1], data[i + 2]);
    data[i] = keyed.r;
    data[i + 1] = keyed.g;
    data[i + 2] = keyed.b;
    data[i + 3] = keyed.a;
  }

  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: info.channels }
  })
    .trim({ threshold: 10 })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

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

function buildPublicUrl(bucket, storagePath) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/g, "") ?? "";
  return `${base}/storage/v1/object/public/${bucket}/${storagePath}`;
}

async function blurDataUrlFor(buffer) {
  const tiny = await sharp(buffer).resize(16).webp({ quality: 40 }).toBuffer();
  return `data:image/webp;base64,${tiny.toString("base64")}`;
}

function mergeSupabaseAssets(existing, uploaded) {
  const byId = new Map((existing.assets ?? []).map((asset) => [asset.assetId, asset]));
  byId.set(uploaded.assetId, uploaded);
  return { version: 1, updatedAt: new Date().toISOString(), assets: [...byId.values()] };
}

function mergeRemoteMap(existing, entry) {
  const assets = { ...(existing.assets ?? {}) };
  assets[FALLBACK_SRC] = entry;
  assets["/media/mithron/shell/mithron-wordmark.svg"] = entry;
  return { version: 1, updatedAt: new Date().toISOString(), assets };
}

async function main() {
  const sourcePath = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
  if (!sourcePath || !existsSync(sourcePath)) {
    console.error("Usage: node tools/upload-wordmark-to-supabase.mjs <source-png> [--restore]");
    process.exit(1);
  }

  loadProjectEnv();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  console.log(restoreMode ? "Uploading restored wordmark (no cutout)..." : "Processing wordmark (soft cutout, preserve green)...");
  const masterPng = await processNavWordmark(sourcePath);
  const sourceMeta = await sharp(masterPng).metadata();
  const widths = variantWidths.filter((width) => width <= (sourceMeta.width ?? width));
  const webpVariants = [];

  for (const width of widths) {
    const buffer = await sharp(masterPng)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: webpQuality, effort: 6, smartSubsample: true, alphaQuality: 100 })
      .toBuffer();
    const hash = hashBuffer(buffer, 8);
    const storagePath = `storefront/${BASE_NAME}-${width}w-${VERSION_TAG}.${hash}.webp`;
    const { error } = await supabase.storage.from(BUCKET).upload(storagePath, buffer, {
      cacheControl: "31536000",
      contentType: "image/webp",
      upsert: true
    });
    if (error) {
      throw new Error(`Upload failed for ${storagePath}: ${error.message}`);
    }
    const info = await sharp(buffer).metadata();
    webpVariants.push({
      width,
      height: info.height ?? width,
      format: "webp",
      src: buildPublicUrl(BUCKET, storagePath),
      storagePath,
      optimizedSizeKb: Number((buffer.byteLength / 1024).toFixed(2))
    });
    console.log(`Uploaded ${storagePath} (${info.width}x${info.height}, ${(buffer.byteLength / 1024).toFixed(1)} KB)`);
  }

  const blurDataUrl = await blurDataUrlFor(masterPng);
  const stats = await sharp(masterPng).stats();
  const dominant = stats.dominant;
  const dominantColor = `#${[dominant.r, dominant.g, dominant.b]
    .map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
    .join("")}`;
  const best = [...webpVariants].sort((a, b) => a.width - b.width).at(-1);

  const asset = {
    assetId: ASSET_ID,
    bucket: BUCKET,
    assetRole: "story",
    category: "storefront",
    generatedPromptId: "storefront.mithron-wordmark",
    status: "generated",
    fallbackSrc: FALLBACK_SRC,
    fallbackAlt: "Mithron",
    width: sourceMeta.width ?? best?.width ?? 0,
    height: sourceMeta.height ?? best?.height ?? 0,
    blurDataUrl,
    dominantColor,
    variants: { webp: webpVariants }
  };

  const remoteEntry = {
    assetId: ASSET_ID,
    bucket: BUCKET,
    primarySrc: best?.src ?? "",
    variants: { webp: webpVariants }
  };

  const existingSupabase = existsSync(supabaseManifestPath)
    ? JSON.parse(readFileSync(supabaseManifestPath, "utf8"))
    : { version: 1, assets: [] };
  const existingRemote = existsSync(remoteMapPath)
    ? JSON.parse(readFileSync(remoteMapPath, "utf8"))
    : { version: 1, assets: {} };

  writeFileSync(supabaseManifestPath, `${JSON.stringify(mergeSupabaseAssets(existingSupabase, asset), null, 2)}\n`, "utf8");
  writeFileSync(remoteMapPath, `${JSON.stringify(mergeRemoteMap(existingRemote, remoteEntry), null, 2)}\n`, "utf8");

  console.log(`\nMaster: ${sourceMeta.width}x${sourceMeta.height}`);
  console.log(`Primary: ${best?.src}`);
  console.log("Updated manifests.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
