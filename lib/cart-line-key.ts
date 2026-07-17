import type { PersistedCartItem } from "@/config/types";

export function cartLineKey(item: Pick<PersistedCartItem, "productSlug" | "bundleId" | "variantId">) {
  return `${item.productSlug}:${item.bundleId}:${item.variantId ?? ""}`;
}

export function cartLinesMatch(
  a: Pick<PersistedCartItem, "productSlug" | "bundleId" | "variantId">,
  b: Pick<PersistedCartItem, "productSlug" | "bundleId" | "variantId">
) {
  return cartLineKey(a) === cartLineKey(b);
}
