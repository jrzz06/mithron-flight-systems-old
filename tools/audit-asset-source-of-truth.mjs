/**
 * Source-of-truth audit for storefront media assets.
 * Classifies every tracked path as ACTIVE, LEGACY, DUPLICATE, ORPHANED, or CONFLICTING.
 */
import fs from "node:fs";
import path from "node:path";
import pathAliases from "../config/storefront-path-aliases.json" with { type: "json" };
import { STOREFRONT_IMAGE_INVENTORY, canonicalStorefrontSrc } from "./storefront-image-inventory.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const PUBLIC = path.join(ROOT, "public");

const RUNTIME_SOURCE_DIRS = ["app", "components", "config", "features", "lib", "sections", "services"];
const RUNTIME_EXTENSIONS = new Set([".ts", ".tsx"]);

function walk(dir, extensions, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      walk(full, extensions, files);
    } else if ([...extensions].some((ext) => entry.name.endsWith(ext))) {
      files.push(full);
    }
  }
  return files;
}

function loadRegistryPaths() {
  const file = path.join(ROOT, "config", "storefront-media-paths.ts");
  const text = fs.readFileSync(file, "utf8");
  const paths = new Set();
  const re = /["'`](\/(?:media|assets|optimized)\/[^"'`]+)["'`]/g;
  let match;
  while ((match = re.exec(text))) paths.add(match[1]);
  return paths;
}

function loadRemoteMapPaths() {
  const file = path.join(ROOT, "data", "mithron-storefront-remote-map.generated.json");
  if (!fs.existsSync(file)) return new Set();
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  return new Set(Object.keys(data.assets ?? {}));
}

function collectCodeReferences() {
  const refs = new Map();
  const files = RUNTIME_SOURCE_DIRS.flatMap((dir) => walk(path.join(ROOT, dir), RUNTIME_EXTENSIONS));
  const re = /["'`](\/(?:media|assets|optimized)\/[^"'`]+)["'`]/g;

  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    let match;
    while ((match = re.exec(text))) {
      const src = match[1];
      const bucket = refs.get(src) ?? [];
      bucket.push(path.relative(ROOT, file));
      refs.set(src, bucket);
    }
  }
  return refs;
}

function localFileExists(src) {
  const canonical = canonicalStorefrontSrc(src);
  for (const candidate of [src, canonical, src.replace(/\.png$/i, ".webp")]) {
    const filePath = path.join(PUBLIC, candidate.replace(/^\//, ""));
    if (fs.existsSync(filePath)) return { exists: true, path: candidate };
  }
  return { exists: false, path: canonical };
}

function listPublicImages() {
  const images = [];
  const exts = [".png", ".jpg", ".jpeg", ".webp", ".avif", ".svg", ".ico"];
  walk(PUBLIC, exts, images);
  return images.map((file) => "/" + path.relative(PUBLIC, file).replace(/\\/g, "/"));
}

function classifyInventory() {
  const registry = loadRegistryPaths();
  const inventory = new Set(STOREFRONT_IMAGE_INVENTORY.map((item) => item.src));
  const codeRefs = collectCodeReferences();
  const remoteMap = loadRemoteMapPaths();
  const publicImages = listPublicImages();

  const active = [];
  const legacy = [];
  const duplicate = [];
  const orphaned = [];
  const conflicting = [];

  for (const item of STOREFRONT_IMAGE_INVENTORY) {
    const refs = codeRefs.get(item.src) ?? [];
    const canonical = canonicalStorefrontSrc(item.src);
    const aliasRefs = Object.entries(pathAliases)
      .filter(([, target]) => target === item.src)
      .map(([alias]) => alias);
    const hasRemote = remoteMap.has(item.src) || remoteMap.has(canonical);
    const local = localFileExists(item.src);

    const status = {
      src: item.src,
      group: item.group,
      referencedIn: [...new Set([...refs, ...aliasRefs.flatMap((a) => codeRefs.get(a) ?? [])])],
      delivery: hasRemote ? "supabase-remote-map" : local.exists ? "local-public" : "unresolved",
      localExists: local.exists,
      inRemoteMap: hasRemote
    };

    if (status.referencedIn.length > 0 || hasRemote) {
      active.push(status);
    } else {
      legacy.push(status);
    }

    if (aliasRefs.length > 0) {
      duplicate.push({ canonical: item.src, aliases: aliasRefs });
    }

    if (hasRemote && local.exists) {
      conflicting.push({
        src: item.src,
        reason: "Both local binary and Supabase remote map entry exist — runtime prefers Supabase via resolveStorefrontSrc"
      });
    }
  }

  for (const publicPath of publicImages) {
    const isPipelineArtifact = publicPath.includes(".enhanced.json") || publicPath.endsWith(".bak");
    if (isPipelineArtifact) {
      orphaned.push({ path: publicPath, reason: "pipeline artifact in public/" });
      continue;
    }
    const referenced = codeRefs.has(publicPath) || inventory.has(publicPath) || remoteMap.has(publicPath);
    if (!referenced && !publicPath.includes("draco/")) {
      orphaned.push({ path: publicPath, reason: "no code or inventory reference" });
    }
  }

  for (const [src, files] of codeRefs) {
    if (!inventory.has(src) && !registry.has(src) && !remoteMap.has(src) && !src.includes("rbac-edge")) {
      const canonical = canonicalStorefrontSrc(src);
      if (!inventory.has(canonical) && !registry.has(canonical)) {
        legacy.push({ src, referencedIn: files, note: "referenced in runtime but not in registry or remote map" });
      }
    }
  }

  return {
    summary: {
      inventoryTotal: STOREFRONT_IMAGE_INVENTORY.length,
      registryPaths: registry.size,
      remoteMapEntries: remoteMap.size,
      publicImageFiles: publicImages.length,
      active: active.length,
      legacy: legacy.length,
      duplicateGroups: duplicate.length,
      orphaned: orphaned.length,
      conflicting: conflicting.length
    },
    ownership: {
      products: "Supabase media_assets.public_url via product_media_assets",
      cms: "Supabase hero_banners, category_metadata, trust_cards JSON columns",
      storefrontStatic: "config/storefront-media-paths.ts → resolve-storefront-src.ts → data/mithron-storefront-remote-map.generated.json",
      responsiveVariants: "data/mithron-supabase-assets.generated.json",
      heroSlides: "config/products.ts (/assets/hero/) with path aliases for legacy /media/mithron/hero/*",
      legacyWixCrawl: "data/mithron-products-crawled.generated.json (pipeline only, not runtime)"
    },
    active,
    legacy,
    duplicate,
    orphaned,
    conflicting
  };
}

const report = classifyInventory();
const outDir = path.join(ROOT, "reports");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "asset-source-of-truth-audit.json");
fs.writeFileSync(outFile, JSON.stringify(report, null, 2));

console.log(JSON.stringify({ summary: report.summary, reportFile: path.relative(ROOT, outFile) }, null, 2));

const blocking = report.orphaned.filter((o) => o.path?.endsWith(".enhanced.json"));
if (blocking.length > 0) {
  console.error(`\nOrphaned pipeline artifacts in public/: ${blocking.length} (.enhanced.json files should not be committed)`);
  process.exitCode = 1;
}
