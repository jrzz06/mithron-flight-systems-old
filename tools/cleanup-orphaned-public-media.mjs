#!/usr/bin/env node

import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canonicalStorefrontSrc,
  dedupeInventory,
  STOREFRONT_IMAGE_INVENTORY
} from "./storefront-image-inventory.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const publicRoot = join(projectRoot, "public");
const supabaseManifestPath = join(projectRoot, "data", "mithron-supabase-assets.generated.json");

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const dryRun = !apply;

const ORPHAN_DIRECTORIES = [
  "media/mithron/source",
  "media/mithron/stock",
  "media/mithron/agri-redesign",
  "media/mithron/banners",
  "media/mithron/carousel",
  "media/mithron/categories",
  "optimized"
];

const LEGACY_MISSION_FILES = [
  "media/mithron/mission/agrone/drone-owner-registration.png",
  "media/mithron/mission/agrone/pilot-registration.png",
  "media/mithron/mission/agrone/farmer-drone-booking.png",
  "media/mithron/mission/agrone/smart-farmer-registration.png",
  "media/mithron/mission/agrone/agri-drone-loan-emi.png",
  "media/mithron/mission/city/traffic-analytics.png",
  "media/mithron/mission/city/smart-city-monitoring.png",
  "media/mithron/mission/city/emergency-response.png",
  "media/mithron/mission/city/infrastructure-inspection.png",
  "media/mithron/mission/city/crowd-monitoring.png"
];

const DEV_ARTIFACTS = [
  "media/mithron/shell/.mithron-wordmark-crop.png",
  "media/mithron/shell/.v6-check.png",
  "media/mithron/shell/.v6-check.webp"
];

function loadGeneratedFallbacks() {
  if (!existsSync(supabaseManifestPath)) return new Set();
  const manifest = JSON.parse(readFileSync(supabaseManifestPath, "utf8"));
  const generated = new Set();
  for (const asset of manifest.assets ?? []) {
    if (asset.status === "generated" && asset.fallbackSrc?.startsWith("/")) {
      generated.add(asset.fallbackSrc);
      generated.add(canonicalStorefrontSrc(asset.fallbackSrc));
    }
  }
  return generated;
}

function localPathForSrc(src) {
  const candidates = [
    join(publicRoot, src.replace(/^\//, "")),
    join(publicRoot, canonicalStorefrontSrc(src).replace(/^\//, "")),
    join(publicRoot, canonicalStorefrontSrc(src).replace(/^\//, "").replace(/\.webp$/i, ".png")),
    join(publicRoot, src.replace(/^\//, "").replace(/\.webp$/i, ".png"))
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function shouldKeepPath(absPath) {
  const normalized = absPath.toLowerCase();
  if (normalized.includes(`${join("public", "draco").toLowerCase()}`)) return true;
  if (normalized.endsWith("favicon.svg")) return true;
  return false;
}

function deletePath(target, bucket, results) {
  if (!existsSync(target)) return;
  if (shouldKeepPath(target)) {
    results.skipped.push({ path: target, reason: "protected" });
    return;
  }
  results.planned.push({ path: target, bucket });
  if (dryRun) return;
  rmSync(target, { recursive: true, force: true });
  results.deleted.push({ path: target, bucket });
}

function deleteSidecars(masterPath, results) {
  for (const suffix of [".bak", ".enhanced.json"]) {
    deletePath(`${masterPath}${suffix}`, "sidecar", results);
  }
}

function inventoryMastersToDelete(generatedFallbacks) {
  const inventory = dedupeInventory(STOREFRONT_IMAGE_INVENTORY);
  const paths = [];
  for (const item of inventory) {
    const canonical = canonicalStorefrontSrc(item.src);
    if (!generatedFallbacks.has(item.src) && !generatedFallbacks.has(canonical)) continue;
    const local = localPathForSrc(item.src);
    if (local) paths.push(local);
  }
  return paths;
}

function main() {
  const generatedFallbacks = loadGeneratedFallbacks();
  const results = { planned: [], deleted: [], skipped: [] };

  for (const rel of ORPHAN_DIRECTORIES) {
    deletePath(join(publicRoot, rel), "orphan-directory", results);
  }

  for (const rel of [...LEGACY_MISSION_FILES, ...DEV_ARTIFACTS]) {
    deletePath(join(publicRoot, rel), "legacy-file", results);
  }

  for (const master of inventoryMastersToDelete(generatedFallbacks)) {
    deletePath(master, "inventory-master", results);
    deleteSidecars(master, results);
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        apply,
        generatedFallbacks: generatedFallbacks.size,
        planned: results.planned.length,
        deleted: results.deleted.length,
        skipped: results.skipped.length,
        samples: results.planned.slice(0, 15).map((item) => item.path.replace(publicRoot, ""))
      },
      null,
      2
    )
  );

  if (dryRun) {
    console.log("\nDry run only. Re-run with --apply to delete.");
  }
}

main();
