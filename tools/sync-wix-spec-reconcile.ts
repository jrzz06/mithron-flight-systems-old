import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { canonicalizeSpecRecord, parseInlineSpecPairs } from "../lib/product-spec-text.ts";
// Note: product-spec-text.ts and its dependencies (product-preview-text.ts,
// wix/semantic-content-parser.ts, wix/catalog-normalize.ts) must only use
// relative imports so this standalone script can run under plain Node.

/**
 * One-time (re-runnable) reconciliation pass for existing Wix-imported products.
 *
 * Existing `specs` JSONB values can disagree with `description`/`source_description`
 * because several independent writers (Wix sync, migration backfills, manual admin
 * edits) touch `specs` and `description` separately. This script re-derives a
 * cleaned `specs` record for every product using the same canonicalization and
 * fallback-parsing logic the storefront uses at read time (see
 * `lib/product-spec-text.ts` and `services/catalog.ts#normalizeSpecs`), then
 * persists it so the fix applies everywhere (admin, exports, storefront) instead
 * of only at render time.
 *
 * Conservative by design:
 * - Never removes an existing non-empty spec value.
 * - Only canonicalizes stray keys (trailing colons, case) and fills gaps for
 *   products with fewer than 3 customer-facing specs, from `source_description`.
 * - Defaults to a dry run; pass --apply to persist changes.
 */

type SpecReconcileDbRow = {
  slug: string;
  name: string | null;
  tagline: string | null;
  description: string | null;
  source_description: string | null;
  source_catalog_id: string | null;
  source_url: string | null;
  category: string | null;
  specs: Record<string, string> | null;
  merge_status: string | null;
};

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const defaultReportPath = join(root, "data", "wix-spec-reconcile-report.json");

const INTERNAL_SPEC_KEYS = new Set(["Product ID", "Source", "Currency", "Category", "Availability"]);

function loadProjectEnv() {
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

function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

async function fetchAllProducts(supabase: ReturnType<typeof createSupabaseAdminClient>) {
  const rows: SpecReconcileDbRow[] = [];
  const pageSize = 200;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("mithron_products")
      .select("slug,name,tagline,description,source_description,source_catalog_id,source_url,category,specs,merge_status")
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Failed to read mithron_products: ${error.message}`);
    if (!data?.length) break;
    rows.push(...(data as SpecReconcileDbRow[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return rows.filter((row) => row.merge_status !== "archived_merged");
}

function countCustomerFacingSpecs(specs: Record<string, string>) {
  return Object.entries(specs).filter(([key, value]) => !INTERNAL_SPEC_KEYS.has(key) && value.trim()).length;
}

function reconcileSpecs(row: SpecReconcileDbRow) {
  const original = row.specs ?? {};
  const canonicalized = canonicalizeSpecRecord(
    Object.fromEntries(Object.entries(original).map(([key, value]) => [key, String(value ?? "")])),
    { preserveKeys: INTERNAL_SPEC_KEYS }
  );

  const reconciled = { ...canonicalized };
  if (countCustomerFacingSpecs(reconciled) < 3) {
    // knownLabelsOnly: true - a persisted write must only add specs matched
    // against a recognized technical label. The loose generic colon-splitting
    // fallback is fine for a transient display-time guess, but too risky to
    // bake into the database permanently for badly-garbled descriptions.
    const parsed = parseInlineSpecPairs(row.source_description ?? row.tagline ?? "", { knownLabelsOnly: true });
    for (const [key, value] of Object.entries(parsed)) {
      if (!reconciled[key]?.trim()) reconciled[key] = value;
    }
  }

  return reconciled;
}

function specsEqual(left: Record<string, string>, right: Record<string, string>) {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key, index) => key === rightKeys[index] && left[key] === right[key]);
}

async function main() {
  const apply = process.argv.includes("--apply");
  const slugFilter = process.argv.find((arg) => arg.startsWith("--slug="))?.split("=")[1];
  const reportPath = process.argv.find((arg) => arg.startsWith("--report="))?.split("=")[1] ?? defaultReportPath;

  loadProjectEnv();

  const supabase = createSupabaseAdminClient();
  const dbRows = await fetchAllProducts(supabase);
  const targets = slugFilter ? dbRows.filter((row) => row.slug === slugFilter) : dbRows;

  const errors: Array<{ slug: string; message: string }> = [];
  const changes: Array<{
    slug: string;
    name: string | null;
    added_keys: string[];
    changed_keys: Array<{ key: string; before: string; after: string }>;
  }> = [];

  for (const row of targets) {
    const before = row.specs ?? {};
    const after = reconcileSpecs(row);
    if (specsEqual(before, after)) continue;

    const addedKeys = Object.keys(after).filter((key) => !(key in before));
    const changedKeys = Object.keys(after)
      .filter((key) => key in before && before[key] !== after[key])
      .map((key) => ({ key, before: before[key] ?? "", after: after[key] }));

    changes.push({ slug: row.slug, name: row.name, added_keys: addedKeys, changed_keys: changedKeys });

    if (apply) {
      const { error } = await supabase
        .from("mithron_products")
        .update({ specs: after, updated_at: new Date().toISOString() })
        .eq("slug", row.slug);

      if (error) errors.push({ slug: row.slug, message: error.message });
    }
  }

  const report = {
    mode: apply ? "APPLIED" : "DRY_RUN",
    generated_at: new Date().toISOString(),
    scanned: targets.length,
    changed: changes.length,
    errors,
    changes
  };

  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        status: report.mode,
        report_path: reportPath,
        scanned: report.scanned,
        changed: report.changed,
        error_count: errors.length,
        sample_changes: changes.slice(0, 10)
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
