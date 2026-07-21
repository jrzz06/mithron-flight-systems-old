#!/usr/bin/env node
/**
 * Convert AI showcase PNG → clean 1024×1024 transparent WebP cutout.
 * Usage: node tools/cutout-from-showcase.mjs --in <png> --out <webp> [--cap-bytes <n>]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
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
    capBytes: Number(get("--cap-bytes") || 0) || undefined,
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
    // checkerboard + white studio void
    return sat < 28 && luma > 155;
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
      out[o + 3] = Math.round(a * 0.3);
    } else if (a > 0 && a < 160 && luma > 215) {
      out[o + 3] = Math.round(a * 0.55);
    }
  }
  return out;
}

async function buildCutout(inputPath, size) {
  const input = readFileSync(inputPath);
  const { data, info } = await sharp(input, { failOn: "none" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const rgba = Buffer.from(data);
  const bgMask = floodBackgroundMask(rgba, width, height, channels);

  for (let i = 0; i < width * height; i++) {
    if (bgMask[i]) rgba[i * channels + 3] = 0;
  }

  const defringed = defringeWhiteHalo(rgba, width, height, channels);

  const cutoutPng = await sharp(defringed, {
    raw: { width, height, channels }
  })
    .resize(size, size, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toBuffer();

  return { cutoutPng, width: size, height: size };
}

async function encodeWebp(pngBuffer, capBytes) {
  const qualities = [92, 90, 88, 86, 84, 82, 80, 78, 75, 72, 68, 60];
  let best = null;
  for (const q of qualities) {
    const webp = await sharp(pngBuffer).webp({ quality: q, effort: 6, alphaQuality: 100 }).toBuffer();
    if (!best || webp.byteLength < best.buffer.byteLength) best = { buffer: webp, quality: q };
    if (!capBytes || webp.byteLength <= capBytes) {
      return { buffer: webp, quality: q, capped: Boolean(capBytes) };
    }
  }
  return { buffer: best.buffer, quality: best.quality, capped: false };
}

async function previewOnGray(pngOrWebpBuffer, outPath) {
  const gray = { r: 128, g: 128, b: 128 };
  const png = await sharp(pngOrWebpBuffer, { failOn: "none" })
    .flatten({ background: gray })
    .png()
    .toBuffer();
  writeFileSync(outPath, png);
}

async function main() {
  const { inPath, outPath, capBytes, size } = parseArgs();
  if (!inPath || !outPath) {
    throw new Error("Usage: node tools/cutout-from-showcase.mjs --in <png> --out <webp> [--cap-bytes <n>]");
  }
  if (!existsSync(inPath)) throw new Error(`Input not found: ${inPath}`);

  const { cutoutPng, width, height } = await buildCutout(inPath, size);
  const { buffer: webp, quality } = await encodeWebp(cutoutPng, capBytes);

  writeFileSync(outPath, webp);

  const previewPath = outPath.replace(/\.webp$/i, "-preview-gray.png");
  await previewOnGray(cutoutPng, previewPath);

  console.log(
    JSON.stringify(
      {
        input: inPath,
        output: outPath,
        previewGray: previewPath,
        width,
        height,
        webpBytes: webp.byteLength,
        webpQuality: quality,
        capBytes: capBytes ?? null
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
