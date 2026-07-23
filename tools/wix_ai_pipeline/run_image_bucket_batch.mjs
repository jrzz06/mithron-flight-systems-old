#!/usr/bin/env node
/**
 * IMAGE BUCKET → 1000×1000 cutout WebP batch replace.
 *
 * Safety: exact name match only (+ one punctuation alias). No fuzzy mapping.
 *
 * Usage:
 *   node tools/wix_ai_pipeline/run_image_bucket_batch.mjs --dry-run-mapping
 *   node tools/wix_ai_pipeline/run_image_bucket_batch.mjs --apply --confirm=UPLOAD_DUAL
 *   node tools/wix_ai_pipeline/run_image_bucket_batch.mjs --apply --confirm=UPLOAD_DUAL --limit=1
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..", "..");
const STAGING = join(projectRoot, "tools", ".wix-ai-pipeline");
const IMAGE_BUCKET = join("D:", "mithuuu", "IMAGE BUCKET");
const CONFIRM = "UPLOAD_DUAL";
const REQUIRED_SIDE = 1000;

/** Punctuation-only alias: same SKU, folder spelling differs from DB name. */
const ALIAS_BY_FOLDER = new Map([
  [
    "10.05.02.0095 EFT 10L Tank 10LStandard For Agricultural Drone Parts E410PE610P",
    "10.05.02.0095 EFT 10L Tank 10L/Standard For Agricultural Drone Parts E410P/E610P"
  ]
]);

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".PNG", ".JPG", ".JPEG", ".WEBP"]);

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (name) => {
    const hit = args.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : null;
  };
  const limitRaw = get("limit");
  return {
    dryRunMapping: args.includes("--dry-run-mapping"),
    apply: args.includes("--apply"),
    confirm: get("confirm"),
    heroMode: get("hero-mode") || "studio",
    python: get("python") || process.env.PYTHON || findPython(),
    limit: limitRaw ? Number(limitRaw) : null,
    skipUpload: args.includes("--skip-upload")
  };
}

function findPython() {
  const candidates = [
    join(process.env.LOCALAPPDATA || "", "Programs", "Python", "Python313", "python.exe"),
    "python",
    "py"
  ];
  for (const c of candidates) {
    if (!c) continue;
    if (c.includes("\\") || c.includes("/")) {
      if (existsSync(c)) return c;
      continue;
    }
    const r = spawnSync(c, ["--version"], { encoding: "utf8" });
    if (r.status === 0) return c;
  }
  return "python";
}

function loadEnv() {
  for (const p of [join(projectRoot, ".env.local"), join(projectRoot, ".env")]) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const [k, ...rest] = t.split("=");
      if (k && !process.env[k]) process.env[k] = rest.join("=").replace(/^["']|["']$/g, "");
    }
  }
}

/** Strict normalizer: NFC, trim, collapse whitespace, unify all dash kinds to ASCII hyphen. */
function normalizeName(name) {
  return String(name || "")
    .normalize("NFC")
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-") // various dashes → -
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function listBucketFolders() {
  if (!existsSync(IMAGE_BUCKET)) {
    throw new Error(`IMAGE BUCKET not found: ${IMAGE_BUCKET}`);
  }
  return readdirSync(IMAGE_BUCKET, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b));
}

function pickLargestImage(folderPath) {
  let best = null;
  let bestSize = -1;
  for (const name of readdirSync(folderPath)) {
    const ext = name.slice(name.lastIndexOf("."));
    if (!IMAGE_EXTS.has(ext)) continue;
    const full = join(folderPath, name);
    try {
      const st = statSync(full);
      if (!st.isFile()) continue;
      if (st.size > bestSize) {
        bestSize = st.size;
        best = full;
      }
    } catch {
      /* skip */
    }
  }
  return best ? { path: best, bytes: bestSize } : null;
}

