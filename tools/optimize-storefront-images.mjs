#!/usr/bin/env node

import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const publicRoot = join(projectRoot, "public");
const outputPublicRoot = "public/optimized/storefront";
const outputRoot = join(projectRoot, outputPublicRoot);

const targetWidths = {
  mission: [480, 768, 1280, 1600],
  background: [480, 768, 1280, 1600],
  product: [480, 768, 1024, 1280]
};

const qualityByRole = {
  mission: 96,
  background: 96,
  product: 96
};

const targets = [
  {
    role: "mission",
    assetRole: "story",
    bucket: "mithron-story",
    category: "mission",
    src: "/media/mithron/dynamic-scroll/agriculture-flight.webp",
    alt: "Mithron agriculture drone over field rows"
  },
  {
    role: "mission",
    assetRole: "story",
    bucket: "mithron-story",
    category: "mission",
    src: "/media/mithron/dynamic-scroll/night-surveillance.webp",
    alt: "Mithron surveillance mission media for city operations"
  },
  {
    role: "mission",
    assetRole: "story",
    bucket: "mithron-story",
    category: "mission",
    src: "/media/mithron/dynamic-scroll/global-mission.webp",
    alt: "Mithron drone mission over city and field context"
  },
  {
    role: "mission",
    assetRole: "story",
    bucket: "mithron-story",
    category: "mission",
    src: "/media/mithron/mission/precision-spray.webp",
    alt: "Agriculture spraying mission over cultivated field rows"
  },
  {
    role: "mission",
    assetRole: "story",
    bucket: "mithron-story",
    category: "mission",
    src: "/media/mithron/mission/crop-health.webp",
    alt: "Agriculture drone crop health monitoring mission"
  },
  {
    role: "mission",
    assetRole: "story",
    bucket: "mithron-story",
    category: "mission",
    src: "/media/mithron/mission/mission-planning.webp",
    alt: "Drone mission planning route over mixed terrain"
  },
  {
    role: "mission",
    assetRole: "story",
    bucket: "mithron-story",
    category: "mission",
    src: "/media/mithron/mission/terrain-radar.webp",
    alt: "Drone mapping terrain and route intelligence view"
  },
  {
    role: "mission",
    assetRole: "poster",
    bucket: "mithron-interests",
    category: "mission",
    src: "/media/mithron/categories/industrial-inspection.webp",
    alt: "Industrial inspection drone mission environment"
  },
  {
    role: "mission",
    assetRole: "poster",
    bucket: "mithron-interests",
    category: "mission",
    src: "/media/mithron/categories/defense-security.webp",
    alt: "Security drone mission environment"
  },
  {
    role: "mission",
    assetRole: "poster",
    bucket: "mithron-interests",
    category: "mission",
    src: "/media/mithron/categories/surveillance.webp",
    alt: "Surveillance drone city operations mission"
  },
  {
    role: "background",
    assetRole: "poster",
    bucket: "mithron-story",
    category: "stock",
    src: "/media/mithron/stock/pexels-drone-mountain-landscape.webp",
    alt: "Stock photo of a drone flying above a mountain landscape"
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

function assetIdFromTarget(target) {
  return `storefront-${target.category}-${slugFromSource(target.src)}`;
}

async function dominantColorFor(inputPath) {
  const { dominant } = await sharp(inputPath, { failOn: "none" }).stats();
  const toHex = (value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
  return `#${toHex(dominant.r)}${toHex(dominant.g)}${toHex(dominant.b)}`;
}

async function blurDataUrlFor(inputPath) {
  const buffer = await sharp(inputPath, { failOn: "none" })
    .resize(28, 28, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 34, effort: 4 })
    .toBuffer();
  return `data:image/webp;base64,${buffer.toString("base64")}`;
}

async function optimizeTarget(target) {
  const inputPath = join(publicRoot, target.src.replace(/^\//, ""));
  if (!existsSync(inputPath)) {
    throw new Error(`Missing storefront image source: ${target.src}`);
  }

  const sourceStat = statSync(inputPath);
  const metadata = await sharp(inputPath, { failOn: "none" }).metadata();
  const sourceWidth = metadata.width ?? 0;
  const sourceHeight = metadata.height ?? 0;
  const widths = targetWidths[target.role].filter((width) => width <= sourceWidth);
  if (sourceWidth > 0 && !widths.includes(sourceWidth)) {
    widths.push(sourceWidth);
  }

  const slug = slugFromSource(target.src);
  const assetDir = join(outputRoot, target.category, slug);
  mkdirSync(assetDir, { recursive: true });

  const variants = {
    webp: []
  };

  for (const width of widths.sort((left, right) => left - right)) {
    const outputPath = join(assetDir, `${width}.webp`);
    const quality = target.quality ?? qualityByRole[target.role];
    const buffer = await sharp(inputPath, { failOn: "none" })
      .rotate()
      .resize({ width, fit: "inside", withoutEnlargement: true })
      .webp({ quality, effort: 6, smartSubsample: true })
      .toBuffer();

    if (buffer.byteLength >= sourceStat.size && width >= sourceWidth) {
      continue;
    }

    writeFileSync(outputPath, buffer);
    const outputMetadata = await sharp(buffer).metadata();
    variants.webp.push({
      width: outputMetadata.width ?? width,
      height: outputMetadata.height ?? Math.round(width * (sourceHeight / sourceWidth)),
      format: "webp",
      src: toPublicPath(outputPath),
      storagePath: toPublicPath(outputPath).replace(/^\//, ""),
      optimizedSizeKb: formatKb(buffer.byteLength)
    });
  }

  if (!variants.webp.length) {
    return null;
  }

  return {
    assetId: assetIdFromTarget(target),
    bucket: target.bucket,
    assetRole: target.assetRole,
    category: target.category,
    generatedPromptId: `local.storefront.${target.category}.${slug}`,
    status: "generated",
    fallbackSrc: target.src,
    fallbackAlt: target.alt,
    width: sourceWidth,
    height: sourceHeight,
    sourceSizeKb: formatKb(sourceStat.size),
    blurDataUrl: await blurDataUrlFor(inputPath),
    dominantColor: await dominantColorFor(inputPath),
    variants
  };
}

async function main() {
  if (existsSync(outputRoot)) {
    rmSync(outputRoot, { recursive: true, force: true });
  }
  mkdirSync(outputRoot, { recursive: true });
  const assets = [];

  for (const target of targets) {
    const asset = await optimizeTarget(target);
    if (!asset) {
      console.log(`${target.src}: skipped; no generated variant was smaller than source`);
      continue;
    }
    assets.push(asset);
    const bestWebp = asset.variants.webp.at(-1);
    console.log(`${asset.fallbackSrc}: source ${asset.sourceSizeKb} KB, webp ${bestWebp?.optimizedSizeKb ?? "n/a"} KB`);
  }

  writeFileSync(
    join(outputRoot, "manifest.json"),
    `${JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), assets }, null, 2)}\n`
  );
  console.log(`storefront image optimization complete: ${assets.length} assets`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
