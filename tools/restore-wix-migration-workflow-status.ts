/**
 * Restore workflow_status from Wix content migration backups.
 * Does NOT touch images/descriptions — only undoes pending_review supplier queue.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import type { ProductContentBackup } from "../lib/wix-content-migration/types.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const runId = process.argv.find((arg) => arg.startsWith("--run-id="))?.slice("--run-id=".length)
  || "wix-content-2026-07-22T14-56-16-197Z";

function loadEnv() {
  for (const envPath of [join(root, ".env.local"), join(root, ".env")]) {
    if (!existsSync(envPath)) continue;
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const eq = trimmed.indexOf("=");
      const name = trimmed.slice(0, eq);
      if (!name || process.env[name]) continue;
      process.env[name] = trimmed.slice(eq + 1).replace(/^["']|["']$/g, "");
    }
  }
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const dir = join(root, "data", "wix-content-migration", "backups", runId);
  if (!existsSync(dir)) throw new Error(`Backup dir missing: ${dir}`);

  const files = readdirSync(dir).filter((name) => name.endsWith(".json"));
  let restored = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of files) {
    const slug = basename(file, ".json");
    const backup = JSON.parse(readFileSync(join(dir, file), "utf8")) as ProductContentBackup;
    const previous = backup.product.workflow_status || "published";

    const { error } = await supabase
      .from("mithron_products")
      .update({
        workflow_status: previous,
        updated_at: new Date().toISOString()
      })
      .eq("slug", slug)
      .eq("workflow_status", "pending_review");

    if (error) {
      failed += 1;
      console.error(`failed ${slug}: ${error.message}`);
      continue;
    }
    restored += 1;
  }

  const { count: remaining } = await supabase
    .from("mithron_products")
    .select("slug", { count: "exact", head: true })
    .eq("workflow_status", "pending_review");

  console.log(JSON.stringify({
    run_id: runId,
    backups: files.length,
    restored,
    skipped,
    failed,
    pending_review_remaining: remaining ?? 0
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
