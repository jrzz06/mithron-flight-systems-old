import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { buildPrimaryMediaBackfill } from "../lib/media/backfill-primary-media.ts";

const { loadEnvConfig } = nextEnv;

const PUBLISHED_FILTER = {
  workflow_status: "published",
  is_visible: true
};
const LEGACY_CATEGORY = "Imported Wix Inventory";

export function parseCliArgs(argv: string[]) {
  const args = new Set(argv);
  const limitArg = argv.find((arg) => arg.startsWith("--limit="));
  const parsedLimit = limitArg ? Number(limitArg.slice("--limit=".length)) : 500;
  return {
    apply: args.has("--apply"),
    json: args.has("--json"),
    limit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.floor(parsedLimit) : 500
  };
}

async function fetchPublishedProducts(
  supabase: ReturnType<typeof createClient>,
  limit: number
) {
  const { data, error } = await supabase
    .from("mithron_products")
    .select("slug,name,image")
    .eq("workflow_status", PUBLISHED_FILTER.workflow_status)
    .eq("is_visible", PUBLISHED_FILTER.is_visible)
    .neq("category", LEGACY_CATEGORY)
    .order("sort_order", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch mithron_products: ${error.message}`);
  }

  return data ?? [];
}

async function fetchLinkedPrimarySlugs(supabase: ReturnType<typeof createClient>) {
  const { data, error } = await supabase
    .from("product_media_assets")
    .select("product_slug")
    .eq("usage", "primary")
    .eq("is_primary", true)
    .limit(5000);

  if (error) {
    throw new Error(`Failed to fetch product_media_assets: ${error.message}`);
  }

  return new Set((data ?? []).map((row) => row.product_slug).filter(Boolean));
}

async function applyBackfill(
  supabase: ReturnType<typeof createClient>,
  backfill: ReturnType<typeof buildPrimaryMediaBackfill>
) {
  if (backfill.mediaAssets.length) {
    const { error } = await supabase
      .from("media_assets")
      .upsert(backfill.mediaAssets, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw new Error(`media_assets upsert failed: ${error.message}`);
  }

  if (backfill.productMediaAssets.length) {
    const { error } = await supabase
      .from("product_media_assets")
      .upsert(backfill.productMediaAssets, { onConflict: "product_slug,media_asset_id,usage", ignoreDuplicates: true });
    if (error) throw new Error(`product_media_assets upsert failed: ${error.message}`);
  }

  const { error: logError } = await supabase.from("activity_logs").insert({
    actor_id: null,
    action: "media.primary_backfill",
    entity_table: "product_media_assets",
    entity_id: "mithron_products.image",
    severity: "info",
    metadata: {
      ...backfill.summary,
      skipped_sample: backfill.skipped.slice(0, 10)
    }
  });
  if (logError) throw new Error(`activity_logs insert failed: ${logError.message}`);
}

async function main() {
  loadEnvConfig(process.cwd());
  const options = parseCliArgs(process.argv.slice(2));
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const readKey = serviceRoleKey ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !readKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and a Supabase REST key are required.");
  }
  if (options.apply && !serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for --apply.");
  }

  const supabase = createClient(supabaseUrl, options.apply ? serviceRoleKey : readKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const [products, linkedSlugs] = await Promise.all([
    fetchPublishedProducts(supabase, options.limit),
    fetchLinkedPrimarySlugs(supabase)
  ]);

  const backfill = buildPrimaryMediaBackfill({
    products,
    linkedSlugs,
    supabaseUrl
  });

  if (options.apply) {
    await applyBackfill(supabase, backfill);
  }

  const output = {
    mode: options.apply ? "apply" : "dry-run",
    ...backfill.summary,
    skippedRows: backfill.skipped
  };

  if (options.json) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log(`[primary-media-backfill] ${options.apply ? "applied" : "dry-run"}`);
    console.log(`  candidates: ${output.candidates}`);
    console.log(`  already linked: ${output.linkedSkipped}`);
    console.log(`  media_assets to create: ${output.mediaAssets}`);
    console.log(`  product_media_assets to create: ${output.productMediaLinks}`);
    console.log(`  skipped: ${output.skipped}`);
    if (backfill.skipped.length) {
      console.log(`  skipped sample: ${backfill.skipped.slice(0, 5).map((row) => `${row.slug} (${row.reason})`).join(", ")}`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
