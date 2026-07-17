/* eslint-disable @typescript-eslint/no-require-imports */
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { createClient } = require("@supabase/supabase-js");

const root = join(__dirname, "..");
const defaultCatalogPath = join(root, "data", "mithron-products-crawled.generated.json");

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

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function plainTextToDescriptionHtml(text) {
  const normalized = String(text ?? "").replace(/\r\n/g, "\n").trim();
  if (!normalized) return null;

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  if (!paragraphs.length) return null;
  return paragraphs.map((part) => `<p>${escapeHtml(part)}</p>`).join("");
}

function deriveSaleFields(price, compareAt) {
  const salePrice = Number(price) || 0;
  const regularPrice = compareAt ? Number(compareAt) : null;

  if (regularPrice && regularPrice > salePrice) {
    return {
      price: salePrice,
      compare_at: regularPrice,
      on_sale: true,
      discount_type: "amount",
      discount_value: Math.round((regularPrice - salePrice) * 100) / 100
    };
  }

  return {
    price: salePrice,
    compare_at: null,
    on_sale: false,
    discount_type: null,
    discount_value: null
  };
}

function patchSourceListingBundle(bundles, crawled) {
  const existing = Array.isArray(bundles) ? bundles : [];
  const pricing = deriveSaleFields(crawled.price, crawled.compare_at);
  const listing = {
    id: "source-listing",
    name: crawled.name,
    price: pricing.price,
    compareAt: pricing.compare_at ?? undefined,
    badge: crawled.badge ?? undefined,
    description: crawled.tagline || crawled.source_description?.slice(0, 180) || crawled.name,
    includes: []
  };

  const index = existing.findIndex((bundle) => bundle?.id === "source-listing");
  if (index >= 0) {
    const next = [...existing];
    next[index] = { ...existing[index], ...listing };
    return next;
  }

  return [...existing, listing];
}

function normalizeUrl(url) {
  return String(url ?? "").trim().toLowerCase().replace(/\/$/, "");
}

function buildMatchIndexes(rows) {
  const byCatalogId = new Map();
  const bySourceUrl = new Map();
  const bySlug = new Map();

  for (const row of rows) {
    if (row.source_catalog_id) byCatalogId.set(row.source_catalog_id, row);
    if (row.source_url) bySourceUrl.set(normalizeUrl(row.source_url), row);
    bySlug.set(row.slug, row);
  }

  return { byCatalogId, bySourceUrl, bySlug };
}

function findExistingRow(indexes, crawled) {
  if (crawled.source_catalog_id && indexes.byCatalogId.has(crawled.source_catalog_id)) {
    return indexes.byCatalogId.get(crawled.source_catalog_id);
  }
  if (crawled.source_url && indexes.bySourceUrl.has(normalizeUrl(crawled.source_url))) {
    return indexes.bySourceUrl.get(normalizeUrl(crawled.source_url));
  }
  if (crawled.slug && indexes.bySlug.has(crawled.slug)) {
    return indexes.bySlug.get(crawled.slug);
  }
  return null;
}

function buildUpdate(existing, crawled, options) {
  const pricing = deriveSaleFields(crawled.price, crawled.compare_at);
  const patch = {
    price: pricing.price,
    compare_at: pricing.compare_at,
    on_sale: pricing.on_sale,
    discount_type: pricing.discount_type,
    discount_value: pricing.discount_value,
    source_description: crawled.source_description ?? null,
    source_extracted_at: crawled.source_extracted_at ?? new Date().toISOString(),
    source_availability: crawled.source_availability ?? crawled.specs?.Availability ?? null,
    badge: crawled.badge ?? null,
    bundles: patchSourceListingBundle(existing.bundles, crawled),
    updated_at: new Date().toISOString()
  };

  if (!existing.source_url && crawled.source_url) {
    patch.source_url = crawled.source_url;
  }
  if (!existing.source_catalog_id && crawled.source_catalog_id) {
    patch.source_catalog_id = crawled.source_catalog_id;
  }
  if (!existing.product_url && crawled.product_url) {
    patch.product_url = crawled.product_url;
  }

  const shouldSetDescription = options.forceDescriptions || !existing.description?.trim();
  if (shouldSetDescription && crawled.source_description?.trim()) {
    patch.description = plainTextToDescriptionHtml(crawled.source_description);
    patch.tagline = crawled.tagline ?? existing.tagline;
  }

  return patch;
}

