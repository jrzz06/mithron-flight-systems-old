import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  fetchWixCatalog,
  loadWixClientFromEnv,
  type WixProductSnapshot
} from "../lib/wix/catalog-client.ts";
import {
  fetchWixReviews,
  type WixReview
} from "../lib/wix/reviews-client.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
/** Homepage carousel shows 6; import that many distinct product reviews when available. */
const IMPORT_COUNT = 6;
const DEFAULT_WIX_SITE_ID = "aca2c10f-62df-404a-be24-d15cc3f32d34";

type ProductRow = {
  slug: string;
  name: string;
  image: unknown;
  is_visible: boolean;
  merge_status: string | null;
};

type SelectedReview = {
  review: WixReview;
  product: ProductRow;
};

function loadProjectEnv() {
  for (const envPath of [join(root, ".env.local"), join(root, ".env")]) {
    if (!existsSync(envPath)) continue;
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const separator = trimmed.indexOf("=");
      const name = trimmed.slice(0, separator);
      if (!name || process.env[name]) continue;
      process.env[name] = trimmed
        .slice(separator + 1)
        .replace(/^["']|["']$/g, "");
    }
  }
}

function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required."
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function hasUsableImage(image: unknown) {
  if (!image || typeof image !== "object" || Array.isArray(image)) return false;
  const row = image as Record<string, unknown>;
  return typeof row.src === "string" && row.src.trim().length > 0;
}

function storefrontSlug(product: WixProductSnapshot) {
  return `source-${product.wix_slug}`;
}

function selectTopReviews(
  reviews: WixReview[],
  wixProductById: Map<string, WixProductSnapshot>,
  eligibleProductBySlug: Map<string, ProductRow>
) {
  const candidates: SelectedReview[] = [];

  for (const review of reviews) {
    const wixProduct = wixProductById.get(review.entityId);
    if (!wixProduct) continue;
    const product = eligibleProductBySlug.get(storefrontSlug(wixProduct));
    if (!product) continue;
    candidates.push({ review, product });
  }

  const selected: SelectedReview[] = [];
  const usedProducts = new Set<string>();
  for (const candidate of candidates) {
    if (usedProducts.has(candidate.product.slug)) continue;
    selected.push(candidate);
    usedProducts.add(candidate.product.slug);
    if (selected.length === IMPORT_COUNT) return selected;
  }

  for (const candidate of candidates) {
    if (selected.some(({ review }) => review.id === candidate.review.id)) continue;
    selected.push(candidate);
    if (selected.length === IMPORT_COUNT) break;
  }

  return selected;
}

function importedReviewRow(
  selection: SelectedReview,
  displayOrder: number
) {
  const { review, product } = selection;
  const createdAt =
    review.createdDate && !Number.isNaN(Date.parse(review.createdDate))
      ? new Date(review.createdDate).toISOString()
      : new Date().toISOString();

  return {
    product_slug: product.slug,
    product_name: product.name,
    rating: review.content.rating,
    title: (review.content.title || product.name).slice(0, 160),
    body: review.content.body.slice(0, 4000),
    customer_name: review.authorName.slice(0, 120),
    image_urls: review.content.imageUrls.slice(0, 6),
    helpful_count: Math.max(0, review.helpfulness),
    verified_purchase: review.verified || true,
    status: "published",
    is_visible: true,
    pinned: true,
    display_order: displayOrder,
    source: "wix",
    external_id: review.id,
    created_at: createdAt,
    updated_at: new Date().toISOString()
  };
}

async function hideSeedReviews(
  supabase: ReturnType<typeof createSupabaseAdminClient>
) {
  const { data, error } = await supabase
    .from("customer_order_reviews")
    .update({ is_visible: false, pinned: false, updated_at: new Date().toISOString() })
    .eq("source", "customer")
    .like("external_id", "seed-%")
    .eq("is_visible", true)
    .select("id");

  if (error) {
    throw new Error(`Failed to hide seed reviews: ${error.message}`);
  }

  return data?.length ?? 0;
}

async function main() {
  loadProjectEnv();
  const wixClient = loadWixClientFromEnv({
    ...process.env,
    WIX_SITE_ID: process.env.WIX_SITE_ID || DEFAULT_WIX_SITE_ID
  });
  const supabase = createSupabaseAdminClient();

  console.log(`Fetching Wix catalog and reviews for site ${wixClient.siteId}...`);
  const [catalog, reviewSnapshot] = await Promise.all([
    fetchWixCatalog(wixClient),
    fetchWixReviews(wixClient)
  ]);

  const { data: productRows, error: productError } = await supabase
    .from("mithron_products")
    .select("slug,name,image,is_visible,merge_status")
    .eq("is_visible", true);

  if (productError) {
    throw new Error(`Failed to load eligible products: ${productError.message}`);
  }

  const eligibleProductBySlug = new Map(
    ((productRows ?? []) as ProductRow[])
      .filter(
        (product) =>
          product.merge_status !== "archived_merged" &&
          hasUsableImage(product.image)
      )
      .map((product) => [product.slug, product])
  );
  const wixProductById = new Map(
    catalog.products.map((product) => [product.wix_product_id, product])
  );
  const selected = selectTopReviews(
    reviewSnapshot.reviews,
    wixProductById,
    eligibleProductBySlug
  );

  if (selected.length < IMPORT_COUNT) {
    throw new Error(
      `Only ${selected.length} eligible Wix reviews could be mapped to visible storefront products with images; ${IMPORT_COUNT} are required.`
    );
  }

  const hiddenSeedCount = await hideSeedReviews(supabase);
  if (hiddenSeedCount > 0) {
    console.log(`Hid ${hiddenSeedCount} seed placeholder reviews from the storefront.`);
  }

  // Unpin previous Wix imports so only this sync's featured set stays pinned.
  const { error: unpinError } = await supabase
    .from("customer_order_reviews")
    .update({ pinned: false, updated_at: new Date().toISOString() })
    .eq("source", "wix")
    .eq("pinned", true);

  if (unpinError) {
    throw new Error(`Failed to clear previous Wix pins: ${unpinError.message}`);
  }

  for (const [index, selection] of selected.entries()) {
    const row = importedReviewRow(selection, index + 1);
    const { data: existing, error: lookupError } = await supabase
      .from("customer_order_reviews")
      .select("id")
      .eq("source", "wix")
      .eq("external_id", selection.review.id)
      .maybeSingle();

    if (lookupError) {
      throw new Error(
        `Failed to check Wix review ${selection.review.id}: ${lookupError.message}`
      );
    }

    const query = existing?.id
      ? supabase
          .from("customer_order_reviews")
          .update(row)
          .eq("id", existing.id)
      : supabase.from("customer_order_reviews").insert(row);
    const { error } = await query;
    if (error) {
      throw new Error(
        `Failed to sync Wix review ${selection.review.id}: ${error.message}`
      );
    }

    console.log(
      `${index + 1}. ${selection.review.content.rating}★ — ${selection.review.authorName} — ${selection.product.name}`
    );
  }

  console.log(
    `Synced ${selected.length} Wix reviews from ${reviewSnapshot.reviews.length} published candidates.`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
