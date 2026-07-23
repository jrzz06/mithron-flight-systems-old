import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fetchWixCatalog, loadWixClientFromEnv, type WixCatalogSnapshot } from "../wix/catalog-client.ts";
import { buildPhase1AnalysisReport } from "./analysis.ts";
import { applyProductContentDryRunPreview, applyProductContentMigration } from "./apply.ts";
import {
  createCheckpoint,
  isSlugAlreadyMigrated,
  markCheckpointFailure,
  markCheckpointSuccess,
  readCheckpoint
} from "./checkpoint.ts";
import { parseMigrateCliArgs, printMigrationHelp, type MigrateCliOptions } from "./cli.ts";
import { validateAndDownloadImages } from "./images.ts";
import { matchProductForContentMigration } from "./match.ts";
import { assertNonEmptyContent, overviewContainsHtmlTable, parseWixProductContent } from "./parse-content.ts";
import {
  contentFingerprint,
  createRunId,
  defaultWixSnapshotPath,
  reportPath
} from "./paths.ts";
import { buildMigrationReport, printReportSummary, writeMigrationReport } from "./report.ts";
import type { CheckpointState, ContentMigrationDbRow, ProductMigrationLog } from "./types.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function loadProjectEnv() {
  for (const envPath of [join(root, ".env.local"), join(root, ".env")]) {
    if (!existsSync(envPath)) continue;
    const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const eq = trimmed.indexOf("=");
      const name = trimmed.slice(0, eq);
      if (!name || process.env[name]) continue;
      process.env[name] = trimmed.slice(eq + 1).replace(/^["']|["']$/g, "");
    }
  }
}

export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

