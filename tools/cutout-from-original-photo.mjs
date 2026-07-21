#!/usr/bin/env node
/**
 * Extract cutout from ORIGINAL product photo (white studio bg) — no AI regeneration.
 * Preserves exact pose/product. Usage:
 *   node tools/cutout-from-original-photo.mjs --in <photo> --out <webp> [--size 1024]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  return {
    inPath: get("--in"),
    outPath: get("--out"),
    previewPath: get("--preview"),
    size: Number(get("--size") || 1024)
  };
}

function floodBackgroundMask(rgba, width, height, channels) {
  const visited = new Uint8Array(width * height);
  const isBg = new Uint8Array(width * height);
  const queue = [];

  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = y * width + x;
    if (visited[idx]) return;
    visited[idx] = 1;
    queue.push(idx);
  };

  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }

  const matchesBg = (r, g, b) => {
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    // white studio + soft drop shadow on product page photos
    if (sat < 35 && luma > 200) return true;
    if (sat < 20 && luma > 175 && luma < 210) return true;
    // Wix marketing panels: light blue geometric backgrounds
    if (b > r + 8 && b > g + 4 && luma > 150 && luma < 245 && sat > 8 && sat < 80) return true;
    return false;
  };

  while (queue.length) {
    const idx = queue.pop();
    const o = idx * channels;
    const r = rgba[o];
    const g = rgba[o + 1];
    const b = rgba[o + 2];
    if (!matchesBg(r, g, b)) continue;
    isBg[idx] = 1;
    const x = idx % width;
    const y = (idx - x) / width;
    push(x - 1, y);
    push(x + 1, y);
    push(x, y - 1);
    push(x, y + 1);
  }

  return isBg;
}

function defringeWhiteHalo(rgba, width, height, channels) {
  const out = Buffer.from(rgba);
  for (let i = 0; i < width * height; i++) {
    const o = i * channels;
    const a = out[o + 3];
    const r = out[o];
    const g = out[o + 1];
    const b = out[o + 2];
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (a > 0 && a < 200 && luma > 230) {
      out[o + 3] = Math.round(a * 0.25);
    } else if (a > 0 && a < 160 && luma > 215) {
      out[o + 3] = Math.round(a * 0.5);
    }
  }
  return out;
}

async function buildCutout(inputPath, size) {
  const input = readFileSync(inputPath);
  const metaIn = await sharp(input, { failOn: "none" }).metadata();
  // Wix hero shots often place product right-of decorative panel — crop left marketing strip
  let pipeline = sharp(input, { failOn: "none" });
  if ((metaIn.width ?? 0) > (metaIn.height ?? 0) * 1.4) {
    const cropLeft = Math.round((metaIn.width ?? 0) * 0.28);
    pipeline = pipeline.extract({
      left: cropLeft,
      top: 0,
      width: (metaIn.width ?? 0) - cropLeft,
      height: metaIn.height ?? 0
    });
  }

  const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const rgba = Buffer.from(data);
  const bgMask = floodBackgroundMask(rgba, width, height, channels);

  for (let i = 0; i < width * height; i++) {
    if (bgMask[i]) rgba[i * channels + 3] = 0;
  }

  const defringed = defringeWhiteHalo(rgba, width, height, channels);

  // Mild clarity boost on the actual photo pixels (not generative)
  const cutoutPng = await sharp(defringed, { raw: { width, height, channels } })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .sharpen({ sigma: 0.6, m1: 0.5, m2: 0.25 })
    .png()
    .toBuffer();

  return cutoutPng;
}

async function previewOnGray(pngBuffer, outPath) {
  await sharp(pngBuffer)
    .flatten({ background: { r: 128, g: 128, b: 128 } })
    .png()
    .toFile(outPath);
}

async function main() {
  const { inPath, outPath, previewPath, size } = parseArgs();
  if (!inPath || !outPath) {
    throw new Error("Usage: node tools/cutout-from-original-photo.mjs --in <photo> --out <webp> [--preview <png>]");
  }
  if (!existsSync(inPath)) throw new Error(`Input not found: ${inPath}`);

  const cutoutPng = await buildCutout(inPath, size);
  const webp = await sharp(cutoutPng).webp({ quality: 90, effort: 6, alphaQuality: 100 }).toBuffer();
  writeFileSync(outPath, webp);

  const preview = previewPath || outPath.replace(/\.webp$/i, "-preview-gray.png");
  await previewOnGray(cutoutPng, preview);

  const meta = await sharp(cutoutPng).metadata();
  console.log(
    JSON.stringify(
      {
        method: "original-photo-cutout",
        input: inPath,
        output: outPath,
        previewGray: preview,
        width: meta.width,
        height: meta.height,
        webpBytes: webp.byteLength
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
