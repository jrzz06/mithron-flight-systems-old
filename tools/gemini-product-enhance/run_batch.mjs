#!/usr/bin/env node
// Full-catalog batch: Gemini Playwright enhance -> (optional BRIA) -> 1000x1000 WebP
// Usage: node run_batch.mjs --workers=1 --no-cutout
//        node run_batch.mjs --only=v9-flight --skip-gemini
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import dotenv from "dotenv";
import sharp from "sharp";
import {
  DIRS,
  ROOT,
  ensureDirs,
  log,
  sleep,
  randomDelay,
  getSupabase,
  enhanceOneWithGemini,
  launchPersistentBrowser,
} from "./generate.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

const MANIFEST = path.join(ROOT, "manifest.json");
const RUN_LOG = path.join(ROOT, "run-log.jsonl");
const DEFAULT_PY = "C:\\Users\\Administrator\\AppData\\Local\\Programs\\Python\\Python313\\python.exe";
const PYTHON = process.env.PYTHON || (fs.existsSync(DEFAULT_PY) ? DEFAULT_PY : "python");
const CUTOUT_SCRIPT = path.join(ROOT, "cutout_bria.py");
const SOURCE_BUCKET = process.env.SOURCE_BUCKET || "mithron-products";
const WORKERS = Math.max(1, Math.min(3, Number(process.env.WORKERS || 1)));
const DELAY_MIN = Number(process.env.DELAY_MIN_SEC || 2);
const DELAY_MAX = Number(process.env.DELAY_MAX_SEC || 4);
const DEFAULT_SKIP_CUTOUT = String(process.env.SKIP_CUTOUT ?? "1") !== "0";

function parseArgs(argv) {
  const out = {
    workers: WORKERS,
    limit: 0,
    only: "",
    skipGemini: false,
    skipCutout: DEFAULT_SKIP_CUTOUT,
    skipExisting: true,
    dryRun: false,
  };
  for (const a of argv) {
    if (a.startsWith("--workers=")) out.workers = Math.max(1, Math.min(3, Number(a.slice(10)) || 1));
    else if (a.startsWith("--limit=")) out.limit = Number(a.slice(8)) || 0;
    else if (a.startsWith("--only=")) out.only = a.slice(7).toLowerCase();
    else if (a.startsWith("--slug=")) out.only = a.slice(7).toLowerCase();
    else if (a === "--skip-gemini") out.skipGemini = true;
    else if (a === "--no-cutout" || a === "--skip-cutout") out.skipCutout = true;
    else if (a === "--with-cutout") out.skipCutout = false;
    else if (a === "--no-skip") out.skipExisting = false;
    else if (a === "--resume") out.skipExisting = true;
    else if (a === "--dry-run") out.dryRun = true;
  }
  return out;
}

function appendLog(entry) {
  fs.appendFileSync(RUN_LOG, JSON.stringify({ ...entry, at: new Date().toISOString() }) + "\n");
}

function stagingPaths(job) {
  const dir = path.join(DIRS.staging, job.slug);
  return {
    dir,
    webp: path.join(dir, job.stagingName),
    preview: path.join(dir, job.stagingName.replace(/\.webp$/i, ".preview.png")),
    meta: path.join(dir, job.stagingName.replace(/\.webp$/i, ".meta.json")),
    geminiRaw: path.join(DIRS.downloads, `${job.slug}-${job.suffix}-gemini.png`),
    sourceLocal: path.join(
      DIRS.work,
      `${job.slug}-${job.suffix}-source${path.extname(job.sourceName) || ".jpg"}`
    ),
  };
}

