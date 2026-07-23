import { readdirSync, existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  createSupabaseAdminClient,
  loadProjectEnv
} from "../lib/wix-content-migration/runner.ts";
import { backupsDir } from "../lib/wix-content-migration/paths.ts";
import {
  CUTOUT_VARIANT_ID,
  MIGRATION_BACKUP_VARIANT_ID,
  type ProductContentBackup
} from "../lib/wix-content-migration/types.ts";

function parseArgs(argv: string[]) {
  const getValue = (prefix: string) => {
    const hit = argv.find((arg) => arg.startsWith(prefix));
    return hit ? hit.slice(prefix.length).trim() : null;
  };
  return {
    runId: getValue("--run-id="),
    slug: getValue("--slug="),
    confirm: getValue("--confirm="),
    dryRun: !argv.includes("--apply"),
    help: argv.includes("--help") || argv.includes("-h")
  };
}

function printHelp() {
  console.log(`Approve deletion of archived cutout / pre-migration display media

CRITICAL: Only run after manual verification of every migrated product.

Usage:
  # Preview what would be deleted (default)
  npm run products:migrate-wix-content:approve-delete-cutouts -- --run-id=<id>

  # Unlink archived cms backup/cutout rows (does not touch Wix primary/gallery)
  npm run products:migrate-wix-content:approve-delete-cutouts -- --run-id=<id> --apply --confirm=DELETE_CUTOUTS [--slug=<slug>]

Storage cutout files are intentionally retained until a separate orphan cleanup.
`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  if (!options.runId) throw new Error("--run-id=<id> is required");
  if (!options.dryRun && options.confirm !== "DELETE_CUTOUTS") {
    throw new Error("Live cutout deletion requires --apply and --confirm=DELETE_CUTOUTS");
  }

  loadProjectEnv();
  const supabase = createSupabaseAdminClient();
  const dir = backupsDir(options.runId);
  if (!existsSync(dir)) throw new Error(`Backup directory not found: ${dir}`);

  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .filter((name) => !options.slug || basename(name, ".json") === options.slug);

  const results: Array<{ slug: string; unlinked: number; status: string; backup_media_links: number }> = [];

  for (const file of files) {
    const slug = basename(file, ".json");
    const backup = JSON.parse(readFileSync(join(dir, file), "utf8")) as ProductContentBackup;

    const { data: links, error } = await supabase
      .from("product_media_assets")
      .select("media_asset_id,usage,variant_id")
      .eq("product_slug", slug)
      .eq("usage", "cms")
      .in("variant_id", [CUTOUT_VARIANT_ID, MIGRATION_BACKUP_VARIANT_ID]);

    if (error) throw new Error(error.message);

    const targets = links ?? [];
    if (!options.dryRun) {
      const { error: deleteError } = await supabase
        .from("product_media_assets")
        .delete()
        .eq("product_slug", slug)
        .eq("usage", "cms")
        .in("variant_id", [CUTOUT_VARIANT_ID, MIGRATION_BACKUP_VARIANT_ID]);
      if (deleteError) throw new Error(deleteError.message);
    }

    results.push({
      slug,
      unlinked: targets.length,
      status: options.dryRun ? "dry_run" : "unlinked",
      backup_media_links: backup.media_links.length
    });
    console.log(`${options.dryRun ? "would unlink" : "unlinked"} ${slug}: ${targets.length} archived cms link(s)`);
  }

  console.log(JSON.stringify({
    run_id: options.runId,
    mode: options.dryRun ? "DRY_RUN" : "APPLIED",
    note: "Storage cutout files are retained until a separate orphan cleanup. Primary/gallery Wix originals are untouched.",
    results
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
