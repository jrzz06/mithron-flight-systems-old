/**
 * Scrub leftover cutout / wixstatic / AI refs from product JSON (incl. source_images + og_image).
 * Prefer already-live wix-content image/gallery; only query media_assets when needed.
 *
 * Default dry-run. Live: --apply
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const apply = process.argv.includes("--apply");
const slugFilter = process.argv.find((arg) => arg.startsWith("--slug="))?.slice("--slug=".length);

type MediaJson = {
  src?: string;
  alt?: string;
  kind?: string;
  width?: number;
  height?: number;
  local?: boolean;
  priority?: boolean;
};

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readSrc(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object" && typeof (value as MediaJson).src === "string") {
    return String((value as MediaJson).src).trim() || null;
  }
  return null;
}

function isBadLiveUrl(url: string | null | undefined) {
  if (!url) return false;
  return (
    url.includes("catalog-cutouts") ||
    url.includes("wixstatic.com") ||
    url.includes("/ai-cutout/") ||
    url.includes("/ai-hero/")
  );
}

function isWixContent(url: string | null | undefined) {
  return typeof url === "string" && url.includes("/wix-content/");
}

function asMedia(value: unknown, fallbackAlt: string): MediaJson | null {
  const src = readSrc(value);
  if (!src) return null;
  if (value && typeof value === "object") {
    const obj = value as MediaJson;
    return {
      src,
      alt: obj.alt || fallbackAlt,
      kind: obj.kind || "image",
      ...(obj.width ? { width: obj.width } : {}),
      ...(obj.height ? { height: obj.height } : {}),
      local: false
    };
  }
  return { src, alt: fallbackAlt, kind: "image", local: false };
}

async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 5): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const delay = 500 * (i + 1);
      console.error(`retry ${label} attempt=${i + 1} wait=${delay}ms`, error);
      await sleep(delay);
    }
  }
  throw lastError;
}

async function loadWixAssets(supabase: SupabaseClient, slug: string) {
  const { data, error } = await supabase
    .from("media_assets")
    .select("id,public_url,alt_text,width,height,storage_path")
    .eq("bucket", "mithron-products")
    .like("storage_path", `products/${slug}/wix-content/%`)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  let query = supabase
    .from("mithron_products")
    .select("slug,name,image,hero,gallery,source_images,og_image")
    .order("slug");
  if (slugFilter) query = query.eq("slug", slugFilter);

  const { data: products, error } = await withRetry("fetch-products", async () => {
    const res = await query;
    if (res.error) throw res.error;
    return res;
  });
  if (error) throw error;

  const results: Array<Record<string, unknown>> = [];
  let updated = 0;
  let skippedNoWix = 0;
  let errors = 0;

  for (const product of products ?? []) {
    try {
      const imageSrc = readSrc(product.image);
      const heroSrc = readSrc(product.hero);
      const ogSrc = readSrc(product.og_image);
      const gallery = Array.isArray(product.gallery) ? (product.gallery as MediaJson[]) : [];
      const sourceImages = Array.isArray(product.source_images) ? product.source_images : [];
      const alt = product.name || product.slug;

      const galleryBad = gallery.some((item) => isBadLiveUrl(readSrc(item)));
      const liveNeedsRewrite =
        isBadLiveUrl(imageSrc) || isBadLiveUrl(heroSrc) || isBadLiveUrl(ogSrc) || galleryBad;
      const hasWixLive = isWixContent(imageSrc) || gallery.some((item) => isWixContent(readSrc(item)));
      const sourceNeedsRewrite = sourceImages.some((item) => {
        const src = readSrc(item);
        if (!src || isBadLiveUrl(src)) return true;
        if (hasWixLive && !isWixContent(src)) return true;
        return false;
      });

      if (!liveNeedsRewrite && !sourceNeedsRewrite) continue;

      let finalImage = asMedia(product.image, alt);
      let finalHero = asMedia(product.hero, alt);
      let finalGallery = gallery
        .map((item) => asMedia(item, alt))
        .filter((item): item is MediaJson => Boolean(item) && isWixContent(item.src) && !isBadLiveUrl(item.src));

      if (!finalImage || !isWixContent(finalImage.src) || isBadLiveUrl(finalImage.src)) {
        const wixAssets = await withRetry(`wix-${product.slug}`, () => loadWixAssets(supabase, product.slug));
        if (!wixAssets.length) {
          skippedNoWix += 1;
          results.push({ slug: product.slug, action: "skip_no_wix" });
          continue;
        }
        finalImage = {
          src: wixAssets[0].public_url,
          alt: wixAssets[0].alt_text || alt,
          kind: "image",
          ...(wixAssets[0].width ? { width: wixAssets[0].width } : {}),
          ...(wixAssets[0].height ? { height: wixAssets[0].height } : {}),
          priority: true,
          local: false
        };
        finalGallery = wixAssets.slice(1).map((asset) => ({
          src: asset.public_url,
          alt: asset.alt_text || alt,
          kind: "image",
          ...(asset.width ? { width: asset.width } : {}),
          ...(asset.height ? { height: asset.height } : {}),
          local: false
        }));
        if (!finalGallery.length) finalGallery = [finalImage];
      }

      if (!finalHero || !isWixContent(finalHero.src) || isBadLiveUrl(finalHero.src)) {
        finalHero = { ...finalImage };
      }
      if (!finalGallery.length) finalGallery = [finalImage];

      const nextSource = [finalImage, ...finalGallery.filter((item) => item.src !== finalImage!.src)];

      const patch: Record<string, unknown> = {
        image: finalImage,
        hero: finalHero,
        gallery: finalGallery,
        source_images: nextSource,
        updated_at: new Date().toISOString()
      };
      if (ogSrc && isBadLiveUrl(ogSrc)) {
        patch.og_image = finalImage;
      }

      const result = {
        slug: product.slug,
        action: apply ? "updated" : "would_update",
        liveNeedsRewrite,
        sourceNeedsRewrite,
        fromImage: imageSrc,
        toImage: finalImage.src,
        fromSource0: readSrc(sourceImages[0]),
        toSource0: nextSource[0]?.src ?? null,
        fromOg: ogSrc,
        toOg: ogSrc && isBadLiveUrl(ogSrc) ? finalImage.src : ogSrc
      };

      if (apply) {
        await withRetry(`update-${product.slug}`, async () => {
          const { error: updateError } = await supabase
            .from("mithron_products")
            .update(patch)
            .eq("slug", product.slug);
          if (updateError) throw updateError;
        });
        updated += 1;
        results.push(result);
        if (updated % 10 === 0) console.error(`progress updated=${updated}`);
        await sleep(75);
      } else {
        updated += 1;
        results.push(result);
      }
    } catch (error) {
      errors += 1;
      results.push({
        slug: product.slug,
        action: "error",
        error: error instanceof Error ? error.message : String(error)
      });
      console.error(`failed ${product.slug}:`, error);
      await sleep(250);
    }
  }

  const summary = {
    mode: apply ? "APPLIED" : "DRY_RUN",
    products_scanned: products?.length ?? 0,
    products_updated: updated,
    skipped_no_wix: skippedNoWix,
    errors
  };

  const outDir = join(root, "data", "wix-content-migration", "scrub");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `scrub-legacy-refs-${apply ? "applied" : "dry"}.json`);
  writeFileSync(outPath, JSON.stringify({ summary, results }, null, 2));
  console.log(JSON.stringify({ summary, sample: results.slice(0, 8), report: outPath }, null, 2));
  if (errors > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
