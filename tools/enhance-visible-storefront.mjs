#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureRealEsrganBinary } from "./realesrgan-binary.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const publicRoot = join(projectRoot, "public");

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const force = args.has("--force");
const onlyArg = process.argv.find((arg) => arg.startsWith("--only="));
const onlySrc = onlyArg ? onlyArg.split("=").slice(1).join("=") : null;
const skipOptimize = args.has("--skip-optimize");
const skipEnhance = args.has("--skip-enhance");

const cityFilenameByDest = {
  "all-drone-acadamic.png":
    "c__Users_Administrator_AppData_Roaming_Cursor_User_workspaceStorage_883dab95b7a4a2b2fab0ca7f2b0a5a39_images_All_Drone_Acadamic-e743ea91-99d4-4d32-aaba-6226ce80b1dc.png",
  "city-drone-rental-services-app.png":
    "c__Users_Administrator_AppData_Roaming_Cursor_User_workspaceStorage_883dab95b7a4a2b2fab0ca7f2b0a5a39_images_CITY_DRONE_RENTAL_SERVICES_APP-ff6abdf6-eae2-40a0-85c7-ca8662ee0855.png",
  "dronelancer-model.png":
    "c__Users_Administrator_AppData_Roaming_Cursor_User_workspaceStorage_883dab95b7a4a2b2fab0ca7f2b0a5a39_images_DRONELANCER_MODEL-8cd2bc63-3134-4303-ae2a-29b76ebb9eff.png",
  "drone-technician-aggregation.png":
    "c__Users_Administrator_AppData_Roaming_Cursor_User_workspaceStorage_883dab95b7a4a2b2fab0ca7f2b0a5a39_images_DRONE_TECHNICIAN_AGGREGATION-841abbc5-53f5-49b0-8fc8-e6b1bcf9e6e2.png",
  "drone-franchisecare-center.png":
    "c__Users_Administrator_AppData_Roaming_Cursor_User_workspaceStorage_883dab95b7a4a2b2fab0ca7f2b0a5a39_images_DRONE_FRANCHISECARE_CENTER-3d4638c0-8876-40f5-b47a-d119b1be0077.png"
};

/** 26 visible storefront master paths from the enhancement plan inventory. */
const visibleMasters = [
  { src: "/assets/hero/hero-slide-01.webp", maxEdge: 3840, group: "hero" },
  { src: "/assets/hero/hero-slide-02.webp", maxEdge: 3840, group: "hero" },
  { src: "/assets/hero/hero-slide-03.webp", maxEdge: 3840, group: "hero" },
  { src: "/assets/hero/hero-slide-04.webp", maxEdge: 3840, group: "hero" },
  { src: "/media/mithron/showcase/drone_world_hero.png", maxEdge: 2560, group: "shelf" },
  { src: "/media/mithron/showcase/drone_care_hero.png", maxEdge: 2560, group: "shelf" },
  { src: "/media/mithron/showcase/global_products_hero.png", maxEdge: 2560, group: "shelf" },
  { src: "/media/mithron/mission/agrone/agrone-drone-owner-registration.png", maxEdge: 2560, group: "mission-agri" },
  { src: "/media/mithron/mission/agrone/agrone-pilot-registration.png", maxEdge: 2560, group: "mission-agri" },
  { src: "/media/mithron/mission/agrone/all-india-drone-farmer.png", maxEdge: 2560, group: "mission-agri" },
  { src: "/media/mithron/mission/agrone/smart-farmer-register.png", maxEdge: 2560, group: "mission-agri" },
  { src: "/media/mithron/mission/agrone/agri-drone-loan.png", maxEdge: 2560, group: "mission-agri" },
  { src: "/media/mithron/mission/city/dronelancer-model.png", maxEdge: 2560, group: "mission-city" },
  { src: "/media/mithron/mission/city/city-drone-rental-services-app.png", maxEdge: 2560, group: "mission-city" },
  { src: "/media/mithron/mission/city/drone-franchisecare-center.png", maxEdge: 2560, group: "mission-city" },
  { src: "/media/mithron/mission/city/drone-technician-aggregation.png", maxEdge: 2560, group: "mission-city" },
  { src: "/media/mithron/mission/city/all-drone-acadamic.png", maxEdge: 2560, group: "mission-city" },
  { src: "/media/mithron/catalog/agri-drone-category.png", maxEdge: 2560, group: "catalog" },
  { src: "/media/mithron/catalog/video-drone-category.png", maxEdge: 2560, group: "catalog" },
  { src: "/media/mithron/catalog/creative-drone-category.png", maxEdge: 2560, group: "catalog" },
  { src: "/media/mithron/catalog/mithron-drone-category.png", maxEdge: 2560, group: "catalog" },
  { src: "/media/mithron/catalog/survey-drone-category.png", maxEdge: 2560, group: "catalog" },
  { src: "/media/mithron/catalog/surveillance-drone-category.png", maxEdge: 2560, group: "catalog" },
  { src: "/media/mithron/catalog/global-products-category.png", maxEdge: 2560, group: "catalog" },
  { src: "/media/mithron/interests/components.webp", maxEdge: 1600, group: "nav" }
];

