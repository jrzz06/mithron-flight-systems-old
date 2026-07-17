import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outputPath = join(root, "data", "mithron-source-catalog.raw.json");
const sourceUrl = "https://www.mithron.co/";
const dryRun = process.argv.includes("--dry-run");

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function extractProductLinks(html) {
  const urls = [];
  const linkPattern = /https:\/\/www\.mithron\.co\/product-page\/[a-z0-9-]+/gi;
  for (const match of html.matchAll(linkPattern)) {
    urls.push(match[0]);
  }
  return unique(urls).sort();
}

function extractCategories(html) {
  const known = [
    "Agri Drones",
    "Video Drones",
    "Creative Drones",
    "Accessories",
    "Survey Drones",
    "Surveillance Drones",
    "Delivery Drone",
    "Aggregator App",
    "Academics",
    "Troubleshoot",
    "Franchise",
    "Export"
  ];
  return known.filter((category) => html.includes(category));
}

function extractVisibleProductText(html) {
  const text = decodeHtml(html);
  const productPattern = new RegExp(
    "(?:New Arrival|New Stock|Best Price|India's|With Android phone)?\\s*([A-Z0-9][A-Za-z0-9 +()[\\]\\-.,/&]+?)\\s+Regular Price\\s+(?:\\u20b9|Rs?\\.?\\s*)([\\d,]+(?:\\.\\d+)?)\\s+Sale Price\\s+(?:\\u20b9|Rs?\\.?\\s*)([\\d,]+(?:\\.\\d+)?)",
    "g"
  );
  const products = [];
  for (const match of text.matchAll(productPattern)) {
    products.push({
      name: match[1].trim(),
      regularPriceInr: Number(match[2].replace(/,/g, "")),
      salePriceInr: Number(match[3].replace(/,/g, ""))
    });
  }
  return products;
}

async function main() {
  const response = await fetch(sourceUrl, {
    headers: {
      "user-agent": "Mithron asset catalog extractor; source metadata only; no image download"
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${sourceUrl}: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const catalog = {
    version: 1,
    source: sourceUrl,
    extractedAt: new Date().toISOString(),
    imagePolicy: "Image URLs are intentionally omitted. This extractor stores source text and product-page URLs only.",
    categories: extractCategories(html),
    productPageUrls: extractProductLinks(html),
    visibleProducts: extractVisibleProductText(html)
  };

  if (dryRun) {
    console.log(JSON.stringify({
      status: "DRY_RUN",
      categories: catalog.categories.length,
      productPageUrls: catalog.productPageUrls.length,
      visibleProducts: catalog.visibleProducts.length
    }, null, 2));
    return;
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(JSON.stringify({
    status: "WROTE",
    outputPath,
    categories: catalog.categories.length,
    productPageUrls: catalog.productPageUrls.length,
    visibleProducts: catalog.visibleProducts.length
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
