#!/usr/bin/env node

import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = process.argv[2];
if (!source) {
  console.error("Usage: node tools/build-nav-wordmark.mjs <source-logo-png>");
  process.exit(1);
}

const shellDir = join(root, "public", "media", "mithron", "shell");
mkdirSync(shellDir, { recursive: true });
const croppedPath = join(shellDir, ".mithron-wordmark-crop.png");
const outPath = join(shellDir, "mithron-wordmark.png");

const meta = await sharp(source).metadata();
const cropHeight = Math.round((meta.height ?? 1) * 0.54);

await sharp(source)
  .extract({
    left: 0,
    top: 0,
    width: meta.width ?? 1,
    height: Math.min(cropHeight, meta.height ?? cropHeight)
  })
  .png()
  .toFile(croppedPath);

const result = spawnSync(process.execPath, [join(root, "tools", "process-mithron-wordmark.mjs"), croppedPath], {
  cwd: root,
  stdio: "inherit"
});

if (result.status !== 0) process.exit(result.status ?? 1);

const built = await sharp(outPath).metadata();
console.log(`Nav wordmark: ${outPath} (${built.width}x${built.height})`);