async function fetchAllProducts(supabase) {
  const pageSize = 1000;
  let from = 0;
  const rows = [];
  for (;;) {
    const { data, error } = await supabase
      .from("mithron_products")
      .select("slug,name,category")
      .order("name", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

function buildMapping(folders, products) {
  /** @type {Map<string, Array<{slug:string,name:string,category:string|null}>>} */
  const byNorm = new Map();
  for (const p of products) {
    const key = normalizeName(p.name);
    if (!byNorm.has(key)) byNorm.set(key, []);
    byNorm.get(key).push(p);
  }

  const entries = [];
  for (const folder of folders) {
    const folderPath = join(IMAGE_BUCKET, folder);
    const image = pickLargestImage(folderPath);
    const aliasTarget = ALIAS_BY_FOLDER.get(folder) || null;
    const lookupName = aliasTarget || folder;
    const key = normalizeName(lookupName);
    const hits = byNorm.get(key) || [];

    let status = "missed";
    let reason = "";
    let product = null;

    if (folder === "New folder") {
      status = "skipped";
      reason = "junk_folder";
    } else if (!image) {
      status = "missed";
      reason = "empty_folder_no_png";
    } else if (hits.length === 0) {
      status = "missed";
      reason = aliasTarget
        ? "alias_target_not_in_db"
        : "no_exact_name_match";
    } else if (hits.length > 1) {
      status = "missed";
      reason = "ambiguous_multiple_products";
    } else {
      product = hits[0];
      status = aliasTarget ? "alias" : "exact";
      reason = aliasTarget ? "punctuation_alias" : "exact_name";
    }

    entries.push({
      folder,
      status,
      reason,
      sourceImage: image?.path || null,
      sourceBytes: image?.bytes || null,
      productSlug: product?.slug || null,
      productName: product?.name || null,
      productCategory: product?.category || null,
      aliasTo: aliasTarget
    });
  }
  return entries;
}

function resolvePythonScript() {
  return join(projectRoot, "tools", "wix_ai_pipeline", "run_dual_assets.py");
}

function runPipeline({ python, input, outDir, heroMode, slug }) {
  mkdirSync(outDir, { recursive: true });
  const args = [
    "-u",
    resolvePythonScript(),
    "--input",
    input,
    "--out",
    outDir,
    "--side",
    String(REQUIRED_SIDE),
    "--hero-mode",
    heroMode
  ];
  console.log(`\n=== PIPELINE ${slug} ===`);
  console.log(`${python} ${args.join(" ")}`);
  const r = spawnSync(python, args, {
    cwd: projectRoot,
    env: { ...process.env, PYTHONUNBUFFERED: "1", PYTHONIOENCODING: "utf-8" },
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) {
    throw new Error(`Pipeline failed for ${slug} (exit ${r.status})`);
  }
  const reportPath = join(outDir, "report.json");
  if (!existsSync(reportPath)) throw new Error(`Missing report after pipeline: ${reportPath}`);
  return JSON.parse(readFileSync(reportPath, "utf8"));
}

function runUpload({ slug, apply }) {
  const args = [
    join(projectRoot, "tools", "wix_ai_pipeline", "upload_dual_assets.mjs"),
    `--slug=${slug}`
  ];
  if (apply) {
    args.push("--apply", `--confirm=${CONFIRM}`);
  }
  console.log(`\n=== UPLOAD ${slug} (${apply ? "APPLY" : "DRY"}) ===`);
  const r = spawnSync(process.execPath, args, {
    cwd: projectRoot,
    env: process.env,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) {
    throw new Error(`Upload failed for ${slug} (exit ${r.status})`);
  }
  return true;
}

async function main() {
  const options = parseArgs();
  if (options.apply && options.confirm !== CONFIRM) {
    throw new Error(`Live batch requires --apply --confirm=${CONFIRM}`);
  }
  if (!options.dryRunMapping && !options.apply && !options.skipUpload) {
    // Default: mapping dry-run only unless --apply
    options.dryRunMapping = true;
  }

  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const products = await fetchAllProducts(supabase);
  const folders = listBucketFolders();
  const mapping = buildMapping(folders, products);

  mkdirSync(STAGING, { recursive: true });
  const mappingPath = join(STAGING, "image-bucket-mapping-dry-run.json");
  const mappingDoc = {
    ts: new Date().toISOString(),
    imageBucket: IMAGE_BUCKET,
    productCount: products.length,
    folderCount: folders.length,
    counts: {
      exact: mapping.filter((m) => m.status === "exact").length,
      alias: mapping.filter((m) => m.status === "alias").length,
      missed: mapping.filter((m) => m.status === "missed").length,
      skipped: mapping.filter((m) => m.status === "skipped").length
    },
    entries: mapping
  };
  writeFileSync(mappingPath, JSON.stringify(mappingDoc, null, 2), "utf8");
  console.log(`Wrote mapping dry-run: ${mappingPath}`);
  console.log(JSON.stringify(mappingDoc.counts, null, 2));

  if (options.dryRunMapping && !options.apply) {
    console.log("\nDry-run mapping only. Re-run with --apply --confirm=UPLOAD_DUAL to process.");
    return;
  }

  let work = mapping.filter((m) => m.status === "exact" || m.status === "alias");
  if (options.limit && options.limit > 0) {
    work = work.slice(0, options.limit);
  }

  const changed = [];
  const failed = [];
  const missed = mapping.filter((m) => m.status === "missed" || m.status === "skipped");

  for (const entry of work) {
    const slug = entry.productSlug;
    const outDir = join(STAGING, slug);
    try {
      const report = runPipeline({
        python: options.python,
        input: entry.sourceImage,
        outDir,
        heroMode: options.heroMode,
        slug
      });

      const cutMeta = report.cutout_webp_meta || {};
      if (cutMeta.width !== REQUIRED_SIDE || cutMeta.height !== REQUIRED_SIDE) {
        throw new Error(
          `Cutout dims ${cutMeta.width}x${cutMeta.height}, expected ${REQUIRED_SIDE}x${REQUIRED_SIDE}`
        );
      }

      if (!options.skipUpload) {
        runUpload({ slug, apply: options.apply });
      }

      changed.push({
        folder: entry.folder,
        status: entry.status,
        slug,
        name: entry.productName,
        sourceImage: entry.sourceImage,
        cutoutBytes: cutMeta.file_size_bytes ?? null,
        cutoutQuality: cutMeta.quality ?? null,
        overBudget: cutMeta.over_budget ?? false,
        heroModeUsed: report.hero_mode_used
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`FAILED ${slug}: ${message}`);
      failed.push({
        folder: entry.folder,
        slug,
        name: entry.productName,
        error: message
      });
    }
  }

  const batchReport = {
    ts: new Date().toISOString(),
    mode: options.apply ? "APPLIED" : "DRY",
    heroMode: options.heroMode,
    mappingPath,
    counts: {
      changed: changed.length,
      failed: failed.length,
      missed: missed.length,
      mappedEligible: work.length
    },
    changed,
    failed,
    missed
  };
  const reportPath = join(STAGING, "image-bucket-batch-report.json");
  writeFileSync(reportPath, JSON.stringify(batchReport, null, 2), "utf8");
  console.log(`\nBatch report: ${reportPath}`);
  console.log(JSON.stringify(batchReport.counts, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
