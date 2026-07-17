#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { ensureRealEsrganBinary } from "./realesrgan-binary.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const stagingRoot = join(projectRoot, "tools", ".enhance-supabase-staging");

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const force = args.has("--force");
const uploadOnly = args.has("--upload-only");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=").slice(1).join("=")) : 0;
const slugArg = process.argv.find((arg) => arg.startsWith("--slug="));
const slugFilter = slugArg ? slugArg.split("=").slice(1).join("=") : "";
const pendingOnly = args.has("--pending");
const sharpOnly = args.has("--sharp-only");

function loadProjectEnv() {
  for (const envPath of [join(projectRoot, ".env.local"), join(projectRoot, ".env")]) {
    if (!existsSync(envPath)) continue;
    const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [name, ...parts] = trimmed.split("=");
      if (!name || process.env[name]) continue;
      process.env[name] = parts.join("=").replace(/^["']|["']$/g, "");
    }
  }
}

function detectPython() {
  for (const candidate of ["python", "python3", "py"]) {
    const probe = spawnSync(candidate, ["--version"], { shell: false, windowsHide: true });
    if (probe.status === 0) return candidate;
  }
  return null;
}

function hashBuffer(buffer, size = 8) {
  return createHash("sha256").update(buffer).digest("hex").slice(0, size);
}

function parseImageSrc(imageField) {
  if (!imageField) return null;
  if (typeof imageField === "string") {
    try {
      const parsed = JSON.parse(imageField);
      return typeof parsed?.src === "string" ? parsed.src.trim() : null;
    } catch {
      return imageField.trim() || null;
    }
  }
  if (typeof imageField === "object" && typeof imageField.src === "string") {
    return imageField.src.trim();
  }
  return null;
}

async function fetchProductImageSources(supabase) {
  const { data, error } = await supabase
    .from("mithron_products")
    .select("slug,image,hero,gallery")
    .eq("workflow_status", "published")
    .eq("is_visible", true)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(`Failed to fetch products: ${error.message}`);

  const { completedSlugs } = loadUploadProgress();
  const bySrc = new Map();
  for (const row of data ?? []) {
    const picked = pickEnhancementSource(row, completedSlugs);
    if (!picked) continue;
    if (!bySrc.has(picked.src)) {
      bySrc.set(picked.src, { src: picked.src, slug: row.slug });
    }
  }

  const items = [...bySrc.values()].filter((item) => !slugFilter || item.slug === slugFilter);
  if (slugFilter && items.length === 0) {
    throw new Error(`No published product image source found for slug: ${slugFilter}`);
  }
  return limit > 0 ? items.slice(0, limit) : items;
}

function pickEnhancementSource(row, completedSlugs) {
  const imageSrc = parseImageSrc(row.image);
  const heroSrc = parseImageSrc(row.hero);
  const hasEnhancedPrimary = /-enh-v1\./i.test(imageSrc ?? "");
  const lowResEnhancedPrimary = /-480w-enh-v1\./i.test(imageSrc ?? "");

  if (!pendingOnly) {
    if (force && hasEnhancedPrimary && lowResEnhancedPrimary && heroSrc?.startsWith("http") && !/-enh-v1\./i.test(heroSrc)) {
      return { src: heroSrc, slug: row.slug };
    }
    if (!imageSrc?.startsWith("http")) return null;
    return { src: imageSrc, slug: row.slug };
  }

  if (hasEnhancedPrimary) {
    if (!force) return null;
    if (!lowResEnhancedPrimary) return null;
    if (heroSrc?.startsWith("http") && !/-enh-v1\./i.test(heroSrc)) {
      return { src: heroSrc, slug: row.slug };
    }
    return null;
  }

  if (!imageSrc?.startsWith("http")) return null;
  if (completedSlugs.has(row.slug) && !force) return null;
  return { src: imageSrc, slug: row.slug };
}

async function downloadToStaging(items) {
  mkdirSync(stagingRoot, { recursive: true });
  const manifestItems = [];

  for (const item of items) {
    const hash = hashBuffer(Buffer.from(item.src), 10);
    const ext = item.src.match(/\.(webp|png|jpe?g|avif)(?:\?|$)/i)?.[1]?.toLowerCase() ?? "webp";
    const filename = `${item.slug}-${hash}.${ext}`;
    const destination = join(stagingRoot, filename);

    if (dryRun) {
      manifestItems.push({
        src: item.src,
        maxEdge: 2560,
        resolvedPath: destination,
        slug: item.slug,
        dryRun: true
      });
      continue;
    }

    const response = await fetch(item.src);
    if (!response.ok) {
      console.warn(`skip download ${item.src}: HTTP ${response.status}`);
      continue;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    writeFileSync(destination, buffer);
    manifestItems.push({
      src: item.src,
      maxEdge: 2560,
      resolvedPath: destination,
      slug: item.slug
    });
  }

  return manifestItems;
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
  const result = spawnSync(python, commandArgs, {
    cwd: projectRoot,
    stdio: "inherit",
    shell: false,
    windowsHide: true
  });
  if (result.status !== 0) {
    throw new Error(`enhance-source-batch failed with exit code ${result.status ?? "unknown"}`);
  }
}

async function validateStagingImages(manifestPath, { throwOnFailure = true } = {}) {
  const python = detectPython();
  if (!python) {
    throw new Error("Python not found for validation.");
  }
  const reportPath = join(projectRoot, "tools", ".enhance-supabase-validation.json");
  spawnSync(
    python,
    [
      join(projectRoot, "tools", "validate-enhanced-images.py"),
      "--manifest",
      manifestPath,
      "--output",
      reportPath
    ],
    { cwd: projectRoot, stdio: "inherit", shell: false, windowsHide: true }
  );
  if (!existsSync(reportPath)) {
    throw new Error("Validation report was not written.");
  }
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  if (throwOnFailure && (report.failed ?? 0) > 0) {
    throw new Error(`Staging image validation failed for ${report.failed} image(s); aborting Supabase upload.`);
  }
  return report;
}

async function applySharpLanczosFallback(failedResults, maxEdge = 2560) {
  for (const result of failedResults) {
    const destination = result.path;
    const backupPath = `${destination}.bak`;
    const sourcePath = existsSync(backupPath) ? backupPath : destination;
    if (!existsSync(sourcePath)) continue;

    const metadata = await sharp(sourcePath).metadata();
    const sourceWidth = metadata.width ?? 0;
    const sourceHeight = metadata.height ?? 0;
    if (!sourceWidth || !sourceHeight) continue;

    const scale = Math.min(maxEdge / sourceWidth, maxEdge / sourceHeight, 4);
    if (scale <= 1.01) continue;

    const buffer = await sharp(sourcePath)
      .resize({
        width: Math.round(sourceWidth * scale),
        height: Math.round(sourceHeight * scale),
        fit: "inside",
        kernel: sharp.kernel.lanczos3
      })
      .webp({ quality: 96, effort: 6, smartSubsample: true })
      .toBuffer();

    writeFileSync(destination, buffer);
    const outputMeta = await sharp(buffer).metadata();
    console.log(
      `sharp fallback ${destination}: ${sourceWidth}x${sourceHeight} → ${outputMeta.width}x${outputMeta.height}`
    );
  }
}

async function applySharpUpscaleToManifest(manifestItems, maxEdge = 2560) {
  for (const item of manifestItems) {
    const destination = item.resolvedPath;
    if (!existsSync(destination)) continue;

    const metadata = await sharp(destination, { failOn: "none" }).metadata();
    const sourceWidth = metadata.width ?? 0;
    const sourceHeight = metadata.height ?? 0;
    if (!sourceWidth || !sourceHeight) continue;

    const scale = Math.min(maxEdge / sourceWidth, maxEdge / sourceHeight, 4);
    const targetWidth = Math.max(sourceWidth, Math.round(sourceWidth * scale));
    const targetHeight = Math.max(sourceHeight, Math.round(sourceHeight * scale));
    const webpPath = destination.replace(/\.(png|jpe?g|webp)$/i, "-upscaled.webp");

    const buffer = await sharp(destination, { failOn: "none" })
      .resize({
        width: targetWidth,
        height: targetHeight,
        fit: "inside",
        kernel: sharp.kernel.lanczos3
      })
      .webp({ quality: 96, effort: 6, smartSubsample: true })
      .toBuffer();

    writeFileSync(webpPath, buffer);
    if (webpPath !== destination && existsSync(destination)) {
      try {
        rmSync(destination, { force: true });
      } catch {
        // Keep the original if Windows still has a transient lock on it.
      }
    }
    item.resolvedPath = webpPath;
    await writeEnhancedMarker(webpPath, {
      src: item.src,
      engine: "sharp-lanczos",
      slug: item.slug
    });
    const outputMeta = await sharp(buffer).metadata();
    console.log(
      `sharp upscale ${item.slug}: ${sourceWidth}x${sourceHeight} → ${outputMeta.width}x${outputMeta.height}`
    );
  }
}

async function writeEnhancedMarker(resolvedPath, extra = {}) {
  const metadata = await sharp(resolvedPath).metadata();
  writeFileSync(
    `${resolvedPath}.enhanced.json`,
    `${JSON.stringify(
      {
        status: "enhanced",
        engine: "sharp-lanczos",
        resolvedPath,
        outputWidth: metadata.width ?? 0,
        outputHeight: metadata.height ?? 0,
        maxEdge: 2560,
        ...extra
      },
      null,
      2
    )}\n`
  );
}

async function applySharpFallbackForRejectedEnhancements() {
  const resultsPath = join(projectRoot, "tools", ".enhance-supabase-manifest.results.json");
  if (!existsSync(resultsPath)) return;

  const summary = JSON.parse(readFileSync(resultsPath, "utf8"));
  const rejected = (summary.results ?? []).filter((result) => result.status === "rejected");
  if (!rejected.length) return;

  console.log(`Real-ESRGAN rejected ${rejected.length} image(s); applying Sharp Lanczos fallback.`);
  await applySharpLanczosFallback(rejected.map((result) => ({ path: result.resolvedPath })));
  for (const result of rejected) {
    await writeEnhancedMarker(result.resolvedPath, { src: result.src, fallbackReason: result.reason });
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(label, fn, { attempts = 8, baseDelayMs = 2000 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = error?.message ?? String(error);
      const retryable =
        /service unavailable|bad gateway|gateway timeout|timeout|timed out|rate limit|too many requests|503|502|504|429|econnreset|fetch failed|network/i.test(
          message
        );
      if (!retryable || attempt === attempts) throw error;
      const delay = baseDelayMs * 2 ** (attempt - 1);
      console.warn(`${label}: attempt ${attempt}/${attempts} failed (${message}); retrying in ${delay}ms`);
      await sleep(delay);
    }
  }
  throw lastError;
}

function loadUploadProgress() {
  const progressPath = join(projectRoot, "tools", ".enhance-supabase-upload-progress.json");
  if (!existsSync(progressPath)) {
    return { completedSlugs: new Set(), progressPath };
  }
  const progress = JSON.parse(readFileSync(progressPath, "utf8"));
  return {
    completedSlugs: new Set(progress.completedSlugs ?? []),
    progressPath
  };
}

function saveUploadProgress(progressPath, completedSlugs) {
  writeFileSync(
    progressPath,
    JSON.stringify(
      {
        updatedAt: new Date().toISOString(),
        completedSlugs: [...completedSlugs].sort()
      },
      null,
      2
    )
  );
}

function loadValidatedPaths() {
  const reportPath = join(projectRoot, "tools", ".enhance-supabase-validation.json");
  if (!existsSync(reportPath)) {
    throw new Error("Missing .enhance-supabase-validation.json — run enhancement first.");
  }
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  return new Set(
    (report.results ?? [])
      .filter((result) => result.passed)
      .map((result) => result.path.toLowerCase())
  );
}

async function uploadEnhancedVariants(supabase, manifestItems, validatedPaths = null) {
  const bucket = "mithron-products";
  const cacheControl = "31536000";
  const variantWidths = [2560, 1920, 1280, 768, 480];
  const { completedSlugs, progressPath } = loadUploadProgress();
  let updatedCount = 0;

  for (const item of manifestItems) {
    if (!existsSync(item.resolvedPath)) continue;
    if (validatedPaths && !validatedPaths.has(item.resolvedPath.toLowerCase())) {
      console.warn(`skip upload ${item.slug}: failed validation or not approved`);
      continue;
    }
    const markerPath = `${item.resolvedPath}.enhanced.json`;
    if (!existsSync(markerPath)) {
      console.warn(`skip upload ${item.slug}: not enhanced or rejected`);
      continue;
    }
    if (completedSlugs.has(item.slug) && !force) {
      console.log(`resume skip ${item.slug}: already uploaded`);
      updatedCount += 1;
      continue;
    }
    const sourceMeta = await sharp(item.resolvedPath).metadata();
    const baseName = item.slug;
    const uploadedVariants = { webp: [] };

    for (const width of variantWidths.filter((value) => value <= (sourceMeta.width ?? value))) {
      const buffer = await sharp(item.resolvedPath)
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 96, effort: 6, smartSubsample: true })
        .toBuffer();
      const hash = hashBuffer(buffer, 8);
      const storagePath = `${baseName}-${width}w-enh-v1.${hash}.webp`;
      const contentType = "image/webp";
      await withRetry(`upload ${storagePath}`, async () => {
        const result = await supabase.storage.from(bucket).upload(storagePath, buffer, {
          cacheControl,
          contentType,
          upsert: false
        });
        if (result.error && !/already exists/i.test(result.error.message)) {
          throw new Error(`Upload failed for ${storagePath}: ${result.error.message}`);
        }
        return result;
      });
      const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/g, "")}/storage/v1/object/public/${bucket}/${storagePath}`;
      const info = await sharp(buffer).metadata();
      uploadedVariants.webp.push({
        width,
        height: info.height ?? width,
        format: "webp",
        src: publicUrl,
        storagePath
      });
      await sleep(150);
    }

    const bestWebp = uploadedVariants.webp.at(-1);
    if (!bestWebp) continue;

    const image = {
      src: bestWebp.src,
      alt: item.slug,
      kind: "image",
      width: bestWebp.width,
      height: bestWebp.height
    };
    await withRetry(`update product ${item.slug}`, async () => {
      const { error } = await supabase.from("mithron_products").update({ image }).eq("slug", item.slug);
      if (error) {
        throw new Error(`Failed to update product ${item.slug}: ${error.message}`);
      }
    });

    completedSlugs.add(item.slug);
    saveUploadProgress(progressPath, completedSlugs);
    updatedCount += 1;
    console.log(`uploaded ${item.slug} (${uploadedVariants.webp.length} variants)`);
    await sleep(500);
  }

  return updatedCount;
}

async function main() {
  loadProjectEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  const sources = await fetchProductImageSources(supabase);
  console.log(`Found ${sources.length} unique product image sources.`);

  if (sources.length === 0) return;

  if (uploadOnly) {
    const manifestPath = join(projectRoot, "tools", ".enhance-supabase-manifest.json");
    if (!existsSync(manifestPath)) {
      throw new Error("Missing .enhance-supabase-manifest.json — run enhancement first.");
    }
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const manifestItems = manifest.items ?? [];
    const validatedPaths = loadValidatedPaths();
    console.log(`Upload-only: ${validatedPaths.size} validated images ready for upload.`);
    const updatedCount = await uploadEnhancedVariants(supabase, manifestItems, validatedPaths);
    console.log(`Updated ${updatedCount} product primary images with enhanced variants.`);
    return;
  }

  if (sharpOnly && pendingOnly && !dryRun && existsSync(stagingRoot)) {
    rmSync(stagingRoot, { recursive: true, force: true });
  }

  if (!dryRun && existsSync(stagingRoot) && !uploadOnly && !slugFilter && !pendingOnly && !sharpOnly) {
    rmSync(stagingRoot, { recursive: true, force: true });
  }

  const manifestItems = await downloadToStaging(sources);
  const manifestPath = join(projectRoot, "tools", ".enhance-supabase-manifest.json");
  writeFileSync(
    manifestPath,
    JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), items: manifestItems }, null, 2)
  );

  if (dryRun) {
    console.log("[dry-run] skipping Supabase upload and product image updates");
    console.log(`[dry-run] would enhance ${manifestItems.length} product image sources`);
    return;
  }

  if (sharpOnly) {
    console.log(`Sharp-only upscale for ${manifestItems.length} product image source(s).`);
    await applySharpUpscaleToManifest(manifestItems);
    writeFileSync(
      manifestPath,
      JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), items: manifestItems }, null, 2)
    );
    const updatedCount = await uploadEnhancedVariants(supabase, manifestItems, null);
    console.log(`Updated ${updatedCount} product primary images with enhanced variants.`);
    return;
  }

  const binaryPath = await ensureRealEsrganBinary();
  await runEnhancement(manifestPath, binaryPath);
  await applySharpFallbackForRejectedEnhancements(manifestPath);
  let validationReport = await validateStagingImages(manifestPath, { throwOnFailure: false });
  if ((validationReport.failed ?? 0) > 0) {
    const failedResults = (validationReport.results ?? []).filter((result) => !result.passed);
    console.log(`Validation failed for ${failedResults.length} image(s); applying Sharp Lanczos fallback.`);
    await applySharpLanczosFallback(failedResults);
    for (const result of failedResults) {
      await writeEnhancedMarker(result.path, { validationSeamScore: result.seamScore });
    }
    validationReport = await validateStagingImages(manifestPath);
  }

  const validatedPaths = new Set(
    (validationReport.results ?? [])
      .filter((result) => result.passed)
      .map((result) => result.path.toLowerCase())
  );
  const updatedCount = await uploadEnhancedVariants(supabase, manifestItems, validatedPaths);
  console.log(`Updated ${updatedCount} product primary images with enhanced variants.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
