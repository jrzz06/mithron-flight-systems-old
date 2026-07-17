import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { normalizeCatalogName } from "../lib/wix/catalog-normalize.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const LEGACY_CATEGORY = "Imported Wix Inventory";

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

function isJunkDescription(description: string | null | undefined) {
  if (!description?.trim()) return true;
  const text = description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  if (!text) return true;
  return /gettyimages\.com/.test(text)
    || /^(df|ss|sfafse)(\s|$)/.test(text)
    || /^[a-z0-9-]+ catalog listing\.?$/.test(text);
}

function isExternalImage(src: string) {
  return Boolean(src.trim()) && !src.includes(".supabase.co/storage/v1/object/public/");
}

async function fetchRowsByIds<T extends { id: string }>(
  supabase: ReturnType<typeof createClient>,
  table: string,
  columns: string,
  ids: string[],
  chunkSize = 40
) {
  const rows: T[] = [];
  for (let index = 0; index < ids.length; index += chunkSize) {
    const chunk = ids.slice(index, index + chunkSize);
    const { data, error } = await supabase.from(table).select(columns).in("id", chunk);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as T[]));
  }
  return rows;
}

async function main() {
  loadProjectEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const issues: string[] = [];

  const { data: products, error } = await supabase
    .from("mithron_products")
    .select("slug,name,category,price,description,image,hero,gallery,workflow_status,is_visible")
    .eq("workflow_status", "published")
    .eq("is_visible", true)
    .neq("category", LEGACY_CATEGORY);
  if (error) throw new Error(error.message);

  const visible = products ?? [];
  const nameBuckets = new Map<string, string[]>();

  for (const row of visible) {
    const keyName = `${row.category ?? "unknown"}::${normalizeCatalogName(row.name)}`;
    const list = nameBuckets.get(keyName) ?? [];
    list.push(row.slug);
    nameBuckets.set(keyName, list);
  }

  for (const [keyName, slugs] of nameBuckets) {
    if (slugs.length > 1) issues.push(`duplicate_visible_name:${keyName}:${slugs.join(",")}`);
  }

  const { data: primaryLinks, error: linkError } = await supabase
    .from("product_media_assets")
    .select("product_slug,media_asset_id")
    .eq("usage", "primary")
    .eq("is_primary", true);
  if (linkError) throw new Error(linkError.message);

  const linkedSlugs = new Set((primaryLinks ?? []).map((row) => row.product_slug));
  const mediaIds = [...new Set((primaryLinks ?? []).map((row) => row.media_asset_id).filter(Boolean))];
  const mediaRows = mediaIds.length
    ? await fetchRowsByIds<{ id: string; public_url: string | null; width: number | null; height: number | null }>(
      supabase,
      "media_assets",
      "id,public_url,width,height",
      mediaIds
    )
    : [];

  const mediaById = new Map((mediaRows ?? []).map((row) => [row.id, row]));

  const { data: cutoutLinks, error: cutoutError } = await supabase
    .from("product_media_assets")
    .select("product_slug,media_asset_id")
    .eq("usage", "cms")
    .eq("variant_id", "catalog-cutout-v1");
  if (cutoutError) throw new Error(cutoutError.message);

  const cutoutMediaIds = [...new Set((cutoutLinks ?? []).map((row) => row.media_asset_id).filter(Boolean))];
  const cutoutMediaRows = cutoutMediaIds.length
    ? await fetchRowsByIds<{ id: string; public_url: string | null }>(
      supabase,
      "media_assets",
      "id,public_url",
      cutoutMediaIds
    )
    : [];

  const cutoutUrlBySlug = new Map<string, string>();
  const cutoutMediaById = new Map((cutoutMediaRows ?? []).map((row) => [row.id, row.public_url]));
  for (const link of cutoutLinks ?? []) {
    const publicUrl = cutoutMediaById.get(link.media_asset_id);
    if (link.product_slug && publicUrl) cutoutUrlBySlug.set(link.product_slug, publicUrl);
  }

  for (const row of visible) {
    const imageSrc = (row.image as { src?: string } | null)?.src ?? "";
    const heroSrc = (row.hero as { src?: string } | null)?.src ?? "";

    if (!linkedSlugs.has(row.slug)) issues.push(`missing_primary_link:${row.slug}`);
    if (isExternalImage(imageSrc)) issues.push(`external_image:${row.slug}`);
    if (!imageSrc.trim() || /placeholder|broken/i.test(imageSrc)) issues.push(`broken_image:${row.slug}`);
    if (Number(row.price) === 0) issues.push(`zero_price_visible:${row.slug}`);
    if (isJunkDescription(row.description)) issues.push(`junk_description:${row.slug}`);

    const primaryLink = (primaryLinks ?? []).find((link) => link.product_slug === row.slug);
    const primaryMedia = primaryLink ? mediaById.get(primaryLink.media_asset_id) : null;
    if (primaryMedia && (!primaryMedia.width || !primaryMedia.height)) {
      issues.push(`primary_media_missing_dimensions:${row.slug}`);
    }

    const cutoutUrl = cutoutUrlBySlug.get(row.slug);
    if (cutoutUrl && !cutoutUrl.includes(row.slug) && !cutoutUrl.includes("catalog-cutouts")) {
      issues.push(`suspicious_cutout_url:${row.slug}`);
    }

    if (heroSrc && imageSrc && heroSrc !== imageSrc && heroSrc.includes("/catalog-cutouts/") && !imageSrc.includes("/catalog-cutouts/")) {
      // expected: shelf image vs cutout hero
    } else if (heroSrc && imageSrc && heroSrc === imageSrc && heroSrc.includes("gettyimages.com")) {
      issues.push(`hero_matches_external_placeholder:${row.slug}`);
    }
  }

  const reportPath = join(root, "data", "product-reconcile-report.json");
  let reconcileSummary = null;
  if (existsSync(reportPath)) {
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    reconcileSummary = report.summary ?? null;
    if ((report.summary?.duplicate_clusters ?? 0) > 0) {
      issues.push(`wix_duplicate_clusters:${report.summary.duplicate_clusters}`);
    }
    if ((report.summary?.price_drift ?? 0) > 0) {
      issues.push(`wix_price_drift:${report.summary.price_drift}`);
    }
    if ((report.summary?.description_drift ?? 0) > 0) {
      issues.push(`wix_description_drift:${report.summary.description_drift}`);
    }
  }

  const summary = {
    status: issues.length ? "ATTENTION" : "PASSED",
    publishedVisibleCount: visible.length,
    primaryLinkCount: linkedSlugs.size,
    primaryLinkCoveragePct: visible.length
      ? Math.round((visible.filter((row) => linkedSlugs.has(row.slug)).length / visible.length) * 100)
      : 100,
    cutoutLinkCount: cutoutLinks?.length ?? 0,
    reconcileSummary,
    issueCount: issues.length,
    issues
  };

  console.log(JSON.stringify(summary, null, 2));
  if (issues.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
