/**
 * Safe gallery de-duplication for storefront PDP thumbs.
 *
 * What this does:
 * - Removes duplicate src entries inside `gallery` (keeps first)
 * - Removes gallery entries that match the product primary `image.src`
 *   (primary stays on image/hero; storefront prepends it)
 * - Dedupes `source_images` by src (keeps first) — provenance only, no Storage deletes
 *
 * What this does NOT do:
 * - Delete Storage objects
 * - Delete media_assets rows
 * - Change primary image/hero
 *
 * Default dry-run. Live: --apply
 * Optional: --slug=source-ag-fc-namoag-gps-with-aerogcs-green-software-combo
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const apply = process.argv.includes("--apply");
const slugFilter = process.argv.find((arg) => arg.startsWith("--slug="))?.slice("--slug=".length);

type MediaJson = { src?: string; alt?: string; kind?: string; [key: string]: unknown };

function loadEnv() {
  for (const envPath of [join(root, ".env.local"), join(root, ".env")]) {
    if (!existsSync(envPath)) continue;
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const eq = trimmed.indexOf("=");
      const name = trimmed.slice(0, eq);
      if (!name || process.env[name]) continue;
      process.env[name] = trimmed.slice(eq + 1).replace(/^["']|["']$/g, "");
    }
  }
}

function readSrc(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object" && typeof (value as MediaJson).src === "string") {
    const src = String((value as MediaJson).src).trim();
    return src || null;
  }
  return null;
}

function basenameKey(src: string) {
  try {
    const path = new URL(src).pathname;
    return path.split("/").filter(Boolean).pop() || src;
  } catch {
    return src.split("?")[0];
  }
}

function dedupeKeepFirst(items: unknown[]): { kept: MediaJson[]; removed: string[] } {
  const seen = new Set<string>();
  const kept: MediaJson[] = [];
  const removed: string[] = [];
  for (const item of items) {
    const src = readSrc(item);
    if (!src) continue;
    const key = basenameKey(src);
    if (seen.has(key)) {
      removed.push(src);
      continue;
    }
    seen.add(key);
    if (typeof item === "string") {
      kept.push({ src: item, kind: "image" });
    } else {
      kept.push(item as MediaJson);
    }
  }
  return { kept, removed };
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  let query = supabase
    .from("mithron_products")
    .select("slug,name,image,hero,gallery,source_images")
    .order("slug");
  if (slugFilter) query = query.eq("slug", slugFilter);

  const { data: products, error } = await query;
  if (error) throw error;

  const results: Array<Record<string, unknown>> = [];
  let updated = 0;
  let galleryEntriesRemoved = 0;
  let sourceEntriesRemoved = 0;

  for (const product of products ?? []) {
    const primarySrc = readSrc(product.image);
    const galleryIn = Array.isArray(product.gallery) ? product.gallery : [];
    const sourceIn = Array.isArray(product.source_images) ? product.source_images : [];

    const galleryDeduped = dedupeKeepFirst(galleryIn);
    const primaryKeys = new Set<string>();
    if (primarySrc) primaryKeys.add(basenameKey(primarySrc));
    const heroSrc = readSrc(product.hero);
    if (heroSrc) primaryKeys.add(basenameKey(heroSrc));

    const galleryWithoutPrimary: MediaJson[] = [];
    const removedPrimaryMatches: string[] = [];
    for (const item of galleryDeduped.kept) {
      const src = readSrc(item);
      if (!src) continue;
      if (primaryKeys.has(basenameKey(src))) {
        removedPrimaryMatches.push(src);
        continue;
      }
      galleryWithoutPrimary.push(item);
    }

    const sourceDeduped = dedupeKeepFirst(sourceIn);

    const galleryChanged =
      galleryWithoutPrimary.length !== galleryIn.length ||
      galleryDeduped.removed.length > 0 ||
      removedPrimaryMatches.length > 0;
    const sourceChanged = sourceDeduped.removed.length > 0 || sourceDeduped.kept.length !== sourceIn.length;

    if (!galleryChanged && !sourceChanged) continue;

    const removedGallery = [...galleryDeduped.removed, ...removedPrimaryMatches];
    galleryEntriesRemoved += removedGallery.length;
    sourceEntriesRemoved += sourceDeduped.removed.length;

    const result = {
      slug: product.slug,
      name: product.name,
      action: apply ? "updated" : "would_update",
      gallery_before: galleryIn.length,
      gallery_after: galleryWithoutPrimary.length,
      source_before: sourceIn.length,
      source_after: sourceDeduped.kept.length,
      removed_from_gallery: removedGallery,
      removed_from_source_images: sourceDeduped.removed,
      kept_primary: primarySrc,
      kept_gallery: galleryWithoutPrimary.map((item) => readSrc(item))
    };
    results.push(result);

    if (!apply) continue;

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    };
    if (galleryChanged) patch.gallery = galleryWithoutPrimary;
    if (sourceChanged) patch.source_images = sourceDeduped.kept;

    const { error: updateError } = await supabase.from("mithron_products").update(patch).eq("slug", product.slug);
    if (updateError) throw updateError;
    updated += 1;
  }

  const summary = {
    mode: apply ? "APPLIED" : "DRY_RUN",
    products_scanned: products?.length ?? 0,
    products_changed: results.length,
    products_updated: apply ? updated : 0,
    gallery_entries_removed: galleryEntriesRemoved,
    source_entries_removed: sourceEntriesRemoved,
    storage_deleted: 0,
    media_assets_deleted: 0,
    note: "Safe JSON-only cleanup: primary kept on image/hero; duplicate gallery/source refs removed; no Storage deletes."
  };

  const outDir = join(root, "data", "wix-content-migration", "dedupe-gallery");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `gallery-dedupe-${apply ? "applied" : "dry"}.json`);
  writeFileSync(outPath, JSON.stringify({ summary, results }, null, 2));
  console.log(
    JSON.stringify(
      {
        summary,
        sample: results.slice(0, 8),
        focus:
          results.find((item) => item.slug === "source-ag-fc-namoag-gps-with-aerogcs-green-software-combo") ??
          null,
        report: outPath
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
