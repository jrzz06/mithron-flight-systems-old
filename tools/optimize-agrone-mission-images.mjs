#!/usr/bin/env node

import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const publicRoot = join(projectRoot, "public");
const outputRoot = join(publicRoot, "optimized", "agrone-mission");

const targetWidths = [480, 768, 1024, 1280, 1600];
const AGRONE_WEBP_QUALITY = 96;

const targets = [
  {
    src: "/media/mithron/mission/agrone/agrone-drone-owner-registration.png",
    alt: "AGRONE drone owner registration"
  },
  {
    src: "/media/mithron/mission/agrone/agrone-pilot-registration.png",
    alt: "AGRONE pilot registration"
  },
  {
    src: "/media/mithron/mission/agrone/all-india-drone-farmer.png",
    alt: "All India farmer drone booking"
  },
  {
    src: "/media/mithron/mission/agrone/smart-farmer-register.png",
    alt: "Smart farmer registration"
  },
  {
    src: "/media/mithron/mission/agrone/agri-drone-loan.png",
    alt: "Agri drone loan and EMI check"
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

async function optimizeTarget(target) {
  const inputPath = join(publicRoot, target.src.replace(/^\//, ""));
  if (!existsSync(inputPath)) {
    throw new Error(`Missing agrone mission source: ${target.src}. Run: npm run assets:install-agrone`);
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

  const masterBuffer = await sharp(inputPath, { failOn: "none" }).rotate().png().toBuffer();
  const widths = targetWidths.filter((width) => width <= sourceWidth);
  if (sourceWidth > 0 && !widths.includes(sourceWidth)) {
    widths.push(sourceWidth);
  }

  const variants = { webp: [] };

  for (const width of widths.sort((left, right) => left - right)) {
    const buffer = await sharp(masterBuffer, { failOn: "none" })
      .resize({ width, fit: "inside", withoutEnlargement: true, kernel: "lanczos3" })
      .webp({ quality: AGRONE_WEBP_QUALITY, effort: 5, smartSubsample: false })
      .toBuffer();

    const outputPath = join(assetDir, `${width}.webp`);
    writeFileSync(outputPath, buffer);
    const outputMeta = await sharp(buffer).metadata();
    variants.webp.push({
      width: outputMeta.width ?? width,
      height: outputMeta.height ?? Math.round(width * (sourceHeight / sourceWidth)),
      format: "webp",
      src: toPublicPath(outputPath),
      storagePath: toPublicPath(outputPath).replace(/^\//, ""),
      optimizedSizeKb: formatKb(buffer.byteLength)
    });
  }

  return {
    assetId: `agrone-mission-${slug}`,
    bucket: "mithron-story",
    assetRole: "story",
    category: "agrone-mission",
    generatedPromptId: `local.agrone-mission.${slug}`,
    status: "generated",
    fallbackSrc: target.src,
    fallbackAlt: target.alt,
    width: sourceWidth,
    height: sourceHeight,
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
    console.log(`${asset.fallbackSrc}: ${asset.width}x${asset.height}, best webp ${bestWebp?.optimizedSizeKb ?? "n/a"} KB`);
  }

  writeFileSync(
    join(outputRoot, "manifest.json"),
    `${JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), assets }, null, 2)}\n`
  );
  console.log(`agrone mission optimization complete: ${assets.length} assets`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
