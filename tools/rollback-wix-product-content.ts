import { existsSync, readdirSync } from "node:fs";
import { basename } from "node:path";
import {
  createSupabaseAdminClient,
  loadProjectEnv
} from "../lib/wix-content-migration/runner.ts";
import { readProductContentBackup, restoreProductContentBackup } from "../lib/wix-content-migration/backup.ts";
import { backupsDir } from "../lib/wix-content-migration/paths.ts";

function parseArgs(argv: string[]) {
  const getValue = (prefix: string) => {
    const hit = argv.find((arg) => arg.startsWith(prefix));
    return hit ? hit.slice(prefix.length).trim() : null;
  };
  return {
    runId: getValue("--run-id="),
    slug: getValue("--slug="),
    help: argv.includes("--help") || argv.includes("-h")
  };
}

function printHelp() {
  console.log(`Rollback Wix content migration from file backups

Usage:
  npm run products:migrate-wix-content:rollback -- --run-id=<id> [--slug=<slug>]

Restores description, description_json, specs, image/hero/gallery, and
primary/gallery product_media_assets from data/wix-content-migration/backups/<runId>/.
`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  if (!options.runId) {
    throw new Error("--run-id=<id> is required");
  }

  loadProjectEnv();
  const supabase = createSupabaseAdminClient();
  const dir = backupsDir(options.runId);
  if (!existsSync(dir)) {
    throw new Error(`Backup directory not found: ${dir}`);
  }

  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .filter((name) => !options.slug || basename(name, ".json") === options.slug);

  if (!files.length) {
    throw new Error(options.slug ? `No backup for slug ${options.slug}` : "No backup files found");
  }

  const results: Array<{ slug: string; status: "restored" | "failed"; error?: string }> = [];

  for (const file of files) {
    const slug = basename(file, ".json");
    const backup = readProductContentBackup(options.runId, slug);
    if (!backup) {
      results.push({ slug, status: "failed", error: "backup_missing" });
      continue;
    }
    try {
      await restoreProductContentBackup(supabase, backup);
      results.push({ slug, status: "restored" });
      console.log(`restored ${slug}`);
    } catch (error) {
      results.push({
        slug,
        status: "failed",
        error: error instanceof Error ? error.message : String(error)
      });
      console.error(`failed ${slug}: ${error instanceof Error ? error.message : error}`);
    }
  }

  const failed = results.filter((item) => item.status === "failed").length;
  console.log(JSON.stringify({
    run_id: options.runId,
    restored: results.filter((item) => item.status === "restored").length,
    failed,
    results
  }, null, 2));

  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
