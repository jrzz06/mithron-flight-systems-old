/**
 * Detach catalog cutout + migration-backup cms links so storefront uses Wix/primary only.
 * Does not delete Storage files — only product_media_assets display/cms links.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const CUTOUT_VARIANT_ID = "catalog-cutout-v1";
const BACKUP_VARIANT_ID = "wix-migration-backup-v1";
const apply = process.argv.includes("--apply");
const slugFilter = process.argv.find((arg) => arg.startsWith("--slug="))?.slice("--slug=".length);

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

function isCutoutSrc(src: unknown) {
  return typeof src === "string" && src.includes("/catalog-cutouts/");
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  let query = supabase
    .from("mithron_products")
    .select("slug,name,image,hero,gallery")
    .order("slug");
  if (slugFilter) query = query.eq("slug", slugFilter);

  const { data: products, error } = await query;
  if (error) throw error;

  const results: Array<{ slug: string; unlinked: number; scrubbed_json: boolean }> = [];

  for (const product of products ?? []) {
    const { data: links, error: linkError } = await supabase
      .from("product_media_assets")
      .select("media_asset_id,usage,variant_id")
      .eq("product_slug", product.slug)
      .eq("usage", "cms")
      .in("variant_id", [CUTOUT_VARIANT_ID, BACKUP_VARIANT_ID]);
    if (linkError) throw linkError;

    const cutoutCount = links?.length ?? 0;
    const imageIsCutout = isCutoutSrc((product.image as { src?: string } | null)?.src);
    const heroIsCutout = isCutoutSrc((product.hero as { src?: string } | null)?.src);
    const gallery = Array.isArray(product.gallery) ? product.gallery : [];
    const cleanGallery = gallery.filter((item) => !isCutoutSrc((item as { src?: string })?.src));
    const needsJsonScrub = imageIsCutout || heroIsCutout || cleanGallery.length !== gallery.length;

    if (!apply) {
      results.push({ slug: product.slug, unlinked: cutoutCount, scrubbed_json: needsJsonScrub });
      continue;
    }

    if (cutoutCount) {
      const { error: deleteError } = await supabase
        .from("product_media_assets")
        .delete()
        .eq("product_slug", product.slug)
        .eq("usage", "cms")
        .in("variant_id", [CUTOUT_VARIANT_ID, BACKUP_VARIANT_ID]);
      if (deleteError) throw deleteError;
    }

    if (needsJsonScrub) {
      // Keep current non-cutout primary if present; otherwise leave image as-is for admin fix.
      const primarySrc = !imageIsCutout
        ? (product.image as { src?: string } | null)?.src
        : cleanGallery[0] && typeof (cleanGallery[0] as { src?: string }).src === "string"
          ? (cleanGallery[0] as { src: string }).src
          : null;

      if (primarySrc) {
        const primary = !imageIsCutout
          ? product.image
          : cleanGallery[0];
        const { error: updateError } = await supabase
          .from("mithron_products")
          .update({
            image: primary,
            hero: !heroIsCutout ? product.hero : primary,
            gallery: cleanGallery.length ? cleanGallery : primary ? [primary] : [],
            updated_at: new Date().toISOString()
          })
          .eq("slug", product.slug);
        if (updateError) throw updateError;
      }
    }

    results.push({ slug: product.slug, unlinked: cutoutCount, scrubbed_json: needsJsonScrub });
  }

  const summary = {
    mode: apply ? "APPLIED" : "DRY_RUN",
    products: results.length,
    with_cutout_links: results.filter((item) => item.unlinked > 0).length,
    with_cutout_json: results.filter((item) => item.scrubbed_json).length,
    total_links_unlinked: results.reduce((sum, item) => sum + item.unlinked, 0)
  };
  console.log(JSON.stringify({ summary, sample: results.slice(0, 10) }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
