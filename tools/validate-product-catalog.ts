import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { isWixStaticUrl } from "../lib/media/is-blocked-external-media-url.ts";
import { normalizeCatalogName } from "../lib/wix/catalog-normalize.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadProjectEnv() {
  for (const envPath of [join(root, ".env.local"), join(root, ".env")]) {
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

function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

async function main() {
  loadProjectEnv();
  const supabase = createSupabaseAdminClient();

  const { data: products, error } = await supabase
    .from("mithron_products")
    .select("slug,name,category,price,is_visible,workflow_status,merge_status,merged_into_slug,image")
    .eq("workflow_status", "published")
    .eq("is_visible", true);

  if (error) throw new Error(error.message);

  const visible = (products ?? []).filter((row) => row.merge_status !== "archived_merged");
  const nameBuckets = new Map<string, string[]>();
  const issues: string[] = [];

  for (const row of visible) {
    const key = `${row.category ?? "unknown"}::${normalizeCatalogName(row.name)}`;
    const list = nameBuckets.get(key) ?? [];
    list.push(row.slug);
    nameBuckets.set(key, list);
  }

  for (const [key, slugs] of nameBuckets) {
    if (slugs.length > 1) issues.push(`duplicate_visible_name:${key}:${slugs.join(",")}`);
  }

  for (const row of visible) {
    const src = (row.image as { src?: string } | null)?.src ?? "";
    if (!src.trim() || /placeholder|broken/i.test(src)) {
      issues.push(`broken_image:${row.slug}`);
    }
    if (isWixStaticUrl(src)) {
      issues.push(`wix_image:${row.slug}`);
    }
    if (Number(row.price) === 0) {
      issues.push(`zero_price_visible:${row.slug}`);
    }
  }

  const { data: orphanedStock } = await supabase
    .from("warehouse_stock")
    .select("product_slug")
    .in(
      "product_slug",
      (products ?? []).filter((row) => row.merge_status === "archived_merged").map((row) => row.slug)
    );

  if ((orphanedStock ?? []).length) {
    issues.push(`warehouse_stock_on_archived:${orphanedStock!.map((row) => row.product_slug).join(",")}`);
  }

  const reportPath = join(root, "data", "product-reconcile-report.json");
  let wixVisible = null;
  if (existsSync(reportPath)) {
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    wixVisible = report.summary?.wix_count ?? null;
  }

  const status = issues.length ? "FAILED" : "PASSED";
  console.log(
    JSON.stringify(
      {
        status,
        visiblePublishedCount: visible.length,
        wixVisibleCount: wixVisible,
        issueCount: issues.length,
        issues: issues.slice(0, 50)
      },
      null,
      2
    )
  );

  if (issues.length) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