export async function fetchMigrationProducts(supabase: SupabaseClient) {
  const rows: ContentMigrationDbRow[] = [];
  const pageSize = 200;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("mithron_products")
      .select(
        "slug,name,description,description_json,source_description,source_catalog_id,source_url,source_fingerprint,source_images,image,hero,gallery,specs,merge_status,workflow_status,is_visible,price,category"
      )
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Failed to read mithron_products: ${error.message}`);
    if (!data?.length) break;
    rows.push(...(data as ContentMigrationDbRow[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return rows.filter((row) => row.merge_status !== "archived_merged");
}

async function loadWixCatalog(options: MigrateCliOptions): Promise<WixCatalogSnapshot> {
  const wixPath = options.wixPath ?? defaultWixSnapshotPath();

  if (options.refreshWix) {
    const client = loadWixClientFromEnv();
    const snapshot = await fetchWixCatalog(client);
    mkdirSync(dirname(wixPath), { recursive: true });
    writeFileSync(wixPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    return snapshot;
  }

  if (!existsSync(wixPath)) {
    throw new Error(`Wix snapshot not found at ${wixPath}. Run with --refresh-wix or npm run products:fetch-wix`);
  }

  return JSON.parse(readFileSync(wixPath, "utf8")) as WixCatalogSnapshot;
}

function chunk<T>(items: T[], size: number) {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

export async function runWixContentMigration(argv: string[]) {
  const options = parseMigrateCliArgs(argv);
  if (options.help) {
    printMigrationHelp();
    return { status: "help" as const };
  }

  loadProjectEnv();

  if (options.apply && options.confirm !== "MIGRATE") {
    throw new Error("Live migration requires --apply and --confirm=MIGRATE");
  }

  if (options.analyze && options.apply) {
    throw new Error("Use either --analyze or --apply, not both.");
  }

  const mode = options.apply ? "APPLIED" : "DRY_RUN";
  const runId = options.resume || options.runId || createRunId();
  const supabase = createSupabaseAdminClient();
  const wixCatalog = await loadWixCatalog(options);
  let dbRows = await fetchMigrationProducts(supabase);

  if (options.slug) {
    dbRows = dbRows.filter((row) => row.slug === options.slug);
  }
  if (options.limit > 0) {
    dbRows = dbRows.slice(0, options.limit);
  }

  if (options.analyze) {
    const report = buildPhase1AnalysisReport({ runId, wixCatalog, dbRows });
    const outPath = reportPath(runId, "analysis");
    writeMigrationReport(outPath, report);
    printReportSummary(report);
    console.log(`report=${outPath}`);
    return { status: "analysis" as const, report, runId, reportPath: outPath };
  }

  const existingCheckpoint = readCheckpoint(runId);
  let checkpoint: CheckpointState = existingCheckpoint
    ?? createCheckpoint({ runId, mode, batchSize: options.batchSize });

  if (options.resume && !existingCheckpoint) {
    console.warn(`No checkpoint found for ${runId}; starting a fresh checkpoint with that run id.`);
  }

  if (existingCheckpoint && existingCheckpoint.mode === "DRY_RUN" && options.apply) {
    checkpoint = {
      ...existingCheckpoint,
      mode: "APPLIED",
      batch_size: options.batchSize
    };
  }

  const logs: ProductMigrationLog[] = [];
  const batches = chunk(dbRows, options.batchSize);

  for (const batch of batches) {
    for (const row of batch) {
      const match = matchProductForContentMigration(row, wixCatalog.products);
      if ("error" in match) {
        logs.push({
          slug: row.slug,
          wix_slug: null,
          wix_product_id: null,
          status: "skipped",
          reason: match.error,
          missing_images: true,
          missing_description: true
        });
        continue;
      }

      const payload = parseWixProductContent(match.wix);
      if (overviewContainsHtmlTable(payload.overview)) {
        logs.push({
          slug: row.slug,
          wix_slug: match.wix.wix_slug,
          wix_product_id: match.wix.wix_product_id,
          status: "failed",
          reason: "overview_contains_table",
          confidence: match.confidence,
          error: "Sanitized overview still contains an HTML table"
        });
        checkpoint = markCheckpointFailure(checkpoint, row.slug);
        if (!options.continueOnError) break;
        continue;
      }

      const contentFlags = assertNonEmptyContent(payload);
      const missingImages = !contentFlags.hasImages;
      const missingDescription = !contentFlags.hasOverview;

      // Force-replace whatever Wix provides. Skip only when both description and images are empty/invalid.
      if (!contentFlags.hasOverview && !contentFlags.hasImages) {
        logs.push({
          slug: row.slug,
          wix_slug: match.wix.wix_slug,
          wix_product_id: match.wix.wix_product_id,
          status: "skipped",
          reason: "empty_wix_content",
          confidence: match.confidence,
          missing_images: missingImages,
          missing_description: missingDescription,
          image_count: payload.images.length,
          spec_count: payload.specifications.length,
          overview_chars: payload.overview.replace(/<[^>]+>/g, " ").trim().length
        });
        continue;
      }

      const fingerprint = contentFingerprint({
        wixProductId: match.wix.wix_product_id,
        overviewHtml: payload.overview,
        specs: payload.specifications,
        imageUrls: payload.images.map((image) => image.url)
      });

      if (isSlugAlreadyMigrated(checkpoint, row.slug, fingerprint)) {
        logs.push({
          slug: row.slug,
          wix_slug: match.wix.wix_slug,
          wix_product_id: match.wix.wix_product_id,
          status: "skipped",
          reason: "already_migrated_fingerprint",
          confidence: match.confidence,
          fingerprint,
          image_count: payload.images.length,
          spec_count: payload.specifications.length,
          overview_chars: payload.overview.replace(/<[^>]+>/g, " ").trim().length,
          missing_images: missingImages,
          missing_description: missingDescription
        });
        continue;
      }

      try {
        const downloadResult = payload.images.length
          ? await validateAndDownloadImages(payload.images)
          : { valid: [], invalid: [] as Array<{ url: string; reason: string }> };
        const { valid, invalid } = downloadResult;

        if (payload.images.length && !valid.length && !contentFlags.hasOverview) {
          logs.push({
            slug: row.slug,
            wix_slug: match.wix.wix_slug,
            wix_product_id: match.wix.wix_product_id,
            status: "skipped",
            reason: "all_images_invalid",
            confidence: match.confidence,
            missing_images: true,
            missing_description: missingDescription,
            error: invalid.map((item) => `${item.url}:${item.reason}`).slice(0, 3).join("; ")
          });
          continue;
        }

        // If images failed but description exists, still replace description (and specs).
        if (payload.images.length && !valid.length && contentFlags.hasOverview) {
          console.warn(
            `[${row.slug}] all ${payload.images.length} Wix image(s) failed validation; replacing description only. ${invalid
              .map((item) => item.reason)
              .slice(0, 2)
              .join("; ")}`
          );
        }

        if (!options.apply) {
          applyProductContentDryRunPreview({
            wix: match.wix,
            payload,
            validatedImages: valid
          });
          logs.push({
            slug: row.slug,
            wix_slug: match.wix.wix_slug,
            wix_product_id: match.wix.wix_product_id,
            status: "dry_run",
            confidence: match.confidence,
            fingerprint,
            image_count: valid.length,
            spec_count: payload.specifications.length,
            overview_chars: payload.overview.replace(/<[^>]+>/g, " ").trim().length,
            missing_images: missingImages || (payload.images.length > 0 && valid.length === 0),
            missing_description: missingDescription
          });
          continue;
        }

        await applyProductContentMigration({
          supabase,
          row,
          wix: match.wix,
          payload,
          validatedImages: valid,
          runId
        });

        logs.push({
          slug: row.slug,
          wix_slug: match.wix.wix_slug,
          wix_product_id: match.wix.wix_product_id,
          status: "migrated",
          confidence: match.confidence,
          fingerprint,
          image_count: valid.length,
          spec_count: payload.specifications.length,
          overview_chars: payload.overview.replace(/<[^>]+>/g, " ").trim().length,
          missing_images: missingImages || (payload.images.length > 0 && valid.length === 0),
          missing_description: missingDescription
        });
        checkpoint = markCheckpointSuccess(checkpoint, row.slug, fingerprint);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logs.push({
          slug: row.slug,
          wix_slug: match.wix.wix_slug,
          wix_product_id: match.wix.wix_product_id,
          status: "failed",
          reason: "apply_failed",
          confidence: match.confidence,
          fingerprint,
          error: message
        });
        checkpoint = markCheckpointFailure(checkpoint, row.slug);
        if (!options.continueOnError) break;
      }
    }

    if (!options.continueOnError && logs.some((item) => item.status === "failed")) {
      break;
    }
  }

  const report = buildMigrationReport({ runId, mode, products: logs });
  const outPath = reportPath(runId, options.apply ? "applied" : "dry-run");
  writeMigrationReport(outPath, report);
  printReportSummary(report);
  console.log(`report=${outPath}`);

  return { status: options.apply ? "applied" as const : "dry_run" as const, report, runId, reportPath: outPath };
}