function hasPricingChange(existing, patch) {
  return (
    Number(existing.price) !== Number(patch.price)
    || Number(existing.compare_at ?? 0) !== Number(patch.compare_at ?? 0)
    || Boolean(existing.on_sale) !== Boolean(patch.on_sale)
    || (existing.source_description ?? "") !== (patch.source_description ?? "")
    || (existing.description ?? "") !== (patch.description ?? "")
  );
}

async function fetchAllProducts(supabase) {
  const rows = [];
  const pageSize = 200;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("mithron_products")
      .select("slug,source_catalog_id,source_url,price,compare_at,on_sale,description,tagline,bundles,source_description")
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Failed to read mithron_products: ${error.message}`);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function hideCsvStorefrontArtifacts(supabase, dryRun) {
  const { data, error } = await supabase
    .from("mithron_products")
    .select("slug,name,category,is_visible,source_availability,price,source_url")
    .eq("source_availability", "uploaded_csv")
    .eq("price", 0)
    .is("source_url", null);

  if (error) {
    throw new Error(`Failed to read CSV storefront artifacts: ${error.message}`);
  }

  const rows = data ?? [];
  if (!rows.length) {
    return { hidden: 0, slugs: [] };
  }

  const slugs = rows.map((row) => row.slug);
  if (!dryRun) {
    const { error: updateError } = await supabase
      .from("mithron_products")
      .update({
        is_visible: false,
        category: "Imported Wix Inventory",
        updated_at: new Date().toISOString()
      })
      .in("slug", slugs);

    if (updateError) {
      throw new Error(`Failed to hide CSV storefront artifacts: ${updateError.message}`);
    }
  }

  return { hidden: slugs.length, slugs };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const forceDescriptions = process.argv.includes("--force-descriptions");
  const catalogPath = process.argv.find((arg) => arg.startsWith("--catalog="))?.split("=")[1] ?? defaultCatalogPath;

  loadProjectEnv();

  if (!existsSync(catalogPath)) {
    throw new Error(`Crawled catalog not found at ${catalogPath}. Run: npm run products:crawl-upload -- --dry-run`);
  }

  const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  const crawledProducts = catalog.products ?? [];
  if (!crawledProducts.length) {
    throw new Error("Crawled catalog has no products.");
  }

  const supabase = createSupabaseAdminClient();
  const existingRows = await fetchAllProducts(supabase);
  const indexes = buildMatchIndexes(existingRows);

  const updates = [];
  const unmatched = [];

  for (const crawled of crawledProducts) {
    const existing = findExistingRow(indexes, crawled);
    if (!existing) {
      unmatched.push({ slug: crawled.slug, source_catalog_id: crawled.source_catalog_id });
      continue;
    }

    const patch = buildUpdate(existing, crawled, { forceDescriptions });
    if (!hasPricingChange(existing, patch)) continue;

    updates.push({ slug: existing.slug, patch });
  }

  if (!dryRun) {
    for (const { slug, patch } of updates) {
      const { error } = await supabase.from("mithron_products").update(patch).eq("slug", slug);
      if (error) {
        throw new Error(`Failed to update ${slug}: ${error.message}`);
      }
    }
  }

  const csvCleanup = await hideCsvStorefrontArtifacts(supabase, dryRun);

  const zeroPriceBefore = existingRows.filter((row) => Number(row.price) === 0).length;

  console.log(JSON.stringify({
    status: dryRun ? "DRY_RUN" : "SYNCED",
    catalogExtractedAt: catalog.extractedAt,
    crawledProducts: crawledProducts.length,
    existingProducts: existingRows.length,
    matchedUpdates: updates.length,
    unmatchedCrawled: unmatched.length,
    csvArtifactsHidden: csvCleanup.hidden,
    csvArtifactSlugs: csvCleanup.slugs,
    zeroPriceBefore,
    sampleUpdates: updates.slice(0, 8).map(({ slug, patch }) => ({
      slug,
      price: patch.price,
      compare_at: patch.compare_at,
      on_sale: patch.on_sale,
      descriptionSet: Boolean(patch.description)
    })),
    unmatchedSample: unmatched.slice(0, 5)
  }, null, 2));
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
