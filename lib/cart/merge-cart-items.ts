import type { PersistedCartItem } from "@/config/types";
import { cartLineKey } from "@/lib/cart-line-key";

function clampQuantity(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(99, Math.trunc(value)));
}

/**
 * Merge authenticated (server) cart with guest (local) cart.
 * Same productSlug+bundleId+variantId → sum quantities (clamped 1–99).
 * Auth lines are preserved first; guest adds new lines or increases qty.
 * Guest display fields win when both sides have the same line.
 */
export function mergeCartItemLists(
  serverItems: PersistedCartItem[],
  localItems: PersistedCartItem[]
): PersistedCartItem[] {
  const merged = new Map<string, PersistedCartItem>();
  const order: string[] = [];

  const ingest = (items: PersistedCartItem[], preferDisplayFields: boolean) => {
    for (const item of items) {
      const key = cartLineKey(item);
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, { ...item, quantity: clampQuantity(item.quantity) });
        order.push(key);
        continue;
      }
      const nextQuantity = clampQuantity(existing.quantity + item.quantity);
      merged.set(key, {
        ...existing,
        ...(preferDisplayFields && item.productName ? { productName: item.productName } : {}),
        ...(preferDisplayFields && item.bundleName ? { bundleName: item.bundleName } : {}),
        ...(preferDisplayFields && item.image ? { image: item.image } : {}),
        quantity: nextQuantity
      });
    }
  };

  ingest(serverItems, false);
  ingest(localItems, true);

  return order.map((key) => merged.get(key)!).filter(Boolean);
}