async function stageEnhancedOnly(inputPath, outWebp, outPreview) {
  fs.mkdirSync(path.dirname(outWebp), { recursive: true });
  await sharp(inputPath)
    .rotate()
    .ensureAlpha()
    .resize(1000, 1000, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .sharpen({ sigma: 0.8 })
    .webp({
      quality: 85,
      alphaQuality: 100,
      lossless: false,
      smartSubsample: true,
    })
    .toFile(outWebp);

  await sharp(outWebp).png({ quality: 90 }).toFile(outPreview);
  const meta = await sharp(outWebp).metadata();
  const stat = fs.statSync(outWebp);
  log(`Staged enhance-only WebP: ${outWebp} (${stat.size} bytes, ${meta.width}x${meta.height})`);
}

function runPythonCutout(inputPath, outWebp, outPreview) {
  return new Promise((resolve, reject) => {
    const args = [
      CUTOUT_SCRIPT,
      "--input",
      inputPath,
      "--out-webp",
      outWebp,
      "--out-preview",
      outPreview,
      "--side",
      "1000",
      "--margin",
      "0.08",
      "--quality",
      "85",
      "--model",
      process.env.REMBG_MODEL || "bria-rmbg",
    ];
    log(`BRIA cutout: ${PYTHON} ${args.join(" ")}`);
    const child = spawn(PYTHON, args, {
      stdio: "inherit",
      cwd: ROOT,
      shell: true,
      env: {
        ...process.env,
        CUTOUT_USE_GPU: process.env.CUTOUT_USE_GPU || "1",
        CUDA_VISIBLE_DEVICES:
          (process.env.CUTOUT_USE_GPU || "1") === "0"
            ? ""
            : process.env.CUDA_VISIBLE_DEVICES || "0",
        ORT_CUDA_UNAVAILABLE: (process.env.CUTOUT_USE_GPU || "1") === "0" ? "1" : "",
        ORT_TENSORRT_UNAVAILABLE: "1",
        PYTHONIOENCODING: "utf-8",
        PYTHONPATH: path.join(ROOT, ".."),
      },
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`cutout_bria.py exited ${code}`));
    });
  });
}

async function downloadJob(supabase, objectPath, dest, bucket) {
  const { data, error } = await supabase.storage.from(bucket).download(objectPath);
  if (error) throw new Error(`Download failed ${bucket}/${objectPath}: ${error.message}`);
  const buf = Buffer.from(await data.arrayBuffer());
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  return dest;
}

