import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  buildMigratedProductMediaFields,
  collectExternalProductMediaUrls,
  collectSupabaseProductMediaUrls,
  ingestExternalProductUrl,
  type ProductMediaRow
} from "@/lib/media/ingest-external-product-url";
import { ensureProductMediaLinksForProduct } from "@/lib/product-media-cleanup";

type AdminSupabase = SupabaseClient<any, "public", "public">;

type ProductRow = ProductMediaRow & {
  workflow_status?: string | null;
  is_visible?: boolean | null;
};

export function parseExternalMediaIngestCliArgs(argv: string[]) {
  const args = new Set(argv);
  const slugArg = argv.find((arg) => arg.startsWith("--slug="));
  const limitArg = argv.find((arg) => arg.startsWith("--limit="));
  const parsedLimit = limitArg ? Number(limitArg.slice("--limit=".length)) : 0;
  return {
    apply: args.has("--apply"),
    all: args.has("--all"),
    publishedOnly: args.has("--published-only"),
    slug: slugArg ? slugArg.slice("--slug=".length).trim() : undefined,
    limit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.floor(parsedLimit) : 0
  };
}

async function fetchProducts(
  supabase: AdminSupabase,
  options: ReturnType<typeof parseExternalMediaIngestCliArgs>
) {
  let query = supabase
    .from("mithron_products")
    .select("slug,name,image,hero,gallery,source_images,workflow_status,is_visible")
    .order("sort_order", { ascending: true });

  if (options.publishedOnly) {
    query = query.eq("workflow_status", "published").eq("is_visible", true);
  }

  if (options.slug) {
    query = query.eq("slug", options.slug);
  } else if (options.limit > 0) {
    query = query.limit(options.limit);
  } else if (!options.all) {
    query = query.limit(500);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch products: ${error.message}`);
  return (data ?? []) as ProductRow[];
}

async function migrateProduct(
  supabase: AdminSupabase,
  product: ProductRow,
  options: { apply: boolean; actorId: string | null }
) {
  const externalUrls = collectExternalProductMediaUrls(product);
  const existingSupabaseUrls = collectSupabaseProductMediaUrls(product);

  if (!externalUrls.length) {
    return {
      slug: product.slug,
      status: "skipped" as const,
      reason: "no_external_urls" as const,
      externalUrls: [] as string[]
    };
  }

  if (!options.apply) {
    return {
      slug: product.slug,
      status: "dry_run" as const,
      externalUrls,
      existingSupabaseUrls
    };
  }

  const ingested = [];
  for (let index = 0; index < externalUrls.length; index += 1) {
    ingested.push(await ingestExternalProductUrl({
      sourceUrl: externalUrls[index],
      productSlug: product.slug,
      productName: product.name,
      actorId: options.actorId,
      fileIndex: index
    }));
  }

  const mediaFields = buildMigratedProductMediaFields({
    productName: product.name,
    ingested,
    existingSupabaseUrls
  });

  const { error: updateError } = await supabase
    .from("mithron_products")
    .update({
      ...mediaFields,
      updated_at: new Date().toISOString()
    } as Record<string, unknown>)
    .eq("slug", product.slug);

  if (updateError) {
    throw new Error(`Product update failed for ${product.slug}: ${updateError.message}`);
  }

  const linkResult = await ensureProductMediaLinksForProduct({
    productSlug: product.slug,
    productName: product.name,
    media: mediaFields,
    actorId: options.actorId
  });

  return {
    slug: product.slug,
    status: "ingested" as const,
    externalUrls,
    ingestedCount: ingested.length,
    primaryLinksCreated: linkResult.linked,
    publicUrls: ingested.map((item) => item.publicUrl)
  };
}

export async function runExternalProductMediaIngest(argv: string[]) {
  const options = parseExternalMediaIngestCliArgs(argv);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  if (!options.slug && !options.all && options.limit === 0) {
    throw new Error("Pass --all, --slug=<slug>, or --limit=<n>. Use --apply to write changes.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const products = await fetchProducts(supabase, options);
  const candidates = products.filter((product) => collectExternalProductMediaUrls(product).length > 0);

  if (!candidates.length) {
    return {
      status: "noop" as const,
      message: "No external product images found.",
      processed: 0,
      ingested: 0,
      skipped: 0,
      results: [] as unknown[]
    };
  }

  const results = [];
  for (const product of candidates) {
    results.push(await migrateProduct(supabase, product, { apply: options.apply, actorId: null }));
  }

  return {
    status: options.apply ? "applied" as const : "dry_run" as const,
    processed: results.length,
    ingested: results.filter((result) => result.status === "ingested").length,
    skipped: results.filter((result) => result.status === "skipped").length,
    results
  };
}
