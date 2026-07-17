#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import pathAliases from "../config/storefront-path-aliases.json" with { type: "json" };
import { ensureAgroneSourceImages } from "../lib/dev/ensure-agrone-assets.mjs";
import { ensureCityMissionSourceImages } from "../lib/dev/ensure-city-mission-assets.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const publicRoot = join(projectRoot, "public");
const supabaseManifestPath = join(projectRoot, "data", "mithron-supabase-assets.generated.json");
const remoteMapPath = join(projectRoot, "data", "mithron-storefront-remote-map.generated.json");

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const onlyArg = process.argv.find((arg) => arg.startsWith("--only="));
const onlySrcs = onlyArg
  ? onlyArg
      .split("=")
      .slice(1)
      .join("=")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  : [];
const versionTagArg = process.argv.find((arg) => arg.startsWith("--version-tag="));
const versionTag = versionTagArg ? versionTagArg.split("=").slice(1).join("=") : "local-v2";

const variantWidths = [2560, 1920, 1280, 768, 480];
const webpQuality = 96;
const cacheControl = "31536000";

const missionMasters = [
  { src: "/media/mithron/mission/agrone/agrone-drone-owner-registration.png", alt: "AGRONE drone owner registration" },
  { src: "/media/mithron/mission/agrone/agrone-pilot-registration.png", alt: "AGRONE pilot registration" },
  { src: "/media/mithron/mission/agrone/all-india-drone-farmer.png", alt: "All India drone farmer" },
  { src: "/media/mithron/mission/agrone/smart-farmer-register.png", alt: "Smart farmer register" },
  { src: "/media/mithron/mission/agrone/agri-drone-loan.png", alt: "Agri drone loan" },
  { src: "/media/mithron/mission/city/dronelancer-model.png", alt: "Dronelancer model" },
  { src: "/media/mithron/mission/city/city-drone-rental-services-app.png", alt: "City drone rental app" },
  { src: "/media/mithron/mission/city/drone-franchisecare-center.png", alt: "FranchiseCare center" },
  { src: "/media/mithron/mission/city/drone-technician-aggregation.png", alt: "Technician aggregation" },
  { src: "/media/mithron/mission/city/all-drone-acadamic.png", alt: "All drone academic" }
];

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

