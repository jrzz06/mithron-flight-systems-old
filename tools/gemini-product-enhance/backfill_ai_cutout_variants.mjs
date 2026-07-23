#!/usr/bin/env node
/**
 * Track A backfill: ADD thumbnail + medium WebPs for existing ai-cutout masters.
 * Never deletes masters or other product files.
 *
 * Usage:
 *   node backfill_ai_cutout_variants.mjs --dry-run
 *   node backfill_ai_cutout_variants.mjs --apply
 *   node backfill_ai_cutout_variants.mjs --apply --only=source-soccer-drone
 *   node backfill_ai_cutout_variants.mjs --apply --force   # rewrite even if variants exist
 *   node backfill_ai_cutout_variants.mjs --apply --limit=5
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  BUCKET,
  hasGeneratedVariants,
  uploadCutoutVariants,
} from "./ai_cutout_variants.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", ".env.local") });
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

const RUN_LOG = path.join(__dirname, "backfill-ai-cutout-variants-log.jsonl");
const PAGE = 200;

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (n) => {
    const hit = args.find((a) => a.startsWith(`--${n}=`));
    return hit ? hit.slice(n.length + 3) : null;
  };
  return {
    apply: args.includes("--apply"),
    dryRun: !args.includes("--apply"),
    force: args.includes("--force"),
    only: (get("only") || "").trim(),
    limit: Number(get("limit") || 0) || 0,
  };
}

function log(...a) {
  console.log(`[${new Date().toISOString()}]`, ...a);
}

function appendLog(entry) {
  fs.appendFileSync(RUN_LOG, JSON.stringify({ ...entry, at: new Date().toISOString() }) + "\n");
}

async function listAiCutoutAssets(supabase, { only }) {
  const rows = [];
  let from = 0;
  for (;;) {
    let q = supabase
      .from("media_assets")
      .select("id,storage_path,public_url,width,height,responsive_variants,mime_type")
      .eq("bucket", BUCKET)
      .like("storage_path", "%/ai-cutout/%")
      .not("storage_path", "like", "%.thumbnail.webp")
      .not("storage_path", "like", "%.medium.webp")
      .order("storage_path", { ascending: true })
      .range(from, from + PAGE - 1);
    if (only) {
      q = q.ilike("storage_path", `%${only}%`);
    }
    const { data, error } = await q;
    if (error) throw new Error(`list media_assets: ${error.message}`);
    if (!data?.length) break;
    // Masters only — skip any accidental variant rows stored as media_assets
    for (const row of data) {
      const p = row.storage_path || "";
      if (/\.(thumbnail|medium|large|xlarge|ultra)\.webp$/i.test(p)) continue;
      if (!p.endsWith(".webp")) continue;
      rows.push(row);
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

async function downloadMaster(supabase, storagePath) {
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error || !data) throw new Error(`download failed ${storagePath}: ${error?.message || "empty"}`);
  const ab = await data.arrayBuffer();
  return Buffer.from(ab);
}

async function backfillOne(supabase, urlBase, row, { dryRun, force }) {
  if (!force && hasGeneratedVariants(row.responsive_variants)) {
    return { skipped: true, reason: "already-has-variants", id: row.id, path: row.storage_path };
  }

  if (dryRun) {
    return {
      dryRun: true,
      id: row.id,
      path: row.storage_path,
      wouldUpload: [
        row.storage_path.replace(/\.webp$/i, ".thumbnail.webp"),
        row.storage_path.replace(/\.webp$/i, ".medium.webp"),
      ],
    };
  }

  const buf = await downloadMaster(supabase, row.storage_path);
  if (buf.byteLength < 1024) throw new Error(`tiny master ${row.storage_path}`);

  const { variants, responsiveVariants } = await uploadCutoutVariants(supabase, urlBase, {
    masterStoragePath: row.storage_path,
    masterBuf: buf,
    masterWidth: row.width ?? 1000,
    masterHeight: row.height ?? 1000,
    masterPublicUrl: row.public_url,
  });

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("media_assets")
    .update({
      responsive_variants: responsiveVariants,
      updated_at: now,
    })
    .eq("id", row.id);
  if (error) throw new Error(`media_assets update ${row.id}: ${error.message}`);

  return {
    ok: true,
    id: row.id,
    path: row.storage_path,
    variants: variants.map((v) => ({ path: v.storagePath, bytes: v.sizeBytes })),
  };
}

async function main() {
  const opts = parseArgs();
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  const urlBase = url.replace(/\/$/, "");
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let rows = await listAiCutoutAssets(supabase, { only: opts.only });
  if (opts.limit > 0) rows = rows.slice(0, opts.limit);
  if (!rows.length) throw new Error("No ai-cutout masters found");

  log(
    `=== backfill_ai_cutout_variants mode=${opts.dryRun ? "DRY_RUN" : "APPLY"} force=${opts.force} rows=${rows.length} ===`
  );
  appendLog({ event: "start", mode: opts.dryRun ? "dry" : "apply", count: rows.length });

  let ok = 0;
  let skip = 0;
  let fail = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    log(`[${i + 1}/${rows.length}] ${row.storage_path}`);
    try {
      const result = await backfillOne(supabase, urlBase, row, opts);
      if (result.skipped) {
        log(`  SKIP ${result.reason}`);
        skip++;
      } else if (result.dryRun) {
        log(`  DRY would upload ${result.wouldUpload.join(", ")}`);
        ok++;
      } else {
        log(`  OK variants=${result.variants.map((v) => v.path).join(" | ")}`);
        ok++;
      }
      appendLog({ event: result.skipped ? "skip" : opts.dryRun ? "dry" : "ok", ...result });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`  FAIL ${msg}`);
      appendLog({ event: "fail", id: row.id, path: row.storage_path, error: msg });
      fail++;
    }
  }

  log(`\nDone. ok=${ok} skip=${skip} fail=${fail}`);
  appendLog({ event: "end", ok, skip, fail });
  process.exitCode = fail ? 2 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
