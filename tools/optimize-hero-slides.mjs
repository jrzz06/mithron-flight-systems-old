#!/usr/bin/env node

import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const publicRoot = join(projectRoot, "public");
const outputRoot = join(publicRoot, "optimized", "hero-slides");

const targetWidths = [480, 768, 1280, 1920, 2560, 3840];
const HERO_WEBP_QUALITY = 96;

const targets = [
  {
    src: "/assets/hero/hero-slide-01.webp",
    alt: "Mithron agriculture drone flying over glacial terrain at sunrise",
    slideId: "ag10-arrival"
  },
  {
    src: "/assets/hero/hero-slide-02.webp",
    alt: "Mithron caged drone operating over a night sports court",
    slideId: "mapping-flight"
  },
  {
    src: "/assets/hero/hero-slide-03.webp",
    alt: "Mithron medical delivery drone flying over a coastal horizon at twilight",
    slideId: "drone-ecosystem"
  },
  {
    src: "/assets/hero/hero-slide-04.webp",
    alt: "Mithron terrain-scanning hexacopter projecting a digital grid over coastal hills at golden hour",
    slideId: "surveillance-grid"
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
    .png({ compressionLevel: 0, adaptiveFiltering: false })
    .toBuffer();
}

async function optimizeTarget(target) {
  const inputPath = join(publicRoot, target.src.replace(/^\//, ""));
  if (!existsSync(inputPath)) {
    throw new Error(`Missing hero slide source: ${target.src}`);
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
        withoutEnlargement: true
      })
      .webp({
        quality: HERO_WEBP_QUALITY,
        effort: 6,
        smartSubsample: true
      })
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
    assetId: `hero-slide-${slug}`,
    bucket: "mithron-hero",
    assetRole: "hero",
    category: "hero",
    generatedPromptId: `local.hero-slide.${slug}`,
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
    const smallestWebp = asset.variants.webp[0];
    console.log(
      `${asset.fallbackSrc}: ${asset.width}x${asset.height}, variants ${smallestWebp?.width ?? "?"}-${bestWebp?.width ?? "?"}w, best webp ${bestWebp?.optimizedSizeKb ?? "n/a"} KB @ q${HERO_WEBP_QUALITY}`
    );
  }

  writeFileSync(
    join(outputRoot, "manifest.json"),
    `${JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), assets }, null, 2)}\n`
  );
  console.log(`hero slide optimization complete: ${assets.length} assets`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
