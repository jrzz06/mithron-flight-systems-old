/**
 * Force Wix-only live display: replace any primary/gallery/hero using
 * products/{slug}/ai-cutout/ or ai-hero/ with wix-content assets, then unlink AI rows.
 *
 * Default dry-run. Live: --apply
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const apply = process.argv.includes("--apply");

type MediaJson = { src?: string; alt?: string; kind?: string; width?: number; height?: number; local?: boolean };

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

function isAiPath(pathOrUrl: string | null | undefined) {
  if (typeof pathOrUrl !== "string") return false;
  return pathOrUrl.includes("/ai-cutout/") || pathOrUrl.includes("/ai-hero/");
}

function isWixPath(pathOrUrl: string | null | undefined) {
  return typeof pathOrUrl === "string" && pathOrUrl.includes("/wix-content/");
}

function mediaFromAsset(
  asset: { public_url: string; alt_text: string | null; width: number | null; height: number | null },
  fallbackAlt: string
): MediaJson {
  return {
    src: asset.public_url,
    alt: asset.alt_text || fallbackAlt,
    kind: "image",
    width: asset.width ?? undefined,
    height: asset.height ?? undefined,
    local: false
  };
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

  const results: Array<Record<string, unknown>> = [];
  let jsonFixed = 0;
  let linksRemoved = 0;

  for (const product of products ?? []) {
    const imageSrc = (product.image as MediaJson | null)?.src ?? null;
    const heroSrc = (product.hero as MediaJson | null)?.src ?? null;
    const gallery = Array.isArray(product.gallery) ? (product.gallery as MediaJson[]) : [];
    const galleryHasAi = gallery.some((item) => isAiPath(item?.src));
    const jsonNeeds = isAiPath(imageSrc) || isAiPath(heroSrc) || galleryHasAi;

    const { data: liveLinks } = await supabase
      .from("product_media_assets")
      .select("media_asset_id,usage,is_primary")
      .eq("product_slug", product.slug)
      .in("usage", ["primary", "gallery", "hero"]);

    const liveIds = [...new Set((liveLinks ?? []).map((row) => row.media_asset_id))];
    const { data: liveAssets } = liveIds.length
      ? await supabase
          .from("media_assets")
          .select("id,public_url,storage_path,width,height,alt_text")
          .in("id", liveIds)
      : { data: [] as Array<{ id: string; public_url: string; storage_path: string | null; width: number | null; height: number | null; alt_text: string | null }> };

    const aiLiveAssets = (liveAssets ?? []).filter((asset) => isAiPath(asset.storage_path) || isAiPath(asset.public_url));
    if (!jsonNeeds && aiLiveAssets.length === 0) continue;

    // Prefer any linked wix-content; else query slug folder.
    let wix =
      (liveAssets ?? []).find((asset) => isWixPath(asset.storage_path)) ??
      null;
    if (!wix) {
      const { data: wixRows } = await supabase
        .from("media_assets")
        .select("id,public_url,storage_path,width,height,alt_text")
        .like("storage_path", `products/${product.slug}/wix-content/%`)
        .order("created_at", { ascending: true })
        .limit(5);
      wix = (wixRows ?? [])[0] ?? null;
    }

    if (!wix) {
      results.push({
        slug: product.slug,
        action: "NO_WIX_CONTENT",
        ai_live: aiLiveAssets.map((a) => a.storage_path),
        json_ai: jsonNeeds
      });
      continue;
    }

    const replacement = mediaFromAsset(wix, product.name || product.slug);
    const nextGallery = galleryHasAi
      ? [replacement, ...gallery.filter((item) => !isAiPath(item?.src))]
      : gallery.length
        ? gallery
        : [replacement];

    const nextImage = isAiPath(imageSrc) ? replacement : (product.image as MediaJson) || replacement;
    const nextHero = isAiPath(heroSrc) ? replacement : (product.hero as MediaJson) || nextImage;

    results.push({
      slug: product.slug,
      action: apply ? "REPLACED_AI_WITH_WIX" : "WOULD_REPLACE_AI_WITH_WIX",
      wix: wix.storage_path,
      ai_live_removed: aiLiveAssets.map((a) => a.storage_path),
      json_ai: jsonNeeds
    });

    if (!apply) continue;

    if (jsonNeeds || isAiPath(imageSrc) || isAiPath(heroSrc) || galleryHasAi) {
      const { error: updateError } = await supabase
        .from("mithron_products")
        .update({
          image: nextImage,
          hero: nextHero,
          gallery: nextGallery.length ? nextGallery : [replacement],
          updated_at: new Date().toISOString()
        })
        .eq("slug", product.slug);
      if (updateError) throw updateError;
      jsonFixed += 1;
    }

    if (aiLiveAssets.length) {
      const aiIds = aiLiveAssets.map((a) => a.id);
      const { error: delError } = await supabase
        .from("product_media_assets")
        .delete()
        .eq("product_slug", product.slug)
        .in("media_asset_id", aiIds)
        .in("usage", ["primary", "gallery", "hero"]);
      if (delError) throw delError;
      linksRemoved += aiIds.length;

      // Ensure wix is linked as primary if missing.
      await supabase.from("product_media_assets").upsert(
        {
          product_slug: product.slug,
          media_asset_id: wix.id,
          usage: "primary",
          is_primary: true,
          sort_order: 0
        },
        { onConflict: "product_slug,media_asset_id,usage" }
      );
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? "APPLIED" : "DRY_RUN",
        count: results.length,
        json_fixed: jsonFixed,
        links_removed: linksRemoved,
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