function isPathInsideBase(resolvedPath, baseDir) {
  const normalizedBase = resolve(baseDir);
  const normalizedPath = resolve(resolvedPath);
  return normalizedPath === normalizedBase || normalizedPath.startsWith(`${normalizedBase}${sep}`);
}

function devSearchRoots() {
  const userProfile = process.env.USERPROFILE ?? process.env.HOME ?? "";
  return [
    join(userProfile, ".cursor", "projects", "d-mithron", "assets"),
    join(
      userProfile,
      "AppData",
      "Roaming",
      "Cursor",
      "User",
      "workspaceStorage",
      "883dab95b7a4a2b2fab0ca7f2b0a5a39",
      "images"
    )
  ];
}

function resolveCityMissionPath(filename) {
  if (!(filename in cityFilenameByDest)) return undefined;
  const publicBase = resolve(join(publicRoot, "media", "mithron", "mission", "city"));
  const localPublicPath = resolve(join(publicBase, filename));
  if (isPathInsideBase(localPublicPath, publicBase) && existsSync(localPublicPath)) {
    return localPublicPath;
  }
  const sourceName = cityFilenameByDest[filename];
  for (const root of devSearchRoots()) {
    const resolvedRoot = resolve(root);
    const candidate = resolve(join(resolvedRoot, sourceName));
    if (!isPathInsideBase(candidate, resolvedRoot)) continue;
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function resolveVisiblePath(src) {
  if (src.startsWith("/media/mithron/mission/city/")) {
    const filename = src.split("/").pop();
    const resolved = resolveCityMissionPath(filename);
    if (resolved) return resolved;
  }
  const localPath = join(publicRoot, src.replace(/^\//, ""));
  if (existsSync(localPath)) return localPath;
  return undefined;
}

function buildManifestItems() {
  const selected = onlySrc ? visibleMasters.filter((item) => item.src === onlySrc) : visibleMasters;
  return selected.map((item) => ({
    ...item,
    resolvedPath: resolveVisiblePath(item.src)
  }));
}

function runCommand(command, commandArgs, label, options = {}) {
  console.log(`\n> ${label}: ${command} ${commandArgs.join(" ")}`);
  const result = spawnSync(command, commandArgs, {
    cwd: projectRoot,
    stdio: "inherit",
    shell: options.shell ?? false,
    windowsHide: true
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}`);
  }
}

function detectPython() {
  for (const candidate of ["python", "python3", "py"]) {
    const probe = spawnSync(candidate, ["--version"], { shell: false, windowsHide: true });
    if (probe.status === 0) return candidate;
  }
  return null;
}

function restoreAllFromBackups(manifestItems) {
  let restored = 0;
  for (const item of manifestItems) {
    if (!item.resolvedPath) continue;
    const sourcePath = item.resolvedPath;
    const actualBackup = sourcePath.replace(/(\.[a-z0-9]+)$/i, "$1.bak");
    if (!existsSync(actualBackup)) continue;
    if (dryRun) {
      console.log(`[dry-run] would restore ${item.src} from backup`);
      continue;
    }
    copyFileSync(actualBackup, sourcePath);
    const markerPath = `${sourcePath}.enhanced.json`;
    if (existsSync(markerPath)) rmSync(markerPath);
    restored += 1;
    console.log(`restored ${item.src} from backup`);
  }
  console.log(`restored ${restored} source master(s) from .bak`);
}

function wipeOptimizedVariantDirs() {
  const optimizedRoot = join(publicRoot, "optimized");
  const buckets = ["hero-slides", "shelf-heroes", "agrone-mission", "catalog-showcases", "storefront"];
  for (const bucket of buckets) {
    const bucketDir = join(optimizedRoot, bucket);
    if (!existsSync(bucketDir)) continue;
    for (const entry of readdirSync(bucketDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dirPath = join(bucketDir, entry.name);
      if (dryRun) {
        console.log(`[dry-run] would remove optimized dir ${dirPath}`);
        continue;
      }
      rmSync(dirPath, { recursive: true, force: true });
      console.log(`removed optimized dir ${entry.name} (${bucket})`);
    }
  }
}

function runValidation(manifestPath) {
  const python = detectPython();
  if (!python) {
    throw new Error("Python not found for validation.");
  }
  const reportPath = join(projectRoot, "tools", ".enhance-visible-validation.json");
  const commandArgs = [
    join(projectRoot, "tools", "validate-enhanced-images.py"),
    "--manifest",
    manifestPath,
    "--output",
    reportPath
  ];
  runCommand(python, commandArgs, "validate-enhanced-images");
}

function syncCityMastersIntoPublic(manifestItems) {
  const cityDir = join(publicRoot, "media", "mithron", "mission", "city");
  mkdirSync(cityDir, { recursive: true });
  for (const item of manifestItems) {
    if (!item.src.startsWith("/media/mithron/mission/city/")) continue;
    if (!item.resolvedPath || item.resolvedPath.startsWith(cityDir)) continue;
    const filename = item.src.split("/").pop();
    const destPath = join(cityDir, filename);
    if (dryRun) {
      console.log(`[dry-run] would sync city master ${filename} -> public`);
      item.resolvedPath = destPath;
      continue;
    }
    copyFileSync(item.resolvedPath, destPath);
    item.resolvedPath = destPath;
    console.log(`synced city master ${filename} into public`);
  }
}

async function runEnhancement(manifestPath, binaryPath) {
  const python = detectPython();
  if (!python) {
    throw new Error("Python not found. Install Python 3 and run: pip install -r tools/requirements-enhance.txt");
  }
  const commandArgs = [
    join(projectRoot, "tools", "enhance-source-batch.py"),
    "--manifest",
    manifestPath,
    "--project-root",
    projectRoot,
    "--binary-path",
    binaryPath
  ];
  if (dryRun) commandArgs.push("--dry-run");
  if (force) commandArgs.push("--force");
  if (onlySrc) commandArgs.push("--only", onlySrc);
  runCommand(python, commandArgs, "enhance-source-batch");
}

function runOptimizePipeline() {
  const npmCommand = process.platform === "win32" ? "npm" : "npm";
  const npmShell = process.platform === "win32";
  const steps = [
    [npmCommand, ["run", "assets:install-agrone"], "install agrone sources"],
    [npmCommand, ["run", "assets:install-catalog-showcases"], "install catalog showcase sources"],
    [npmCommand, ["run", "assets:optimize-hero-slides"], "optimize hero slides"],
    [npmCommand, ["run", "assets:optimize-shelf-heroes"], "optimize shelf heroes"],
    [npmCommand, ["run", "assets:optimize-agrone-mission"], "optimize agrone mission tiles"],
    [npmCommand, ["run", "assets:optimize-catalog-showcases"], "optimize catalog showcases"],
    [npmCommand, ["run", "assets:optimize-storefront"], "optimize storefront media"]
  ];
  for (const [command, commandArgs, label] of steps) {
    runCommand(command, commandArgs, label, { shell: npmShell });
  }
}

async function main() {
  const manifestItems = buildManifestItems();

  if (force && !skipEnhance) {
    restoreAllFromBackups(manifestItems);
    wipeOptimizedVariantDirs();
  }

  syncCityMastersIntoPublic(manifestItems);

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    visibleCount: visibleMasters.length,
    items: manifestItems
  };

  const manifestPath = join(projectRoot, "tools", ".enhance-visible-manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  const missing = manifestItems.filter((item) => !item.resolvedPath);
  if (missing.length > 0) {
    console.warn("Missing source files (will be skipped by enhancer):");
    for (const item of missing) {
      console.warn(`  - ${item.src}`);
    }
  }

  const binaryPath = dryRun ? "dry-run" : await ensureRealEsrganBinary();

  if (!skipEnhance) {
    await runEnhancement(manifestPath, binaryPath);
  }

  if (!skipEnhance && !dryRun) {
    runValidation(manifestPath);
  }

  if (!skipOptimize && !dryRun) {
    runOptimizePipeline();
  } else if (dryRun) {
    console.log("\n[dry-run] skipping optimize pipeline");
  }

  console.log("\nEnhancement workflow complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
