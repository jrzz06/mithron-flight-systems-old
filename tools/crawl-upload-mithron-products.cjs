// LEGACY PIPELINE ONLY — not used at runtime. Output: data/mithron-products-crawled.generated.json
/* eslint-disable @typescript-eslint/no-require-imports */
const { createHash } = require("node:crypto");
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { dirname, join } = require("node:path");
const { createClient } = require("@supabase/supabase-js");

const root = join(__dirname, "..");
const sourceUrl = "https://www.mithron.co/store-products-sitemap.xml";
const outputPath = join(root, "data", "mithron-products-crawled.generated.json");
const minimumProductCountForReplace = 100;

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

function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

function decodeHtml(value = "") {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/&copy;/g, "(c)")
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtml(html) {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  );
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function slugify(value) {
  return decodeHtml(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 96);
}

function normalizeIdentity(value) {
  return decodeHtml(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function contentHash(value, size = 12) {
  return createHash("sha256").update(value).digest("hex").slice(0, size);
}

function parseMoney(value) {
  if (value === undefined || value === null) return null;
  const parsed = Number(String(value).replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 Mithron source catalog crawler"
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

function extractProductLinks(html) {
  const locs = [...html.matchAll(/<loc>(.*?)<\/loc>/gi)].map((match) => match[1]);
  const matches = locs.length ? locs : html.match(/https:\/\/www\.mithron\.co\/product-page\/[a-z0-9-]+/gi) ?? [];
  return unique(matches.filter((url) => /https:\/\/www\.mithron\.co\/product-page\/[a-z0-9-]+/i.test(url)));
}

function parseJsonLdProducts(html) {
  const products = [];
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];

  function visit(node) {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node !== "object") return;
    if (node["@type"] === "Product" || (Array.isArray(node["@type"]) && node["@type"].includes("Product"))) {
      products.push(node);
    }
    if (node["@graph"]) visit(node["@graph"]);
  }

  for (const script of scripts) {
    try {
      visit(JSON.parse(decodeHtml(script[1])));
    } catch {
      // Ignore malformed non-product JSON-LD blocks.
    }
  }

  return products;
}

const wixFitVariantPattern = /^(https?:\/\/static\.wixstatic\.com\/media\/[^?\s]+?)\/v1\/fit\/w_\d+,h_\d+,q_\d+\/file\.[a-z0-9]+(\?.*)?$/i;

function normalizeProductImageUrl(value) {
  if (typeof value !== "string") return value;
  return value.trim().replace(wixFitVariantPattern, "$1$2");
}

function normalizeImages(image) {
  const images = Array.isArray(image) ? image : image ? [image] : [];
  return images
    .map((item) => {
      if (typeof item === "string") return { src: normalizeProductImageUrl(item), width: null, height: null };
      return {
        src: normalizeProductImageUrl(item.contentUrl ?? item.url ?? null),
        width: item.width ? Number(item.width) : null,
        height: item.height ? Number(item.height) : null
      };
    })
    .filter((item) => item.src);
}

function extractPagePrice(text, product) {
  const offers = product.offers ?? product.Offers;
  const offer = Array.isArray(offers) ? offers[0] : offers;
  const saleFromOffer = parseMoney(offer?.price);
  const currency = offer?.priceCurrency ?? "INR";
  const availability = offer?.availability ?? offer?.Availability ? String(offer.availability ?? offer.Availability).split("/").pop() : null;
  const priceMatch = text.match(/Original price\s*\u20b9([\d,]+(?:\.\d+)?)\s*Sale price\s*\u20b9([\d,]+(?:\.\d+)?)/i);

  return {
    regularPrice: priceMatch ? parseMoney(priceMatch[1]) : null,
    salePrice: priceMatch ? parseMoney(priceMatch[2]) : saleFromOffer,
    currency,
    availability
  };
}

function extractFallbackImages(html) {
  const images = [];
  const ogImage = html.match(/property=["']og:image["'][^>]+content=["']([^"']+)/i)?.[1] ??
    html.match(/content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1];
  if (ogImage) {
    images.push(ogImage);
  }
  return images;
}

function parseFallbackProductFromPage(html, text, url) {
  const title = decodeHtml((html.match(/<title[^>]*>([^<]+)/i)?.[1] ?? "").replace(/\s*\|\s*MITHRON\s*$/i, ""));
  const sourceSlug = url.split("/").pop() ?? "product";
  const name = title || sourceSlug.replace(/-/g, " ");
  const priceMatch = text.match(/Original price\s*\u20b9([\d,]+(?:\.\d+)?)\s*Sale price\s*\u20b9([\d,]+(?:\.\d+)?)/i);
  const description = priceMatch
    ? text.slice((priceMatch.index ?? 0) + priceMatch[0].length).split(/\bQUANTITY\b/i)[0]
    : "";

  return {
    name,
    description: decodeHtml(description),
    image: extractFallbackImages(html),
    offers: {
      price: priceMatch ? parseMoney(priceMatch[2]) : null,
      priceCurrency: "INR",
      availability: null
    }
  };
}

function inferCategory(name, url) {
  const value = `${name} ${url}`.toLowerCase();
  if (/soccer|student|pluto|guru/.test(value)) return "Creative Drones";
  if (/decafly|cinema|video|camera|gimbal/.test(value)) return "Video Drones";
  if (/surveillance|inspection|security/.test(value) && !/agri|liter|spray/.test(value)) return "Surveillance Drones";
  if (/agri|liter|spray|spreader|seed|kisan|a10e|avispray|bhumi|agrow|drone/.test(value) && !/controller|battery|propeller|motor|pump|gear|voltrox|core|board|namo|aerogcs|aero fc|fc/.test(value)) {
    return "Agri Drones";
  }
  return "Accessories";
}

function interestsForCategory(category, name) {
  const value = name.toLowerCase();
  if (category === "Agri Drones") return ["agriculture", "smart-farming"];
  if (category === "Creative Drones") return ["creative-drones"];
  if (category === "Video Drones") return ["video-drones", "creative-drones"];
  if (category === "Surveillance Drones") return ["surveillance", "defense-security", "industrial-inspection"];
  if (/battery|motor|propeller|pump|gear|controller|transmitter|fc|namo|aerogcs|camera|gimbal|board|core/.test(value)) {
    return ["components"];
  }
  return ["components"];
}

function firstSentence(description, fallback) {
  const clean = decodeHtml(description).replace(/\s+/g, " ").trim();
  if (!clean) return fallback;
  const sentence = clean.match(/^(.{30,180}?[.!?])\s/)?.[1];
  return (sentence ?? clean.slice(0, 180)).trim();
}

function createMedia(image, name) {
  if (!image?.src) {
    throw new Error(`Missing source image for ${name}.`);
  }

  return {
    src: image.src,
    alt: name,
    kind: "image",
    width: image.width,
    height: image.height,
    local: false
  };
}

function serializeSourceProduct({ url, product, text, index, extractedAt }) {
  const sourceSlug = url.split("/").pop();
  const name = decodeHtml(product.name ?? sourceSlug.replace(/-/g, " "));
  const description = decodeHtml(product.description ?? "");
  const images = normalizeImages(product.image);
  if (!images.length) {
    throw new Error(`Missing source image for ${name}.`);
  }
  const price = extractPagePrice(text, product);
  const category = inferCategory(name, url);
  const primaryImage = createMedia(images[0], name);
  const slug = `source-${slugify(name) || sourceSlug}`;
  const sourceCatalogId = `mithron-${sourceSlug}`;
  const fingerprint = normalizeIdentity(name);

  return {
    slug,
    name,
    tagline: firstSentence(description, `${name} from Mithron's live product catalog.`),
    price: price.salePrice ?? 0,
    compare_at: price.regularPrice,
    badge: price.availability === "OutOfStock" ? "Out of stock" : null,
    category,
    interests: interestsForCategory(category, name),
    image: primaryImage,
    hero: primaryImage,
    gallery: images.map((image) => createMedia(image, name)),
    hotspots: [],
    variants: [],
    bundles: [
      {
        id: "source-listing",
        name,
        price: price.salePrice ?? 0,
        compareAt: price.regularPrice,
        badge: price.availability === "OutOfStock" ? "Out of stock" : undefined,
        description: firstSentence(description, `${name} source listing.`),
        includes: []
      }
    ],
    story: [],
    specs: {
      Source: "Mithron live product page",
      Availability: price.availability ?? "Unknown",
      Currency: price.currency ?? "INR"
    },
    anchors: ["Overview", "Price", "Source"],
    product_url: url,
    sort_order: index,
    source_url: url,
    source_catalog_id: sourceCatalogId,
    source_fingerprint: fingerprint,
    source_description: description,
    source_images: images,
    source_availability: price.availability,
    source_currency: price.currency,
    source_extracted_at: extractedAt,
    updated_at: extractedAt
  };
}

async function crawlProducts() {
  const homeHtml = await fetchText(sourceUrl);
  const links = extractProductLinks(homeHtml);
  const extractedAt = new Date().toISOString();
  const rows = [];
  const errors = [];

  for (const [index, url] of links.entries()) {
    try {
      const html = await fetchText(url);
      const text = stripHtml(html);
      const [jsonLdProduct] = parseJsonLdProducts(html);
      const product = jsonLdProduct?.name ? jsonLdProduct : parseFallbackProductFromPage(html, text, url);
      rows.push(serializeSourceProduct({ url, product, text, index, extractedAt }));
    } catch (error) {
      errors.push({ url, error: error.message });
    }
  }

  const deduped = [];
  const seen = new Set();
  for (const row of rows) {
    const key = row.source_fingerprint || contentHash(row.source_url);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }

  return {
    version: 1,
    source: sourceUrl,
    extractedAt,
    productPageUrls: links,
    crawledCount: rows.length,
    dedupedCount: deduped.length,
    duplicateCount: rows.length - deduped.length,
    errors,
    products: deduped
  };
}

async function uploadProducts(products) {
  if (products.length < minimumProductCountForReplace) {
    throw new Error(`Refusing to replace Supabase products with only ${products.length} crawled products.`);
  }

  const supabase = createSupabaseAdminClient();
  const { data: existing, error: existingError } = await supabase
    .from("mithron_products")
    .select("slug, source_catalog_id");

  if (existingError) {
    throw new Error(`Could not read existing mithron_products rows: ${existingError.message}`);
  }

  const sourceIds = new Set(products.map((product) => product.source_catalog_id));
  const staleSlugs = (existing ?? [])
    .filter((row) => !row.source_catalog_id || !sourceIds.has(row.source_catalog_id))
    .map((row) => row.slug);

  for (let index = 0; index < staleSlugs.length; index += 100) {
    const batch = staleSlugs.slice(index, index + 100);
    const { error: deleteError } = await supabase.from("mithron_products").delete().in("slug", batch);
    if (deleteError) {
      throw new Error(`mithron_products stale row cleanup failed: ${deleteError.message}`);
    }
  }

  const { error } = await supabase.from("mithron_products").upsert(products, { onConflict: "slug" });
  if (error) {
    throw new Error(`mithron_products source upsert failed: ${error.message}`);
  }

  return { staleRemoved: staleSlugs.length };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  loadProjectEnv();

  const catalog = await crawlProducts();
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`);

  if (dryRun) {
    console.log(JSON.stringify({
      status: "DRY_RUN",
      discoveredUrls: catalog.productPageUrls.length,
      crawledProducts: catalog.crawledCount,
      dedupedProducts: catalog.dedupedCount,
      duplicateProducts: catalog.duplicateCount,
      errors: catalog.errors
    }, null, 2));
    return;
  }

  const upload = await uploadProducts(catalog.products);
  console.log(JSON.stringify({
    status: "VERIFIED",
    discoveredUrls: catalog.productPageUrls.length,
    crawledProducts: catalog.crawledCount,
    dedupedProducts: catalog.dedupedCount,
    duplicateProducts: catalog.duplicateCount,
    staleRemoved: upload.staleRemoved,
    errors: catalog.errors
  }, null, 2));
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
