import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

type AdminSupabase = SupabaseClient<any, "public", "public">;
type MediaAssetLookupRow = { id: string | number; public_url: string | null };
import {
  collectExternalProductMediaUrls,
  type ProductMediaRow
} from "@/lib/media/ingest-external-product-url";
import {
  isBlockedExternalMediaUrl,
  isSupabaseProductStorageUrl
} from "@/lib/media/is-blocked-external-media-url";
import { readMediaSrc } from "@/lib/media/read-media-src";

const defaultReportPath = join(process.cwd(), "data", "product-media-verification.json");

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

async function fetchAllProducts(supabase: AdminSupabase) {
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

async function fetchMediaAssetsByUrls(supabase: AdminSupabase, urls: string[]) {
  if (!urls.length) return new Map<string, { id: string; public_url: string }>();

  const unique = [...new Set(urls.map(normalizeUrl))];
  const map = new Map<string, { id: string; public_url: string }>();
  const chunkSize = 50;

  for (let index = 0; index < unique.length; index += chunkSize) {
    const chunk = unique.slice(index, index + chunkSize);
    const { data, error } = await supabase
      .from("media_assets")
      .select("id,public_url")
      .in("public_url", chunk);

    if (error) throw new Error(`Failed to read media_assets: ${error.message}`);

    for (const row of (data ?? []) as MediaAssetLookupRow[]) {
      if (row.public_url) {
        map.set(normalizeUrl(String(row.public_url)), { id: String(row.id), public_url: String(row.public_url) });
      }
    }
  }

  return map;
}

async function fetchProductMediaLinks(supabase: AdminSupabase, slugs: string[]) {
  if (!slugs.length) {
    return [] as Array<{ product_slug: string; media_asset_id: string; usage: string; is_primary: boolean }>;
  }

  const rows: Array<{ product_slug: string; media_asset_id: string; usage: string; is_primary: boolean }> = [];
  const chunkSize = 100;

  for (let index = 0; index < slugs.length; index += chunkSize) {
    const chunk = slugs.slice(index, index + chunkSize);
    const { data, error } = await supabase
      .from("product_media_assets")
      .select("product_slug,media_asset_id,usage,is_primary")
      .in("product_slug", chunk);

    if (error) throw new Error(`Failed to read product_media_assets: ${error.message}`);
    rows.push(...((data ?? []) as Array<{ product_slug: string; media_asset_id: string; usage: string; is_primary: boolean }>));
  }

  return rows;
}

async function checkHttp(url: string) {
  try {
    const response = await fetchWithTimeout(url, { method: "HEAD", redirect: "follow" });
    return response.ok;
  } catch {
    return false;
  }
}

export function parseVerifyProductMediaCliArgs(argv: string[]) {
  const args = new Set(argv);
  const outArg = argv.find((arg) => arg.startsWith("--out="));
  return {
    checkHttp: args.has("--check-http"),
    out: outArg ? outArg.slice("--out=".length).trim() : defaultReportPath
  };
}

export async function verifyProductMediaSupabase(argv: string[] = []) {
  const options = parseVerifyProductMediaCliArgs(argv);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const products = await fetchAllProducts(supabase);
  const violations: Violation[] = [];
  const violationKeys = new Set<string>();
  const supabaseUrls: string[] = [];

  const pushViolation = (violation: Violation) => {
    const key = `${violation.slug}:${violation.code}:${violation.detail}`;
    if (violationKeys.has(key)) return;
    violationKeys.add(key);
    violations.push(violation);
  };

  for (const product of products) {
    for (const entry of collectProductMediaUrls(product)) {
      if (isBlockedExternalMediaUrl(entry.url)) {
        pushViolation({
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
      pushViolation({
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
        pushViolation({
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
        pushViolation({
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
        pushViolation({
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
        pushViolation({
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

  return {
    status: violations.length ? "failed" as const : "passed" as const,
    product_count: products.length,
    violation_count: violations.length,
    report_path: options.out,
    report
  };
}

export function loadVerifyProjectEnv(root = process.cwd()) {
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
