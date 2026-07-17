import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { normalizeProductDescriptionWithAiFallback } from "../lib/product-description-ai-normalize.ts";
import { descriptionPlainText } from "../lib/product-migration/description-audit.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const defaultReportPath = join(root, "data", "product-description-normalize-report.json");

type ProductRow = {
  slug: string;
  name: string;
  description: string | null;
  source_description: string | null;
  merge_status: string | null;
};

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
  const rows: ProductRow[] = [];
  const pageSize = 200;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("mithron_products")
      .select("slug,name,description,source_description,merge_status")
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Failed to read mithron_products: ${error.message}`);
    if (!data?.length) break;
    rows.push(...(data as ProductRow[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return rows.filter((row) => row.merge_status !== "archived_merged");
}

async function normalizeField(value: string | null | undefined, useGemini: boolean) {
  if (!value?.trim()) return { next: null as string | null, changed: false, geminiUsed: false };
  const { html: next, geminiUsed } = await normalizeProductDescriptionWithAiFallback(value, { useGemini });
  if (!next) return { next: null, changed: Boolean(value.trim()), geminiUsed: false };
  const changed = descriptionPlainText(value) !== descriptionPlainText(next);
  return { next, changed, geminiUsed };
}

async function main() {
  loadProjectEnv();
  const apply = process.argv.includes("--apply");
  const useGemini = process.argv.includes("--gemini");
  const reportPath = process.argv.find((arg) => arg.startsWith("--report="))?.slice("--report=".length) ?? defaultReportPath;
  const supabase = createSupabaseAdminClient();
  const rows = await fetchAllProducts(supabase);

  const updates: Array<{
    slug: string;
    name: string;
    description_changed: boolean;
    source_description_changed: boolean;
    gemini_used: boolean;
  }> = [];
  const errors: Array<{ slug: string; message: string }> = [];
  let applied = 0;
  let geminiUsedCount = 0;

  for (const row of rows) {
    try {
      const description = await normalizeField(row.description, useGemini);
      const sourceDescription = await normalizeField(row.source_description, useGemini);
      if (!description.changed && !sourceDescription.changed) continue;

      const geminiUsed = description.geminiUsed || sourceDescription.geminiUsed;
      if (geminiUsed) geminiUsedCount += 1;

      updates.push({
        slug: row.slug,
        name: row.name,
        description_changed: description.changed,
        source_description_changed: sourceDescription.changed,
        gemini_used: geminiUsed
      });

      if (!apply) continue;

      const patch: Record<string, string | null> = {};
      if (description.changed) patch.description = description.next;
      if (sourceDescription.changed) patch.source_description = sourceDescription.next;

      const { error } = await supabase.from("mithron_products").update(patch).eq("slug", row.slug);
      if (error) throw new Error(error.message);
      applied += 1;
    } catch (error) {
      errors.push({
        slug: row.slug,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    mode: apply ? "APPLIED" : "DRY_RUN",
    gemini_enabled: useGemini,
    summary: {
      total_scanned: rows.length,
      candidates: updates.length,
      applied,
      gemini_used: geminiUsedCount,
      errors: errors.length
    },
    updates,
    errors
  };

  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`Report: ${reportPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
