#!/usr/bin/env node
/**
 * Deletes verified 100%-safe unused media_assets rows and their storage files.
 * Excludes interest_legacy and avif_mission (still referenced by runtime manifests).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

function loadEnv() {
  const envPath = join(projectRoot, ".env.local");
  const text = readFileSync(envPath, "utf8");
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  }
  return env;
}

const TARGETS = [
  { id: "catalog.cutout.v1.10-liter-dual-agri-drone-with-spreader.57db50015e30", bucket: "mithron-products", storage_path: "catalog-cutouts/v1/10-liter-dual-agri-drone-with-spreader-57db50015e30.webp" },
  { id: "catalog.cutout.v1.10-liter-dual-agri-drone.57db50015e30", bucket: "mithron-products", storage_path: "catalog-cutouts/v1/10-liter-dual-agri-drone-57db50015e30.webp" },
  { id: "catalog.cutout.v1.10l-agri-drone-best-price.3b550657cbf7", bucket: "mithron-products", storage_path: "catalog-cutouts/v1/10l-agri-drone-best-price-3b550657cbf7.webp" },
  { id: "catalog.cutout.v1.16l-type-certified-agri-drone-add-on-with-spreader.d7860e0bc92c", bucket: "mithron-products", storage_path: "catalog-cutouts/v1/16l-type-certified-agri-drone-add-on-with-spreader-d7860e0bc92c.webp" },
  { id: "catalog.cutout.v1.16l-type-certified-agri-drone-variants-with-spreader.d7860e0bc92c", bucket: "mithron-products", storage_path: "catalog-cutouts/v1/16l-type-certified-agri-drone-variants-with-spreader-d7860e0bc92c.webp" },
  { id: "catalog.cutout.v1.16l-type-certified-agri-drone-variants-without-spreader.d7860e0bc92c", bucket: "mithron-products", storage_path: "catalog-cutouts/v1/16l-type-certified-agri-drone-variants-without-spreader-d7860e0bc92c.webp" },
  { id: "catalog.cutout.v1.a10e-10-liters-agri-dronever2.9dfab67d08f8", bucket: "mithron-products", storage_path: "catalog-cutouts/v1/a10e-10-liters-agri-dronever2-9dfab67d08f8.webp" },
  { id: "catalog.cutout.v1.a10e-agri-drone-10-liters-base.9dfab67d08f8", bucket: "mithron-products", storage_path: "catalog-cutouts/v1/a10e-agri-drone-10-liters-base-9dfab67d08f8.webp" },
  { id: "catalog.cutout.v1.agri-kisan-drone-medium-10-liter.33f67e620834", bucket: "mithron-products", storage_path: "catalog-cutouts/v1/agri-kisan-drone-medium-10-liter-33f67e620834.webp" },
  { id: "catalog.cutout.v1.agri-kisan-drone-small-8-liter-2.33f67e620834", bucket: "mithron-products", storage_path: "catalog-cutouts/v1/agri-kisan-drone-small-8-liter-2-33f67e620834.webp" },
  { id: "catalog.cutout.v1.agri-kisan-drone-small-8-liter.33f67e620834", bucket: "mithron-products", storage_path: "catalog-cutouts/v1/agri-kisan-drone-small-8-liter-33f67e620834.webp" },
  { id: "catalog.cutout.v1.horizontal-landing-gear-10l-agri-drone.a0ffb36cbba5", bucket: "mithron-products", storage_path: "catalog-cutouts/v1/horizontal-landing-gear-10l-agri-drone-a0ffb36cbba5.webp" },
  { id: "catalog.cutout.v1.horizontal-landing-gear-16l-agri-drone.a0ffb36cbba5", bucket: "mithron-products", storage_path: "catalog-cutouts/v1/horizontal-landing-gear-16l-agri-drone-a0ffb36cbba5.webp" },
  { id: "catalog.cutout.v1.source-10-liter-dual-agri-drone-with-spreader.28c94ac80a8a", bucket: "mithron-products", storage_path: "catalog-cutouts/v1/source-10-liter-dual-agri-drone-with-spreader-28c94ac80a8a.webp" },
  { id: "catalog.cutout.v1.source-10-liter-dual-agri-drone.28c94ac80a8a", bucket: "mithron-products", storage_path: "catalog-cutouts/v1/source-10-liter-dual-agri-drone-28c94ac80a8a.webp" },
  { id: "catalog.cutout.v1.source-10l-agri-drone-best-price.3b550657cbf7", bucket: "mithron-products", storage_path: "catalog-cutouts/v1/source-10l-agri-drone-best-price-3b550657cbf7.webp" },
  { id: "catalog.cutout.v1.source-16l-type-certified-agri-drone.d7860e0bc92c", bucket: "mithron-products", storage_path: "catalog-cutouts/v1/source-16l-type-certified-agri-drone-d7860e0bc92c.webp" },
  { id: "catalog.cutout.v1.source-a10e-10-liters-agri-dronever2.e993db5c6436", bucket: "mithron-products", storage_path: "catalog-cutouts/v1/source-a10e-10-liters-agri-dronever2-e993db5c6436.webp" },
  { id: "catalog.cutout.v1.source-a10e-agri-drone-10-liters-base.e993db5c6436", bucket: "mithron-products", storage_path: "catalog-cutouts/v1/source-a10e-agri-drone-10-liters-base-e993db5c6436.webp" },
  { id: "media-products-products-dfvbn-20260611t140703302z-screenshot-2026-06-11-163243", bucket: "mithron-products", storage_path: "products/dfvbn/20260611T140703302Z-screenshot-2026-06-11-163243.png" },
  { id: "media-products-products-layam-20260611t140331516z-screenshot-2026-06-11-165121", bucket: "mithron-products", storage_path: "products/layam/20260611T140331516Z-screenshot-2026-06-11-165121.png" },
  { id: "media-products-products-this-is-testin-gof-laym-20260711t135206911z-screenshot-2026-07-11-191806", bucket: "mithron-products", storage_path: "products/this-is-testin-gof-laym/20260711T135206911Z-screenshot-2026-07-11-191806.png" },
  { id: "media-products-products-this-is-testin-gof-laym-20260711t135212889z-screenshot-2026-07-11-191745", bucket: "mithron-products", storage_path: "products/this-is-testin-gof-laym/20260711T135212889Z-screenshot-2026-07-11-191745.png" },
  { id: "media-products-products-this-is-testin-gof-laym-20260711t135217217z-screenshot-2026-07-11-191618", bucket: "mithron-products", storage_path: "products/this-is-testin-gof-laym/20260711T135217217Z-screenshot-2026-07-11-191618.png" },
  { id: "media-products-products-this-is-testin-gof-laym-20260711t135221912z-screenshot-2026-07-11-185459", bucket: "mithron-products", storage_path: "products/this-is-testin-gof-laym/20260711T135221912Z-screenshot-2026-07-11-185459.png" },
  { id: "media-products-products-zio-20260613t111109793z-cross-right", bucket: "mithron-products", storage_path: "products/zio/20260613T111109793Z-cross-right.png" },
  { id: "media-products-products-zio-20260613t111206768z-cross-right", bucket: "mithron-products", storage_path: "products/zio/20260613T111206768Z-cross-right.png" },
  { id: "media-products-products-zio-20260613t111305982z-cross-right", bucket: "mithron-products", storage_path: "products/zio/20260613T111305982Z-cross-right.png" }
];

const env = loadEnv();
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const report = {
  storageDeleted: [],
  storageErrors: [],
  dbDeleted: 0,
  dbError: null
};

for (const target of TARGETS) {
  const { error } = await supabase.storage.from(target.bucket).remove([target.storage_path]);
  if (error) {
    report.storageErrors.push({ id: target.id, error: error.message });
  } else {
    report.storageDeleted.push(target.id);
  }
}

const ids = TARGETS.map((t) => t.id);
const { data, error: dbError } = await supabase.from("media_assets").delete().in("id", ids).select("id");
report.dbDeleted = data?.length ?? 0;
report.dbError = dbError?.message ?? null;

console.log(JSON.stringify(report, null, 2));
