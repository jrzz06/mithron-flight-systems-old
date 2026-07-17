import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type AdminSupabase = SupabaseClient<any, "public", "public">;
type PrimaryMediaLink = { media_asset_id: string | null };
type MediaAssetRow = { public_url: string | null };
type ProductRow = {
  slug: string;
  name: string | null;
  category: string | null;
  image: unknown;
  workflow_status: string | null;
  is_visible: boolean | null;
};
type CutoutLinkRow = { product_slug: string | null };
import { readMediaSrc } from "@/lib/media/read-media-src";
import { downloadImageBuffer, uploadCatalogCutout } from "@/lib/media/upload-catalog-cutout";

const CUTOUT_VARIANT_ID = "catalog-cutout-v1";
const LEGACY_CATEGORY = "Imported Wix Inventory";

export type BackfillCatalogCutoutsOptions = {
  apply?: boolean;
  slug?: string;
  category?: string;
  limit?: number;
  publishedOnly?: boolean;
};

export type BackfillCatalogCutoutsReport = {
  status: "noop" | "dry_run" | "applied";
  productCount: number;
  missingCutoutCount: number;
  processed: number;
  skipped: number;
  rejected: number;
  results: Array<{
    slug: string;
    name: string;
    outcome: string;
    detail?: string;
  }>;
};

export function parseBackfillCatalogCutoutsCliArgs(argv: string[]): BackfillCatalogCutoutsOptions {
  const args = new Set(argv);
  const slugArg = argv.find((arg) => arg.startsWith("--slug="));
  const categoryArg = argv.find((arg) => arg.startsWith("--category="));
  const limitArg = argv.find((arg) => arg.startsWith("--limit="));
  const parsedLimit = limitArg ? Number(limitArg.slice("--limit=".length)) : 0;

  return {
    apply: args.has("--apply"),
    slug: slugArg ? slugArg.slice("--slug=".length).trim() : undefined,
    category: categoryArg ? categoryArg.slice("--category=".length).trim() : undefined,
    limit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.floor(parsedLimit) : 0,
    publishedOnly: !args.has("--all")
  };
}

async function fetchPrimaryImageUrl(
  supabase: AdminSupabase,
  slug: string,
  rowImage: unknown
) {
  const { data: primaryLinks, error } = await supabase
    .from("product_media_assets")
    .select("media_asset_id")
    .eq("product_slug", slug)
    .eq("usage", "primary")
    .eq("is_primary", true)
    .limit(1);

  if (error) throw new Error(error.message);

  const mediaAssetId = (primaryLinks as PrimaryMediaLink[] | null)?.[0]?.media_asset_id;
  if (mediaAssetId) {
    const { data: mediaRows, error: mediaError } = await supabase
      .from("media_assets")
      .select("public_url")
      .eq("id", mediaAssetId)
      .limit(1);
    if (mediaError) throw new Error(mediaError.message);
    const publicUrl = (mediaRows as MediaAssetRow[] | null)?.[0]?.public_url;
    if (typeof publicUrl === "string" && publicUrl.trim()) return publicUrl.trim();
  }

  return readMediaSrc(rowImage);
}

export async function runBackfillCatalogCutouts(
  argv: string[] = [],
  env: NodeJS.ProcessEnv = process.env
): Promise<BackfillCatalogCutoutsReport> {
  const options = parseBackfillCatalogCutoutsCliArgs(argv);
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  let productQuery = supabase
    .from("mithron_products")
    .select("slug,name,category,image,workflow_status,is_visible")
    .order("sort_order", { ascending: true });

  if (options.publishedOnly) {
    productQuery = productQuery.eq("workflow_status", "published").eq("is_visible", true);
  }

  productQuery = productQuery.neq("category", LEGACY_CATEGORY);

  if (options.slug) {
    productQuery = productQuery.eq("slug", options.slug);
  }

  if (options.category) {
    productQuery = productQuery.ilike("category", `%${options.category}%`);
  }

  const limit = options.limit ?? 0;
  if (limit > 0) {
    productQuery = productQuery.limit(limit);
  }

  const { data: products, error: productError } = await productQuery;
  if (productError) throw new Error(productError.message);

  const rows = (products ?? []) as ProductRow[];
  const slugs = rows.map((row) => row.slug).filter(Boolean);

  const { data: cutoutLinks, error: cutoutError } = await supabase
    .from("product_media_assets")
    .select("product_slug")
    .eq("usage", "cms")
    .eq("variant_id", CUTOUT_VARIANT_ID)
    .in("product_slug", slugs.length ? slugs : ["__none__"]);
  if (cutoutError) throw new Error(cutoutError.message);

  const linkedCutoutSlugs = new Set((cutoutLinks ?? []).map((link) => link.product_slug));
  const missing = rows.filter((row) => row.slug && !linkedCutoutSlugs.has(row.slug));

  const report: BackfillCatalogCutoutsReport = {
    status: options.apply ? "applied" : missing.length ? "dry_run" : "noop",
    productCount: rows.length,
    missingCutoutCount: missing.length,
    processed: 0,
    skipped: 0,
    rejected: 0,
    results: []
  };

  if (!missing.length) return report;

  for (const product of missing) {
    const slug = product.slug;
    const name = product.name ?? slug;

    try {
      const primaryUrl = await fetchPrimaryImageUrl(supabase, slug, product.image);
      if (!primaryUrl || !primaryUrl.includes(".supabase.co/storage/v1/object/public/")) {
        report.skipped += 1;
        report.results.push({ slug, name, outcome: "skipped", detail: "missing_primary_supabase_url" });
        continue;
      }

      if (!options.apply) {
        report.processed += 1;
        report.results.push({ slug, name, outcome: "dry_run", detail: primaryUrl });
        continue;
      }

      const { buffer, mimeType } = await downloadImageBuffer(primaryUrl);
      const result = await uploadCatalogCutout({
        productSlug: slug,
        productName: name,
        sourceBuffer: buffer,
        sourceMimeType: mimeType,
        apply: true
      });

      if (result.status === "applied") {
        report.processed += 1;
        report.results.push({
          slug,
          name,
          outcome: "applied",
          detail: result.publicUrl
        });
      } else if (result.status === "rejected") {
        report.rejected += 1;
        report.results.push({ slug, name, outcome: "rejected", detail: result.reason });
      } else {
        report.skipped += 1;
        report.results.push({
          slug,
          name,
          outcome: result.status,
          detail: result.status === "skipped" ? result.reason : undefined
        });
      }
    } catch (error) {
      report.rejected += 1;
      report.results.push({
        slug,
        name,
        outcome: "error",
        detail: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return report;
}