function localPathForSrc(src) {
  return join(publicRoot, src.replace(/^\//, ""));
}

function buildPublicUrl(bucket, storagePath) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/g, "") ?? "";
  return `${base}/storage/v1/object/public/${bucket}/${storagePath}`;
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

async function uploadMissionMaster(supabase, item) {
  const masterPath = localPathForSrc(item.src);
  if (!existsSync(masterPath)) {
    return { status: "missing", src: item.src, masterPath };
  }

  const bucket = "mithron-story";
  const baseName = slugFromSrc(item.src);
  const sourceMeta = await sharp(masterPath, { failOn: "none" }).metadata();
  const widths = variantWidths.filter((width) => width <= (sourceMeta.width ?? width));
  const webpVariants = [];

  for (const width of widths) {
    const buffer = await sharp(masterPath, { failOn: "none" })
      .rotate()
      .resize({ width, fit: "inside", withoutEnlargement: true, kernel: "lanczos3" })
      .webp({ quality: webpQuality, effort: 5, smartSubsample: false })
      .toBuffer();
    const hash = hashBuffer(buffer, 8);
    const storagePath = `storefront/${baseName}-${width}w-${versionTag}.${hash}.webp`;

    if (!dryRun && supabase) {
      await withRetry(`upload ${storagePath}`, async () => {
        const { error } = await supabase.storage.from(bucket).upload(storagePath, buffer, {
          cacheControl,
          contentType: "image/webp",
          upsert: true
        });
        if (error) throw new Error(`Upload failed for ${storagePath}: ${error.message}`);
      });
      await sleep(120);
    }

    const info = await sharp(buffer).metadata();
    webpVariants.push({
      width: info.width ?? width,
      height: info.height ?? width,
      format: "webp",
      src: buildPublicUrl(bucket, storagePath),
      storagePath,
      optimizedSizeKb: Number((buffer.byteLength / 1024).toFixed(2))
    });
  }

  const masterBuffer = await sharp(masterPath, { failOn: "none" }).toBuffer();
  const blurDataUrl = await blurDataUrlFor(masterBuffer);
  const stats = await sharp(masterBuffer).stats();
  const dominant = stats.dominant;
  const dominantColor = `#${[dominant.r, dominant.g, dominant.b]
    .map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
    .join("")}`;
  const best = [...webpVariants].sort((left, right) => left.width - right.width).at(-1);

  return {
    status: "uploaded",
    src: item.src,
    bucket,
    assetId: assetIdFromSrc(item.src),
    alt: item.alt,
    width: sourceMeta.width ?? best?.width ?? 0,
    height: sourceMeta.height ?? best?.height ?? 0,
    blurDataUrl,
    dominantColor,
    variants: { webp: webpVariants },
    primarySrc: best?.src ?? null
  };
}

function mergeManifestAssets(existingAssets, uploadedAssets) {
  const byAssetId = new Map(existingAssets.map((asset) => [asset.assetId, asset]));

  for (const uploaded of uploadedAssets) {
    if (uploaded.status !== "uploaded") continue;
    byAssetId.set(uploaded.assetId, {
      assetId: uploaded.assetId,
      bucket: uploaded.bucket,
      assetRole: "story",
      category: "storefront",
      generatedPromptId: `storefront.${slugFromSrc(uploaded.src)}`,
      status: "generated",
      fallbackSrc: uploaded.src,
      fallbackAlt: uploaded.alt,
      width: uploaded.width,
      height: uploaded.height,
      blurDataUrl: uploaded.blurDataUrl,
      dominantColor: uploaded.dominantColor,
      variants: uploaded.variants
    });
  }

  return [...byAssetId.values()];
}

function mergeRemoteMap(existingMap, uploadedAssets) {
  const assets = { ...(existingMap.assets ?? {}) };
  for (const uploaded of uploadedAssets) {
    if (uploaded.status !== "uploaded" || !uploaded.primarySrc) continue;
    assets[uploaded.src] = {
      assetId: uploaded.assetId,
      bucket: uploaded.bucket,
      primarySrc: uploaded.primarySrc,
      variants: uploaded.variants
    };
  }

  for (const [alias, canonical] of Object.entries(pathAliases)) {
    if (assets[canonical] && !assets[alias]) {
      assets[alias] = assets[canonical];
    }
  }

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    assets
  };
}

async function main() {
  loadProjectEnv();

  const selectedMasters = onlySrcs.length
    ? missionMasters.filter((item) => onlySrcs.includes(item.src))
    : missionMasters;

  if (onlySrcs.length && selectedMasters.length !== onlySrcs.length) {
    const missing = onlySrcs.filter((src) => !selectedMasters.some((item) => item.src === src));
    throw new Error(`Unknown mission master path(s): ${missing.join(", ")}`);
  }

  if (!onlySrcs.length) {
    const agroneInstalled = ensureAgroneSourceImages();
    const cityInstalled = ensureCityMissionSourceImages();
    console.log(`mission source install: agrone=${agroneInstalled}, city=${cityInstalled}`);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = dryRun ? null : createClient(url, serviceRoleKey, { auth: { persistSession: false } });

  if (!dryRun && (!url || !serviceRoleKey)) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for upload.");
  }

  const uploaded = [];
  for (const item of selectedMasters) {
    const result = await uploadMissionMaster(supabase, item);
    uploaded.push(result);
    if (result.status === "uploaded") {
      console.log(`uploaded ${item.src} -> ${result.primarySrc}`);
    } else {
      console.warn(`skip ${item.src}: ${result.status}`);
    }
  }

  const existingManifest = existsSync(supabaseManifestPath)
    ? JSON.parse(readFileSync(supabaseManifestPath, "utf8"))
    : { version: 1, assets: [] };
  const existingRemoteMap = existsSync(remoteMapPath)
    ? JSON.parse(readFileSync(remoteMapPath, "utf8"))
    : { version: 1, assets: {} };

  const mergedAssets = mergeManifestAssets(existingManifest.assets ?? [], uploaded);
  const remoteMap = mergeRemoteMap(existingRemoteMap, uploaded);

  if (!dryRun) {
    writeFileSync(
      supabaseManifestPath,
      `${JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), assets: mergedAssets }, null, 2)}\n`
    );
    writeFileSync(remoteMapPath, `${JSON.stringify(remoteMap, null, 2)}\n`);
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        uploaded: uploaded.filter((item) => item.status === "uploaded").length,
        missing: uploaded.filter((item) => item.status === "missing").length,
        versionTag
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
