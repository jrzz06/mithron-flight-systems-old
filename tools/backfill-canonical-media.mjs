import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { pathToFileURL } from "node:url";

const { loadEnvConfig } = nextEnv;

const DEFAULT_FETCH_LIMIT = 1000;
const BACKFILL_VERSION = 1;

const writableCanonicalTables = ["media_assets", "product_media_assets", "activity_logs"];

export const PRODUCT_SOURCE_ALIASES = Object.freeze({
  aeroFcNamoAgCore: "source-ag-fc-namoag-gps-with-aerogcs-green-software-combo",
  ag10Sprayer: "source-10l-drone-with-6-nozzle-system-tc-certified",
  agri16L: "source-16-liters-agri-drone-tc-with-pilot-license",
  agriKisan10L: "source-agri-kisan-drone-medium-10-liter",
  agriKisan8L: "source-agri-kisan-drone-small-8-liter",
  batteryKit: "source-6s-24000mah-battery",
  decaflyD5X: "source-drone-decafly-d5x",
  deliveryDrone: "source-flybox-delivery-drone",
  droneSoccer150: "source-drone-soccer-150-mm",
  droneSoccer200: "source-drone-soccer-200-mm",
  dualPayload: "source-dual-purpose-drone",
  safetySecurity10L: "source-10l-drone-with-safety-security",
  siyiMk32: "source-siyi-mk-32-agriculture-transmitter-rc-controller-hdmi",
  surveyMapper: "source-10x-seeker-optical-zoom-cmera-survey-drone",
  surveillancePlatform: "source-mini-x-nano-4k-videography-drone"
});

function normalizeTags(values) {
  const seen = new Set();
  return values
    .flatMap((value) => String(value ?? "").split(/[\s,./_]+/g))
    .map((value) => value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, ""))
    .filter(Boolean)
    .filter((value) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}

