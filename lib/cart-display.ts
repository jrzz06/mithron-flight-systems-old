import { cartLineKey } from "@/lib/cart-line-key";
import type { CartItem, PersistedCartItem } from "@/config/types";

function humanizeSlug(slug: string) {
  return slug
    .replace(/^source-/, "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function buildOptimisticCartLines(items: PersistedCartItem[]): CartItem[] {
  return items.map((item) => ({
    productSlug: item.productSlug,
    bundleId: item.bundleId,
    quantity: item.quantity,
    ...(item.variantId ? { variantId: item.variantId } : {}),
    productName: item.productName?.trim() || humanizeSlug(item.productSlug),
    bundleName: item.bundleName?.trim() || "Standard setup",
    unitPrice: 0,
    compareAt: null,
    image: item.image?.trim() || ""
  }));
}

export function mergeCartDisplayWithPricing(displayLines: CartItem[], resolvedLines: CartItem[]) {
  const pricedByKey = new Map(
    resolvedLines.map((line) => [cartLineKey(line), line] as const)
  );

  return displayLines.map((line) => {
    const priced = pricedByKey.get(cartLineKey(line));
    if (!priced) return line;

    return {
      ...line,
      unitPrice: priced.unitPrice,
      compareAt: priced.compareAt,
      ...(priced.chargeTax !== undefined ? { chargeTax: priced.chargeTax } : {}),
      ...(priced.taxGroup ? { taxGroup: priced.taxGroup } : {}),
      ...(priced.taxRate !== undefined ? { taxRate: priced.taxRate } : {}),
      ...(priced.taxIncluded !== undefined ? { taxIncluded: priced.taxIncluded } : {}),
      ...(priced.category ? { category: priced.category } : {}),
      ...(priced.sku ? { sku: priced.sku } : {})
    };
  });
}

export function cartLinesMatchPersisted(persisted: PersistedCartItem[], resolved: CartItem[]) {
  if (persisted.length !== resolved.length) return false;

  const resolvedByKey = new Map(
    resolved.map((line) => [cartLineKey(line), line.quantity] as const)
  );

  return persisted.every(
    (item) => resolvedByKey.get(cartLineKey(item)) === item.quantity
  );
}
