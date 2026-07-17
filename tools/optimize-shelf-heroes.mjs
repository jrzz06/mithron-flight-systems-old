#!/usr/bin/env node

import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const publicRoot = join(projectRoot, "public");
const outputRoot = join(publicRoot, "optimized", "shelf-heroes");

const targetWidths = [480, 768, 1024, 1536, 2048];
const SHELF_HERO_MASTER_WIDTH = 2048;
const SHELF_HERO_WEBP_QUALITY = 100;

const targets = [
  {
    src: "/media/mithron/showcase/drone_world_hero.png",
    alt: "Mithron drone fleet operating across a rugged mountain valley at golden hour"
  },
  {
    src: "/media/mithron/showcase/drone_care_hero.png",
    alt: "Mithron Drone Care complete kit with aircraft, controller, batteries, propellers, and service case"
  },
  {
    src: "/media/mithron/showcase/global_products_hero.png",
    alt: "Global Drone Connect industrial drone carrying a shipping container over a digital logistics hub at night"
  }
];

function toPublicPath(filePath) {
  return filePath.replace(publicRoot, "").replace(/\\/g, "/");
}

function formatKb(bytes) {
  return Number((bytes / 1024).toFixed(2));
}

function slugFromSource(src) {
  return basename(src, extname(src)).replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

async function dominantColorFor(buffer) {
  const { dominant } = await sharp(buffer, { failOn: "none" }).stats();
  const toHex = (value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
  return `#${toHex(dominant.r)}${toHex(dominant.g)}${toHex(dominant.b)}`;
}

async function blurDataUrlFor(buffer) {
  const preview = await sharp(buffer, { failOn: "none" })
    .resize(28, 28, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 34, effort: 4 })
    .toBuffer();
  return `data:image/webp;base64,${preview.toString("base64")}`;
}

async function buildMasterBuffer(inputPath) {
  return sharp(inputPath, { failOn: "none" })
    .rotate()
    .resize({
      width: SHELF_HERO_MASTER_WIDTH,
      fit: "inside",
      kernel: "lanczos3"
    })
    .png({ compressionLevel: 0, adaptiveFiltering: false })
    .toBuffer();
}

async function optimizeTarget(target) {
  const inputPath = join(publicRoot, target.src.replace(/^\//, ""));
  if (!existsSync(inputPath)) {
    throw new Error(`Missing shelf hero source: ${target.src}`);
  }

  const sourceStat = statSync(inputPath);
  const metadata = await sharp(inputPath, { failOn: "none" }).metadata();
  const sourceWidth = metadata.width ?? 0;
  const sourceHeight = metadata.height ?? 0;
  const slug = slugFromSource(target.src);
  const assetDir = join(outputRoot, slug);
  if (existsSync(assetDir)) {
    rmSync(assetDir, { recursive: true, force: true });
  }
  mkdirSync(assetDir, { recursive: true });

  const masterBuffer = await buildMasterBuffer(inputPath);
  const masterMeta = await sharp(masterBuffer).metadata();
  const masterWidth = masterMeta.width ?? sourceWidth;
  const masterHeight = masterMeta.height ?? sourceHeight;
  const widths = targetWidths.filter((width) => width <= masterWidth);
  if (masterWidth > 0 && !widths.includes(masterWidth)) {
    widths.push(masterWidth);
  }

  const variants = { webp: [] };

  for (const width of widths.sort((left, right) => left - right)) {
    const buffer = await sharp(masterBuffer, { failOn: "none" })
      .resize({
        width,
        fit: "inside",
        withoutEnlargement: true,
        kernel: "lanczos3"
      })
      .webp({ quality: SHELF_HERO_WEBP_QUALITY, effort: 5, smartSubsample: false })
      .toBuffer();

    const outputPath = join(assetDir, `${width}.webp`);
    writeFileSync(outputPath, buffer);
    const outputMeta = await sharp(buffer).metadata();

    variants.webp.push({
      width: outputMeta.width ?? width,
      height: outputMeta.height ?? Math.round(width * (masterHeight / masterWidth)),
      format: "webp",
      src: toPublicPath(outputPath),
      storagePath: toPublicPath(outputPath).replace(/^\//, ""),
      optimizedSizeKb: formatKb(buffer.byteLength)
    });
  }

  return {
    assetId: `shelf-hero-${slug}`,
    bucket: "mithron-interests",
    assetRole: "poster",
    category: "shelf-hero",
    generatedPromptId: `local.shelf-hero.${slug}`,
    status: "generated",
    fallbackSrc: target.src,
    fallbackAlt: target.alt,
    width: masterWidth,
    height: masterHeight,
    sourceSizeKb: formatKb(sourceStat.size),
    blurDataUrl: await blurDataUrlFor(masterBuffer),
    dominantColor: await dominantColorFor(masterBuffer),
    variants
  };
}

async function main() {
  mkdirSync(outputRoot, { recursive: true });
  const assets = [];

  for (const target of targets) {
    const asset = await optimizeTarget(target);
    assets.push(asset);
    const bestWebp = asset.variants.webp.at(-1);
    console.log(
      `${asset.fallbackSrc}: source ${asset.sourceSizeKb} KB -> native ${asset.width}x${asset.height}, best webp ${bestWebp?.optimizedSizeKb ?? "n/a"} KB`
    );
  }

  writeFileSync(
    join(outputRoot, "manifest.json"),
    `${JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), assets }, null, 2)}\n`
  );
  console.log(`shelf hero optimization complete: ${assets.length} assets`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
