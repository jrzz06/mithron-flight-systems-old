#!/usr/bin/env node
/**
 * Capture the resolved live homepage content (what visitors actually see),
 * including storefront overrides that currently win over CMS.
 * Output is the only seed/fallback source for CMS cutover.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

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

const HERO_LIVE_COPY = {
  "ag10-arrival": {
    title: "Drone is Mithron",
    subtitle: "India's trusted drone store and service network"
  },
  "mapping-flight": {
    title: "Global Drone Connect",
    subtitle: "A marketplace for global product import, export, and live price bids"
  },
  "drone-ecosystem": {
    title: "One Stop Drone Mithron",
    subtitle: "Sales, rentals, troubleshooting, training, import, and financing in one place"
  }
};

const HERO_LIVE_CTA = {
  href: "https://www.mithronsmart.com",
  label: "Visit Mithron Smart"
};

const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.mithronfarmer";

const RELATED_ARTICLES_LIVE = {
  sectionTitle: "Related Articles",
  sectionLead:
    "Explore drone technology, agriculture operations, aerial intelligence, precision farming, maintenance guidance, and industry insights from Mithron.",
  browseAllHref: "/blog"
};

/** Exact live View All hrefs from getHomepageShelfCatalogHref / storefront shelves. */
const SHELF_LIVE_HREFS = {
  droneWorld: "/products?filter=drones",
  droneCare: "/products?filter=accessories-spare-parts",
  globalProducts: "/products?filter=global-products"
};

function mediaSrc(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value.src) return String(value.src);
  return "";
}

async function main() {
  loadProjectEnv();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const [{ data: heroRows, error: heroError }, { data: settings, error: settingsError }, { data: products, error: productsError }] =
    await Promise.all([
      supabase
        .from("hero_banners")
        .select("*")
        .eq("status", "published")
        .eq("is_visible", true)
        .order("sort_order", { ascending: true }),
      supabase.from("admin_settings").select("payload").eq("id", "global").maybeSingle(),
      supabase
        .from("mithron_products")
        .select("slug,name,image,category,workflow_status,is_visible")
        .eq("workflow_status", "published")
        .eq("is_visible", true)
        .limit(500)
    ]);

  if (heroError) throw new Error(`hero_banners: ${heroError.message}`);
  if (settingsError) throw new Error(`admin_settings: ${settingsError.message}`);
  if (productsError) throw new Error(`mithron_products: ${productsError.message}`);

  const homepage = settings?.payload?.homepage ?? {};
  const v2 = homepage.v2 ?? {};
  const shelves = homepage.shelves ?? {};
  const missions = homepage.missions ?? {};

  const resolvedHero = (heroRows ?? [])
    .filter((row) => row.id !== "surveillance-grid")
    .slice(0, 3)
    .map((row) => {
      const id = String(row.id);
      const copy = HERO_LIVE_COPY[id];
      return {
        id,
        productSlug: String(row.product_slug ?? ""),
        title: copy?.title ?? String(row.title ?? ""),
        subtitle: copy?.subtitle ?? String(row.subtitle ?? ""),
        cta: copy ? HERO_LIVE_CTA.label : String(row.cta_label ?? row.cta ?? ""),
        href: copy ? HERO_LIVE_CTA.href : String(row.href ?? ""),
        imageSrc: mediaSrc(row.image) || mediaSrc(row.poster),
        imageAlt: (row.image && row.image.alt) || String(row.title ?? ""),
        theme: row.theme === "dark" ? "dark" : "light",
        composition: row.composition ?? null,
        titleColor: row.title_color ?? null,
        subtitleColor: row.subtitle_color ?? null,
        sortOrder: Number(row.sort_order ?? 0)
      };
    });

  const productBySlug = new Map((products ?? []).map((p) => [p.slug, p]));

  const miniSlides = Array.isArray(v2.miniCarousel?.slides) ? v2.miniCarousel.slides : [];
  const resolvedMini = miniSlides
    .filter((slide) => slide?.enabled !== false)
    .map((slide, index) => {
      const slug = String(slide.productSlug ?? "").trim();
      const product = slug ? productBySlug.get(slug) : null;
      if (slug && !product) {
        return { index, productSlug: slug, omitted: true, reason: "missing_unpublished" };
      }
      if (product) {
        return {
          index,
          productSlug: product.slug,
          heading: product.name,
          href: `/product/${product.slug}`,
          imageSrc: mediaSrc(product.image) || String(slide.imageSrc ?? ""),
          omitted: false
        };
      }
      return {
        index,
        productSlug: "",
        heading: String(slide.heading ?? "Featured"),
        href: String(slide.href ?? "/products"),
        imageSrc: String(slide.imageSrc ?? ""),
        omitted: false
      };
    });

  const resolveShelf = (key, liveHref) => {
    const shelf = shelves[key] ?? {};
    const slugs = Array.isArray(shelf.productSlugs) ? shelf.productSlugs.filter(Boolean) : [];
    return {
      title: shelf.title || null,
      eyebrow: shelf.eyebrow || null,
      // Live View All before CMS wiring = catalog href (storefront ignored CMS href).
      href: liveHref,
      heroCtaHref: shelf.heroCtaHref?.trim() || liveHref,
      liveHref,
      heroImageSrc: shelf.heroImageSrc || "",
      productSlugs: slugs,
      cmsHrefBeforeFix: shelf.href || ""
    };
  };

  const cityTiles = Array.isArray(missions.city?.tiles) ? missions.city.tiles : [];
  const resolvedCityTiles = cityTiles.map((tile, index) => ({
    index,
    label: tile.label ?? "",
    imageSrc: tile.imageSrc ?? "",
    href: PLAY_STORE_URL,
    cmsHrefBeforeOverride: tile.href ?? ""
  }));

  const snapshot = {
    capturedAt: new Date().toISOString(),
    source: "resolved-live-render",
    hero: {
      slides: resolvedHero,
      liveCopyOverridesApplied: true,
      liveCta: HERO_LIVE_CTA
    },
    miniCarousel: {
      enabled: v2.miniCarousel?.enabled !== false,
      slides: resolvedMini.filter((s) => !s.omitted),
      omittedMissing: resolvedMini.filter((s) => s.omitted)
    },
    shelves: {
      droneWorld: resolveShelf("droneWorld", SHELF_LIVE_HREFS.droneWorld),
      droneCare: resolveShelf("droneCare", SHELF_LIVE_HREFS.droneCare),
      globalProducts: resolveShelf("globalProducts", SHELF_LIVE_HREFS.globalProducts)
    },
    missions: {
      agri: missions.agri ?? null,
      city: {
        ...(missions.city ?? {}),
        tiles: resolvedCityTiles
      }
    },
    relatedArticles: {
      ...RELATED_ARTICLES_LIVE,
      items: Array.isArray(v2.relatedArticles?.items) ? v2.relatedArticles.items : [],
      selectedItems: Array.isArray(v2.relatedArticles?.selectedItems) ? v2.relatedArticles.selectedItems : []
    },
    playStoreUrl: PLAY_STORE_URL
  };

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const outDir = join(root, "scripts", "cms-snapshots");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `homepage-live-${stamp}.json`);
  writeFileSync(outPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  writeFileSync(join(outDir, "homepage-live-latest.json"), `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        written: outPath,
        heroSlides: snapshot.hero.slides.length,
        miniSlides: snapshot.miniCarousel.slides.length,
        cityTiles: resolvedCityTiles.length,
        relatedTitle: snapshot.relatedArticles.sectionTitle
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