async function workerLoop(workerId, jobs, opts) {
  const profileDir =
    workerId === 0 ? DIRS.profile : path.join(ROOT, `gemini_profile_${workerId + 1}`);
  const downloadsPath = path.join(DIRS.downloads, `w${workerId}`);
  fs.mkdirSync(downloadsPath, { recursive: true });

  log(`Worker ${workerId}: ${jobs.length} job(s), profile=${profileDir}, cutout=${opts.skipCutout ? "OFF" : "ON"}`);

  const supabase = getSupabase();
  const downloadFromSupabasePatched = async (sb, objectPath, dest, bucket) =>
    downloadJob(sb, objectPath, dest, bucket || SOURCE_BUCKET);

  let context = null;
  if (!opts.skipGemini && !opts.dryRun) {
    context = await launchPersistentBrowser(profileDir, downloadsPath);
  }

  try {
    for (let i = 0; i < jobs.length; i += 1) {
      const job = jobs[i];
      log(`\n=== W${workerId} [${i + 1}/${jobs.length}] ${job.id} ===`);
      try {
        const paths = stagingPaths(job);
        fs.mkdirSync(paths.dir, { recursive: true });

        if (opts.skipExisting && fs.existsSync(paths.webp)) {
          log(`SKIP existing ${paths.webp}`);
          appendLog({ event: "skip", id: job.id, worker: workerId });
          continue;
        }
        if (opts.dryRun) {
          log(`DRY-RUN ${job.id}`);
          continue;
        }

        appendLog({ event: "start", id: job.id, worker: workerId });
        await downloadFromSupabasePatched(
          supabase,
          job.sourcePath,
          paths.sourceLocal,
          job.sourceBucket || SOURCE_BUCKET
        );

        let geminiInput = paths.sourceLocal;
        if (!opts.skipGemini) {
          await enhanceOneWithGemini(context, paths.sourceLocal, paths.geminiRaw);
          geminiInput = paths.geminiRaw;
        } else if (fs.existsSync(paths.geminiRaw)) {
          geminiInput = paths.geminiRaw;
        }

        if (opts.skipCutout) {
          log(`Enhance-only (no cutout): ${geminiInput}`);
          await stageEnhancedOnly(geminiInput, paths.webp, paths.preview);
        } else {
          await runPythonCutout(geminiInput, paths.webp, paths.preview);
        }

        try {
          const geminiStage = path.join(
            paths.dir,
            job.stagingName.replace(/\.webp$/i, ".gemini-raw.png")
          );
          if (fs.existsSync(paths.geminiRaw)) fs.copyFileSync(paths.geminiRaw, geminiStage);
        } catch {
          /* non-fatal */
        }

        const meta = {
          id: job.id,
          slug: job.slug,
          index: job.index,
          stagingFile: job.stagingName,
          stagingRel: path.relative(ROOT, paths.webp).replace(/\\/g, "/"),
          previewRel: path.relative(ROOT, paths.preview).replace(/\\/g, "/"),
          originalObjectPath: job.sourcePath,
          uploadPath: job.uploadPath,
          sourceBucket: job.sourceBucket || SOURCE_BUCKET,
          originalName: job.sourceName,
          pipeline: opts.skipCutout
            ? "gemini-playwright-enhance-only"
            : "gemini-playwright+bria-rmbg",
          canvas: { side: 1000, quality: 85 },
          createdAt: new Date().toISOString(),
          worker: workerId,
        };
        fs.writeFileSync(paths.meta, JSON.stringify(meta, null, 2));
        appendLog({ event: "ok", id: job.id, worker: workerId, bytes: fs.statSync(paths.webp).size });
        log(`DONE ${job.id}`);
      } catch (err) {
        log(`FAIL ${job.id}: ${err.message || err}`);
        appendLog({ event: "fail", id: job.id, worker: workerId, error: String(err.message || err) });
      }

      if (i < jobs.length - 1 && !opts.skipGemini) {
        await randomDelay(DELAY_MIN, DELAY_MAX);
      } else if (i < jobs.length - 1) {
        await sleep(500);
      }
    }
  } finally {
    if (context) await context.close().catch(() => {});
  }
}

function chunkJobs(jobs, n) {
  const chunks = Array.from({ length: n }, () => []);
  jobs.forEach((j, i) => chunks[i % n].push(j));
  return chunks;
}

async function main() {
  ensureDirs();
  const opts = parseArgs(process.argv.slice(2));
  log("=== run_batch.mjs ===");
  log(JSON.stringify(opts));

  if (!fs.existsSync(MANIFEST)) {
    throw new Error(`Missing ${MANIFEST} — run: node discover.mjs`);
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  let jobs = manifest.jobs || [];
  if (opts.only) {
    jobs = jobs.filter(
      (j) =>
        j.slug.toLowerCase().includes(opts.only) ||
        j.id.toLowerCase().includes(opts.only) ||
        j.sourcePath.toLowerCase().includes(opts.only)
    );
  }
  if (opts.limit > 0) jobs = jobs.slice(0, opts.limit);

  if (!jobs.length) throw new Error("No jobs to process (check --only / manifest)");

  log(`Queue: ${jobs.length} job(s), workers=${opts.workers}, cutout=${opts.skipCutout ? "OFF" : "ON"}`);
  appendLog({ event: "batch_start", count: jobs.length, workers: opts.workers, skipCutout: opts.skipCutout });

  const chunks = chunkJobs(jobs, opts.workers);
  await Promise.all(chunks.map((chunk, i) => (chunk.length ? workerLoop(i, chunk, opts) : Promise.resolve())));

  appendLog({ event: "batch_end" });
  log("run_batch.mjs finished. Review staging/{slug}/ then move to approved/{slug}/ and run upload.js");
}

main().catch((err) => {
  console.error("\nFATAL:", err.message || err);
  process.exit(1);
});
