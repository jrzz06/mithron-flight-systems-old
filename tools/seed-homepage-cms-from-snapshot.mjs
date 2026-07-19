#!/usr/bin/env node
/**
 * Seed Supabase homepage CMS from a live snapshot (scripts/cms-snapshots/homepage-live-latest.json).
 * Additive only: fills empty fields with real live values; never invents marketing copy.
 *
 * Usage:
 *   node tools/seed-homepage-cms-from-snapshot.mjs           # dry-run
 *   node tools/seed-homepage-cms-from-snapshot.mjs --apply   # write
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const apply = process.argv.includes("--apply");

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

function loadSnapshot() {
  const path = join(root, "scripts", "cms-snapshots", "homepage-live-latest.json");
  if (!existsSync(path)) {
    throw new Error(`Missing snapshot at ${path}. Run: node tools/snapshot-homepage-live.mjs`);
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

function ensureShelf(homepage, key, liveShelf) {
  homepage.shelves ??= {};
  homepage.shelves[key] ??= {};
  const shelf = homepage.shelves[key];
  const changes = [];
  // Always align to the live storefront View All URL captured in the snapshot
  // (what visitors actually saw before CMS href was wired).
  if (String(shelf.href ?? "").trim() !== liveShelf.liveHref) {
    shelf.href = liveShelf.liveHref;
    changes.push("href");
  }
  if (!String(shelf.heroCtaHref ?? "").trim() || String(shelf.heroCtaHref).trim() === String(shelf.href ?? "").trim()) {
    // Keep hero CTA in sync with live catalog href when empty or previously mirroring href
    if (String(shelf.heroCtaHref ?? "").trim() !== liveShelf.liveHref) {
      shelf.heroCtaHref = liveShelf.liveHref;
      changes.push("heroCtaHref");
    }
  }
  return changes;
}

async function main() {
  loadProjectEnv();
  const snapshot = loadSnapshot();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data, error } = await supabase.from("admin_settings").select("payload").eq("id", "global").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.payload) throw new Error("admin_settings global row is missing.");

  const payload = structuredClone(data.payload);
  payload.homepage ??= {};
  const homepage = payload.homepage;
  const report = { mode: apply ? "apply" : "dry-run", changes: [] };

  // --- Hero: upsert live-rendered copy into hero_banners ---
  const { data: heroRows, error: heroReadError } = await supabase.from("hero_banners").select("*");
  if (heroReadError) throw new Error(heroReadError.message);

  const heroById = new Map((heroRows ?? []).map((row) => [String(row.id), row]));
  for (const slide of snapshot.hero.slides) {
    const existing = heroById.get(slide.id);
    if (!existing) {
      report.changes.push({ hero: slide.id, action: "skip-missing-row" });
      continue;
    }
    const patch = {
      title: slide.title,
      subtitle: slide.subtitle,
      cta_label: slide.cta,
      href: slide.href,
      status: "published",
      is_visible: true,
      updated_at: new Date().toISOString()
    };
    report.changes.push({
      hero: slide.id,
      action: "upsert-live-copy",
      title: slide.title,
      href: slide.href
    });
    if (apply) {
      const { error: upsertError } = await supabase.from("hero_banners").update(patch).eq("id", slide.id);
      if (upsertError) throw new Error(`hero ${slide.id}: ${upsertError.message}`);
    }
  }

  // --- Shelves: seed live View All hrefs ---
  for (const [key, liveShelf] of Object.entries(snapshot.shelves)) {
    const changed = ensureShelf(homepage, key, liveShelf);
    if (changed.length) {
      report.changes.push({ shelf: key, fields: changed, href: liveShelf.href });
    }
  }

  // --- City mission tiles: seed Play Store URLs (current live) ---
  homepage.missions ??= {};
  homepage.missions.city ??= { tiles: [] };
  const cityTiles = Array.isArray(homepage.missions.city.tiles) ? homepage.missions.city.tiles : [];
  const snapTiles = snapshot.missions.city.tiles ?? [];
  snapTiles.forEach((snapTile, index) => {
    if (!cityTiles[index]) return;
    const current = String(cityTiles[index].href ?? "").trim();
    if (!current) {
      cityTiles[index].href = snapshot.playStoreUrl;
      report.changes.push({ cityTile: index, label: snapTile.label, href: snapshot.playStoreUrl });
    }
  });
  homepage.missions.city.tiles = cityTiles;

  // Also sync draftV1 shelves/missions when present
  if (homepage.draftV1 && typeof homepage.draftV1 === "object") {
    homepage.draftV1.shelves ??= homepage.shelves;
    for (const [key, liveShelf] of Object.entries(snapshot.shelves)) {
      ensureShelf(homepage.draftV1, key, liveShelf);
    }
    homepage.draftV1.missions ??= {};
    homepage.draftV1.missions.city = structuredClone(homepage.missions.city);
  }

  // --- Mini carousel: pin real resolved slides if CMS empty ---
  homepage.v2 ??= {};
  homepage.draftV2 ??= structuredClone(homepage.v2);
  const liveMini = homepage.v2.miniCarousel ?? { enabled: true, slides: [] };
  if (!Array.isArray(liveMini.slides) || liveMini.slides.length === 0) {
    const pinned = (snapshot.miniCarousel.slides ?? [])
      .filter((slide) => slide.productSlug)
      .map((slide, index) => ({
        id: `pinned-${slide.productSlug}-${index}`,
        enabled: true,
        productSlug: slide.productSlug,
        heading: slide.heading,
        description: slide.heading,
        ctaLabel: "View",
        href: slide.href,
        imageSrc: slide.imageSrc,
        imageAlt: slide.heading,
        sortOrder: index
      }));
    if (pinned.length) {
      homepage.v2.miniCarousel = { enabled: snapshot.miniCarousel.enabled !== false, slides: pinned };
      homepage.draftV2.miniCarousel = structuredClone(homepage.v2.miniCarousel);
      report.changes.push({ miniCarousel: "pinned-from-live", count: pinned.length });
    }
  }

  // --- Related articles header from live snapshot ---
  homepage.v2.relatedArticles ??= {};
  const related = homepage.v2.relatedArticles;
  if (!related.sectionTitle) {
    related.sectionTitle = snapshot.relatedArticles.sectionTitle;
    report.changes.push({ relatedArticles: "sectionTitle", value: related.sectionTitle });
  }
  if (!related.sectionLead) {
    related.sectionLead = snapshot.relatedArticles.sectionLead;
    report.changes.push({ relatedArticles: "sectionLead" });
  }
  if (!String(related.browseAllHref ?? "").trim()) {
    related.browseAllHref = snapshot.relatedArticles.browseAllHref;
    report.changes.push({ relatedArticles: "browseAllHref", value: related.browseAllHref });
  }
  homepage.draftV2.relatedArticles = {
    ...(homepage.draftV2.relatedArticles ?? {}),
    ...related
  };

  if (apply) {
    const { error: updateError } = await supabase
      .from("admin_settings")
      .upsert(
        { id: "global", payload, updated_at: new Date().toISOString() },
        { onConflict: "id" }
      );
    if (updateError) throw new Error(updateError.message);
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
