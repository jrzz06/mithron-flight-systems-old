/**
 * Replace remaining catalog-cutout JSON/primary links with original product uploads
 * under products/{slug}/ (non-cutout Supabase assets). Never keeps cutouts as display images.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const apply = process.argv.includes("--apply");

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

function isCutoutPath(pathOrUrl: string | null | undefined) {
  return typeof pathOrUrl === "string" && pathOrUrl.includes("catalog-cutouts");
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: products, error } = await supabase
    .from("mithron_products")
    .select("slug,name,image,hero,gallery")
    .order("slug");
  if (error) throw error;

  const results: Array<{
    slug: string;
    from: string | null;
    to: string | null;
    action: string;
  }> = [];

  for (const product of products ?? []) {
    const imageSrc = (product.image as { src?: string } | null)?.src ?? null;
    const needsReplace = isCutoutPath(imageSrc);
    if (!needsReplace) continue;

    // Prefer existing wix-content primary/gallery, else original products/{slug}/ uploads.
    const { data: linked } = await supabase
      .from("product_media_assets")
      .select("media_asset_id,usage,is_primary")
      .eq("product_slug", product.slug);

    const linkedIds = [...new Set((linked ?? []).map((row) => row.media_asset_id))];
    const { data: linkedAssets } = linkedIds.length
      ? await supabase.from("media_assets").select("id,public_url,storage_path,width,height,alt_text").in("id", linkedIds)
      : { data: [] as Array<{ id: string; public_url: string; storage_path: string; width: number | null; height: number | null; alt_text: string | null }> };

    let replacement =
      (linkedAssets ?? []).find((asset) => asset.storage_path?.includes("/wix-content/") && !isCutoutPath(asset.storage_path))
      ?? (linkedAssets ?? []).find((asset) => !isCutoutPath(asset.storage_path) && asset.storage_path?.startsWith("products/"));

    if (!replacement) {
      const { data: orphans } = await supabase
        .from("media_assets")
        .select("id,public_url,storage_path,width,height,alt_text")
        .like("storage_path", `products/${product.slug}/%`)
        .not("storage_path", "ilike", "%catalog-cutouts%")
        .order("created_at", { ascending: false })
        .limit(5);
      replacement = (orphans ?? []).find((asset) => !isCutoutPath(asset.storage_path)) ?? null;
    }

    if (!replacement) {
      results.push({ slug: product.slug, from: imageSrc, to: null, action: "NO_REPLACEMENT_FOUND" });
      continue;
    }

    const mediaJson = {
      src: replacement.public_url,
      alt: replacement.alt_text || product.name || product.slug,
      kind: "image" as const,
      width: replacement.width ?? undefined,
      height: replacement.height ?? undefined,
      local: false
    };

    results.push({
      slug: product.slug,
      from: imageSrc,
      to: replacement.public_url,
      action: apply ? "REPLACED" : "WOULD_REPLACE"
    });

    if (!apply) continue;

    const { error: updateError } = await supabase
      .from("mithron_products")
      .update({
        image: mediaJson,
        hero: mediaJson,
        gallery: [mediaJson],
        updated_at: new Date().toISOString()
      })
      .eq("slug", product.slug);
    if (updateError) throw updateError;

    // Drop cutout primary links, then ensure replacement is linked as primary.
    await supabase
      .from("product_media_assets")
      .delete()
      .eq("product_slug", product.slug)
      .eq("usage", "primary");

    await supabase.from("product_media_assets").delete().eq("product_slug", product.slug).eq("usage", "cms");

    const { error: linkError } = await supabase.from("product_media_assets").upsert(
      {
        product_slug: product.slug,
        media_asset_id: replacement.id,
        usage: "primary",
        is_primary: true,
        sort_order: 0,
        alt_text: mediaJson.alt
      },
      { onConflict: "product_slug,media_asset_id,usage" }
    );
    if (linkError) throw linkError;
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? "APPLIED" : "DRY_RUN",
        count: results.length,
        results
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
