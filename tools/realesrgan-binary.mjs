#!/usr/bin/env node

import { createWriteStream, existsSync, mkdirSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const binRoot = join(projectRoot, "tools", "realesrgan-bin");

/** v0.2.5.0 bundle includes exe + models/ (ncnn-vulkan repo zip does not). */
const RELEASE_URL =
  "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-windows.zip";

function findExecutable(dir) {
  if (!existsSync(dir)) return null;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = findExecutable(fullPath);
      if (nested) return nested;
      continue;
    }
    if (/realesrgan-ncnn-vulkan\.exe$/i.test(entry.name)) {
      return fullPath;
    }
  }
  return null;
}

async function downloadFile(url, destination) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download Real-ESRGAN binary (${response.status}): ${url}`);
  }
  mkdirSync(dirname(destination), { recursive: true });
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination));
}

function extractZipWindows(zipPath, destination) {
  mkdirSync(destination, { recursive: true });
  const result = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destination.replace(/'/g, "''")}' -Force`
    ],
    { stdio: "inherit", windowsHide: true }
  );
  if (result.status !== 0) {
    throw new Error(`Failed to extract Real-ESRGAN zip (exit ${result.status ?? "unknown"})`);
  }
}

export function getRealEsrganBinaryPath() {
  return findExecutable(binRoot);
}

export async function ensureRealEsrganBinary() {
  const existing = getRealEsrganBinaryPath();
  if (existing) {
    const modelsDir = join(dirname(existing), "models");
    if (existsSync(join(modelsDir, "realesrgan-x4plus.param"))) {
      console.log(`Real-ESRGAN binary ready: ${existing}`);
      return existing;
    }
    console.warn("Real-ESRGAN binary found but models missing; re-downloading bundle...");
  }

  const zipPath = join(binRoot, "realesrgan-ncnn-vulkan-windows.zip");
  console.log(`Downloading Real-ESRGAN ncnn-vulkan from ${RELEASE_URL} ...`);
  await downloadFile(RELEASE_URL, zipPath);
  console.log(`Extracting to ${binRoot} ...`);
  extractZipWindows(zipPath, binRoot);

  const binaryPath = getRealEsrganBinaryPath();
  if (!binaryPath) {
    throw new Error("Real-ESRGAN binary not found after extraction.");
  }
  console.log(`Real-ESRGAN binary installed: ${binaryPath}`);
  return binaryPath;
}
