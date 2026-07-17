import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  collectExternalProductMediaUrls,
  type ProductMediaRow
} from "../lib/media/ingest-external-product-url.ts";
import {
  isBlockedExternalMediaUrl,
  isSupabaseProductStorageUrl
} from "../lib/media/is-blocked-external-media-url.ts";
import { readMediaSrc } from "../lib/media/read-media-src.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const defaultReportPath = join(root, "data", "product-media-verification.json");

type ProductRow = ProductMediaRow & {
  workflow_status?: string | null;
  is_visible?: boolean | null;
  og_image?: unknown;
};

type Violation = {
  slug: string;
  code: string;
  detail: string;
};

function loadProjectEnv() {
  for (const envPath of [join(root, ".env.local"), join(root, ".env")]) {
    if (!existsSync(envPath)) continue;
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [name, ...parts] = trimmed.split("=");
      if (!name || process.env[name]) continue;
      process.env[name] = parts.join("=").replace(/^["']|["']$/g, "");
    }
  }
}

function normalizeUrl(url: string) {
  return url.trim().replace(/\/+$/, "");
}

function collectProductMediaUrls(row: ProductRow) {
  const urls: { field: string; url: string }[] = [];
  const push = (field: string, value: unknown) => {
    const src = readMediaSrc(value);
    if (src) urls.push({ field, url: normalizeUrl(src) });
  };

  push("image", row.image);
  push("hero", row.hero);
  push("og_image", row.og_image);

  if (Array.isArray(row.gallery)) {
    row.gallery.forEach((item, index) => push(`gallery[${index}]`, item));
  }

  if (Array.isArray(row.source_images)) {
    row.source_images.forEach((item, index) => {
      if (typeof item === "string" && item.trim()) {
        urls.push({ field: `source_images[${index}]`, url: normalizeUrl(item) });
        return;
      }
      push(`source_images[${index}]`, item);
    });
  }

  return urls;
}

async function fetchAllProducts(supabase: ReturnType<typeof createClient>) {
  const rows: ProductRow[] = [];
  const pageSize = 200;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("mithron_products")
      .select("slug,name,image,hero,gallery,source_images,og_image,workflow_status,is_visible")
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Failed to read mithron_products: ${error.message}`);
    if (!data?.length) break;
    rows.push(...(data as ProductRow[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function fetchMediaAssetsByUrls(supabase: ReturnType<typeof createClient>, urls: string[]) {
  if (!urls.length) return new Map<string, { id: string; public_url: string }>();

  const unique = [...new Set(urls.map(normalizeUrl))];
  const { data, error } = await supabase
    .from("media_assets")
    .select("id,public_url")
    .in("public_url", unique);

  if (error) throw new Error(`Failed to read media_assets: ${error.message}`);

  const map = new Map<string, { id: string; public_url: string }>();
  for (const row of data ?? []) {
    if (row.public_url) map.set(normalizeUrl(String(row.public_url)), { id: String(row.id), public_url: String(row.public_url) });
  }
  return map;
}

async function fetchProductMediaLinks(supabase: ReturnType<typeof createClient>, slugs: string[]) {
  if (!slugs.length) return [] as Array<{ product_slug: string; media_asset_id: string; usage: string; is_primary: boolean }>;

  const { data, error } = await supabase
    .from("product_media_assets")
    .select("product_slug,media_asset_id,usage,is_primary")
    .in("product_slug", slugs);

  if (error) throw new Error(`Failed to read product_media_assets: ${error.message}`);
  return (data ?? []) as Array<{ product_slug: string; media_asset_id: string; usage: string; is_primary: boolean }>;
}

async function checkHttp(url: string) {
  try {
    const response = await fetch(url, { method: "HEAD", redirect: "follow" });
    return response.ok;
  } catch {
    return false;
  }
}

export function parseVerifyCliArgs(argv: string[]) {
  const args = new Set(argv);
  const outArg = argv.find((arg) => arg.startsWith("--out="));
  return {
    checkHttp: args.has("--check-http"),
    out: outArg ? outArg.slice("--out=".length).trim() : defaultReportPath
  };
}

async function main() {
  loadProjectEnv();
  const options = parseVerifyCliArgs(process.argv.slice(2));
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const products = await fetchAllProducts(supabase);
  const violations: Violation[] = [];

  const supabaseUrls: string[] = [];
  for (const product of products) {
    for (const entry of collectProductMediaUrls(product)) {
      if (isBlockedExternalMediaUrl(entry.url)) {
        violations.push({
          slug: product.slug,
          code: "blocked_external_url",
          detail: `${entry.field}: ${entry.url}`
        });
      }
      if (isSupabaseProductStorageUrl(entry.url)) {
        supabaseUrls.push(entry.url);
      }
    }

    const externalRemaining = collectExternalProductMediaUrls(product);
    if (externalRemaining.length) {
      violations.push({
        slug: product.slug,
        code: "external_urls_remaining",
        detail: externalRemaining.join(", ")
      });
    }
  }

  const mediaAssetsByUrl = await fetchMediaAssetsByUrls(supabase, supabaseUrls);
  const links = await fetchProductMediaLinks(supabase, products.map((product) => product.slug));

  for (const product of products) {
    const productUrls = collectProductMediaUrls(product)
      .map((entry) => entry.url)
      .filter((url) => isSupabaseProductStorageUrl(url));

    for (const url of productUrls) {
      if (!mediaAssetsByUrl.has(url)) {
        violations.push({
          slug: product.slug,
          code: "orphan_supabase_url",
          detail: url
        });
      }
    }

    const productLinks = links.filter((link) => link.product_slug === product.slug);
    for (const url of productUrls) {
      const asset = mediaAssetsByUrl.get(url);
      if (!asset) continue;
      const hasLink = productLinks.some((link) => link.media_asset_id === asset.id);
      if (!hasLink) {
        violations.push({
          slug: product.slug,
          code: "missing_product_media_link",
          detail: `${asset.id} -> ${url}`
        });
      }
    }

    const isPublished = product.workflow_status === "published" && product.is_visible !== false;
    if (isPublished) {
      const hasPrimary = productLinks.some((link) => link.usage === "primary" && link.is_primary);
      if (!hasPrimary) {
        violations.push({
          slug: product.slug,
          code: "missing_primary_link",
          detail: "published product has no primary product_media_assets link"
        });
      }
    }
  }

  if (options.checkHttp) {
    const publishedPrimaryUrls = products
      .filter((product) => product.workflow_status === "published" && product.is_visible !== false)
      .map((product) => readMediaSrc(product.image))
      .filter((url) => url && isSupabaseProductStorageUrl(url));

    for (const url of publishedPrimaryUrls) {
      const ok = await checkHttp(url);
      if (!ok) {
        violations.push({
          slug: "http-check",
          code: "broken_storage_url",
          detail: url
        });
      }
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    product_count: products.length,
    violation_count: violations.length,
    violations
  };

  mkdirSync(dirname(options.out), { recursive: true });
  writeFileSync(options.out, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    status: violations.length ? "failed" : "passed",
    product_count: products.length,
    violation_count: violations.length,
    report_path: options.out
  }, null, 2));

  if (violations.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
