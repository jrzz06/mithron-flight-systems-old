export function decodeHtml(value = "") {
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

export function slugify(value: string) {
  return decodeHtml(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 96);
}

export function normalizeCatalogName(input: string | null | undefined) {
  return decodeHtml(String(input ?? ""))
    .toLowerCase()
    .replace(/\|/g, " ")
    .replace(/–/g, "-")
    .replace(/&/g, "and")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeIdentity(value: string) {
  return decodeHtml(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function normalizeUrl(url: string | null | undefined) {
  return String(url ?? "").trim().toLowerCase().replace(/\/$/, "");
}

export function sourceCatalogIdFromWixSlug(wixSlug: string) {
  return `mithron-${wixSlug}`;
}

export function wixProductPageUrl(wixSlug: string) {
  return `https://www.mithron.co/product-page/${wixSlug}`;
}

export function parseMoney(value: unknown) {
  if (value === undefined || value === null) return null;
  const parsed = Number(String(value).replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function inferProductCategory(productName: string) {
  const source = productName.toLowerCase();
  if (/(drone soccer|student drone|pluto|guru student|soccer drone)/.test(source)) return "Creative Drones";
  if (/(surveillance|safety security|thermal|monal)/.test(source)) return "Surveillance Drones";
  if (/(video|cinema|4k|gimbal|camera survey|decafly|siyi|skydroid c10|videography|multispectral)/.test(source)) {
    return "Video Drones";
  }
  if (/(agri|spray|spreader|kisan|liter|tc certified|seed|flybox|nozzle)/.test(source)) return "Agri Drones";
  return "Accessories";
}

export function extractCapacityTokens(name: string) {
  const normalized = normalizeCatalogName(name);
  const tokens = new Set<string>();
  for (const match of normalized.matchAll(/\b(\d+)\s*(l|liter|liters|litre|litres)\b/g)) {
    tokens.add(`${match[1]}l`);
  }
  for (const match of normalized.matchAll(/\b(a\d+e)\b/g)) {
    tokens.add(match[1]);
  }
  return [...tokens];
}

export function capacityClusterKey(name: string, category: string) {
  const tokens = extractCapacityTokens(name);
  if (!tokens.length) return null;
  return `${category.toLowerCase()}::${tokens.sort().join("+")}`;
}
