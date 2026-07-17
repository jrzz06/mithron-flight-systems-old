export type InventoryAvailability = "available" | "out_of_stock";

export function stockStatusFromQuantity(quantity: number): InventoryAvailability {
  return quantity > 0 ? "available" : "out_of_stock";
}

export function availabilityLabelFromQuantity(quantity: number): string {
  return quantity > 0 ? "In stock" : "Out of stock";
}

export function resolveCatalogAvailability(
  productSlug: string,
  inventoryRows: Array<{ product_slug?: unknown; quantity?: unknown; reserved_quantity?: unknown }>
): number {
  const slug = productSlug.trim();
  if (!slug) return 0;
  const row = inventoryRows.find((entry) => String(entry.product_slug ?? "").trim() === slug);
  const onHand = Number(row?.quantity ?? 0);
  const reserved = Number(row?.reserved_quantity ?? 0);
  const sellable = (Number.isFinite(onHand) ? Math.max(0, Math.trunc(onHand)) : 0)
    - (Number.isFinite(reserved) ? Math.max(0, Math.trunc(reserved)) : 0);
  return Math.max(0, sellable);
}

/** Unique product slugs from order line items (trimmed, non-empty). */
export function collectOrderItemProductSlugs(
  orderItems: Array<{ product_slug?: unknown }>
): string[] {
  const slugs = new Set<string>();
  for (const item of orderItems) {
    const slug = String(item.product_slug ?? "").trim();
    if (slug) slugs.add(slug);
  }
  return [...slugs];
}

/**
 * Merge inventory rows by product_slug. Enrichment rows overwrite base rows for the same slug
 * so order-line stock is not lost when the capped catalog snapshot omits older SKUs.
 */
export function mergeInventoryRowsByProductSlug<T extends { product_slug?: unknown }>(
  baseRows: T[],
  enrichmentRows: T[]
): T[] {
  const bySlug = new Map<string, T>();
  for (const row of baseRows) {
    const slug = String(row.product_slug ?? "").trim();
    if (slug && !bySlug.has(slug)) {
      bySlug.set(slug, row);
    }
  }
  for (const row of enrichmentRows) {
    const slug = String(row.product_slug ?? "").trim();
    if (slug) {
      bySlug.set(slug, row);
    }
  }
  return [...bySlug.values()];
}

/** Chunk values for PostgREST `in.(...)` filters to keep URLs bounded. */
export function chunkValues<T>(values: T[], size: number): T[][] {
  const chunkSize = Math.max(1, Math.trunc(size));
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }
  return chunks;
}