function humanize(value) {
  return String(value ?? "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toPositiveInteger(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

function toNonNegativeBytes(kilobytes) {
  const parsed = Number(kilobytes);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 1024) : 0;
}

function buildProductIndexes(products) {
  const bySlug = new Map();
  const bySourceCatalogId = new Map();

  for (const product of products) {
    const slug = typeof product.slug === "string" ? product.slug.trim() : "";
    if (!slug) continue;
    bySlug.set(slug, product);

    const sourceCatalogId = typeof product.source_catalog_id === "string" ? product.source_catalog_id.trim() : "";
    if (sourceCatalogId) {
      bySourceCatalogId.set(sourceCatalogId, product);
    }
  }

  return { bySlug, bySourceCatalogId };
}

function resolveProductForAsset(asset, indexes) {
  const directSlug = typeof asset.product_slug === "string" ? asset.product_slug.trim() : "";
  if (directSlug && indexes.bySlug.has(directSlug)) {
    return {
      product: indexes.bySlug.get(directSlug),
      reason: "product_slug"
    };
  }

  const sourceCatalogId = typeof asset.source_catalog_id === "string" ? asset.source_catalog_id.trim() : "";
  if (sourceCatalogId && indexes.bySourceCatalogId.has(sourceCatalogId)) {
    return {
      product: indexes.bySourceCatalogId.get(sourceCatalogId),
      reason: "source_catalog_id"
    };
  }

  const aliasSlug = PRODUCT_SOURCE_ALIASES[sourceCatalogId];
  if (aliasSlug && indexes.bySlug.has(aliasSlug)) {
    return {
      product: indexes.bySlug.get(aliasSlug),
      reason: "source_catalog_alias"
    };
  }

  return { product: null, reason: sourceCatalogId ? "unresolved_source_catalog_id" : "unresolved_product_slug" };
}

function buildResponsiveVariants(asset, siblings) {
  const variants = {};
  for (const sibling of siblings) {
    const format = String(sibling.format ?? "").trim().toLowerCase();
    if (!format) continue;
    variants[format] ??= [];
    variants[format].push({
      width: toPositiveInteger(sibling.width),
      height: toPositiveInteger(sibling.height),
      storage_path: sibling.storage_path,
      public_url: sibling.public_url,
      optimized_size_kb: Number(sibling.optimized_size_kb ?? 0)
    });
  }

  for (const value of Object.values(variants)) {
    value.sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  }

  return {
    source: {
      width: toPositiveInteger(asset.width),
      height: toPositiveInteger(asset.height),
      variant_width: toPositiveInteger(asset.variant_width)
    },
    variants,
    canonical_source: "mithron_assets"
  };
}

function siblingKey(asset) {
  return [
    asset.bucket,
    asset.asset_role,
    asset.category,
    asset.generated_prompt_id,
    asset.product_slug,
    asset.source_catalog_id
  ].map((part) => String(part ?? "")).join("|");
}

function buildSiblingGroups(assets, supabaseUrl) {
  const groups = new Map();
  for (const asset of assets) {
    const normalized = {
      ...asset,
      public_url: buildPublicUrl(supabaseUrl, asset.bucket, asset.storage_path)
    };
    const key = siblingKey(normalized);
    const group = groups.get(key) ?? [];
    group.push(normalized);
    groups.set(key, group);
  }
  return groups;
}

function buildPublicUrl(supabaseUrl, bucket, storagePath) {
  const base = String(supabaseUrl ?? "").replace(/\/+$/g, "");
  return `${base}/storage/v1/object/public/${bucket}/${storagePath}`;
}

function buildMediaAlt(asset, product) {
  if (product?.name) return `${product.name} ${humanize(asset.asset_role || asset.category || "media")}`.trim();
  return humanize(asset.generated_prompt_id || asset.asset_id || asset.storage_path || "Mithron media asset");
}

function buildMediaFolder(asset, product) {
  if (product?.slug) return `products/${product.slug}`;
  const category = String(asset.category || "general").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  const role = String(asset.asset_role || "media").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return [category || "general", role || "media"].join("/");
}

function buildUsage(asset) {
  const role = String(asset.asset_role ?? "").toLowerCase();
  if (role === "product" && asset.is_primary) return "primary";
  if (role === "hero" && asset.is_primary) return "primary";
  if (role === "thumbnail") return "gallery";
  if (role === "poster") return "gallery";
  if (role === "story") return "gallery";
  return "gallery";
}

function buildVariantId(asset) {
  return normalizeTags([asset.asset_role, asset.variant_width, asset.format]).join("-") || null;
}

export function buildCanonicalMediaBackfill({
  assets,
  products,
  supabaseUrl,
  at = new Date().toISOString()
}) {
  const indexes = buildProductIndexes(products);
  const groups = buildSiblingGroups(assets, supabaseUrl);
  const mediaAssets = [];
  const productMediaAssets = [];
  const unresolvedProductLinks = [];
  const seenProductLinks = new Set();

  for (const asset of assets) {
    if (!asset.asset_id || !asset.bucket || !asset.storage_path || !asset.mime_type) {
      throw new Error(`Cannot backfill malformed mithron_assets row: ${JSON.stringify(asset)}`);
    }

    const publicUrl = buildPublicUrl(supabaseUrl, asset.bucket, asset.storage_path);
    const resolved = resolveProductForAsset(asset, indexes);
    const siblings = groups.get(siblingKey(asset)) ?? [{ ...asset, public_url: publicUrl }];
    const altText = buildMediaAlt(asset, resolved.product);
    const sizeBytes = toNonNegativeBytes(asset.optimized_size_kb);
    const width = toPositiveInteger(asset.width);
    const height = toPositiveInteger(asset.height);

    mediaAssets.push({
      id: asset.asset_id,
      bucket: asset.bucket,
      storage_path: asset.storage_path,
      public_url: publicUrl,
      alt: altText,
      alt_text: altText,
      caption: resolved.product?.name ? `${resolved.product.name} canonical ${asset.asset_role ?? "media"} asset` : null,
      folder: buildMediaFolder(asset, resolved.product),
      tags: normalizeTags([
        "canonical-backfill",
        asset.bucket,
        asset.category,
        asset.asset_role,
        asset.format,
        resolved.product?.slug,
        asset.source_catalog_id
      ]),
      mime_type: asset.mime_type,
      width,
      height,
      size_bytes: sizeBytes,
      file_size_bytes: sizeBytes,
      content_hash: asset.content_hash ?? null,
      variants: {
        source_storage_path: asset.storage_path,
        source_format: asset.format ?? null,
        responsive: buildResponsiveVariants(asset, siblings)
      },
      responsive_variants: buildResponsiveVariants(asset, siblings),
      upload_metadata: {
        source_table: "mithron_assets",
        source_asset_id: asset.asset_id,
        source_catalog_id: asset.source_catalog_id ?? null,
        source_resolution: resolved.reason,
        generated_prompt_id: asset.generated_prompt_id ?? null,
        category: asset.category ?? null,
        asset_role: asset.asset_role ?? null,
        optimized_size_kb: Number(asset.optimized_size_kb ?? 0),
        fallback_preserved: true,
        storefront_cutover: false,
        backfill_version: BACKFILL_VERSION
      },
      version: 1,
      is_primary: Boolean(asset.is_primary),
      is_visible: true,
      visibility: "public",
      status: "published",
      created_by: null,
      uploaded_by: null,
      updated_at: at
    });

    if (!resolved.product?.slug) {
      unresolvedProductLinks.push({
        asset_id: asset.asset_id,
        source_catalog_id: asset.source_catalog_id ?? null,
        product_slug: asset.product_slug ?? null,
        reason: resolved.reason
      });
      continue;
    }

    const usage = buildUsage(asset);
    const linkKey = [resolved.product.slug, asset.asset_id, usage].join("|");
    if (seenProductLinks.has(linkKey)) continue;
    seenProductLinks.add(linkKey);

    productMediaAssets.push({
      product_slug: resolved.product.slug,
      media_asset_id: asset.asset_id,
      usage,
      sort_order: asset.is_primary ? 0 : toPositiveInteger(asset.variant_width) ? 10000 - toPositiveInteger(asset.variant_width) : 10000,
      is_primary: Boolean(asset.is_primary) || usage === "primary",
      variant_id: buildVariantId(asset),
      alt_text: altText,
      caption: resolved.product?.name ? `${resolved.product.name} ${usage} media` : null,
      metadata: {
        source_table: "mithron_assets",
        source_asset_id: asset.asset_id,
        source_resolution: resolved.reason,
        fallback_preserved: true,
        storefront_cutover: false,
        backfill_version: BACKFILL_VERSION
      },
      updated_at: at
    });
  }

  return {
    mediaAssets,
    productMediaAssets,
    unresolvedProductLinks,
    summary: {
      sourceAssets: assets.length,
      mediaAssets: mediaAssets.length,
      productMediaLinks: productMediaAssets.length,
      unresolvedProductLinks: unresolvedProductLinks.length,
      fallbackPreserved: true,
      storefrontCutover: false
    }
  };
}

export function parseCliArgs(argv) {
  const args = new Set(argv);
  const limitArg = argv.find((arg) => arg.startsWith("--limit="));
  const parsedLimit = limitArg ? Number(limitArg.slice("--limit=".length)) : DEFAULT_FETCH_LIMIT;
  return {
    apply: args.has("--apply"),
    json: args.has("--json"),
    limit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.floor(parsedLimit) : DEFAULT_FETCH_LIMIT
  };
}

async function fetchAll(supabase, table, columns, limit) {
  const { data, error } = await supabase.from(table).select(columns).limit(limit);
  if (error) {
    throw new Error(`Failed to fetch ${table}: ${error.message}`);
  }
  return data ?? [];
}

async function verifyWritableTables(supabase) {
  for (const table of writableCanonicalTables) {
    const { error } = await supabase.from(table).select("*").limit(1);
    if (error) {
      throw new Error(`Canonical media backfill cannot access ${table}: ${error.message}`);
    }
  }
}

async function applyBackfill(supabase, backfill) {
  await verifyWritableTables(supabase);

  if (backfill.mediaAssets.length) {
    const { error } = await supabase
      .from("media_assets")
      .upsert(backfill.mediaAssets, { onConflict: "id" });
    if (error) throw new Error(`media_assets upsert failed: ${error.message}`);
  }

  if (backfill.productMediaAssets.length) {
    const { error } = await supabase
      .from("product_media_assets")
      .upsert(backfill.productMediaAssets, { onConflict: "product_slug,media_asset_id,usage" });
    if (error) throw new Error(`product_media_assets upsert failed: ${error.message}`);
  }

  const { error: logError } = await supabase.from("activity_logs").insert({
    actor_id: null,
    action: "media.canonical_backfill",
    entity_table: "media_assets",
    entity_id: "mithron_assets",
    severity: "info",
    metadata: {
      ...backfill.summary,
      unresolved_sample: backfill.unresolvedProductLinks.slice(0, 10)
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
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and a Supabase REST key are required for canonical media backfill.");
  }
  if (options.apply && !serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for --apply so RLS remains fail-closed for normal clients.");
  }

  const supabase = createClient(supabaseUrl, options.apply ? serviceRoleKey : readKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const [assets, products] = await Promise.all([
    fetchAll(
      supabase,
      "mithron_assets",
      "asset_id,product_slug,category,bucket,storage_path,asset_role,width,height,variant_width,format,mime_type,content_hash,optimized_size_kb,is_primary,generated_prompt_id,source_catalog_id",
      options.limit
    ),
    fetchAll(supabase, "mithron_products", "slug,name,source_catalog_id", options.limit)
  ]);

  const backfill = buildCanonicalMediaBackfill({
    assets,
    products,
    supabaseUrl
  });

  if (options.apply) {
    await applyBackfill(supabase, backfill);
  }

  const result = {
    mode: options.apply ? "APPLIED" : "DRY_RUN",
    summary: backfill.summary,
    unresolvedSample: backfill.unresolvedProductLinks.slice(0, 10),
    safety: {
      storefrontCutover: false,
      fallbackRemoval: false,
      destructiveCleanup: false
    }
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`[canonical-media] ${result.mode}`);
    console.log(JSON.stringify(result.summary, null, 2));
    if (result.unresolvedSample.length) {
      console.log(`[canonical-media] unresolved product links sample: ${JSON.stringify(result.unresolvedSample, null, 2)}`);
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
