export function deriveProductSku(slug: string) {
  const cleaned = slug.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "SKU";
}
