export type ProductDeletionBlockers = {
  inventory_movements: number;
  shipment_items: number;
  order_items: number;
  hero_banners: number;
  product_reviews: number;
  faqs: number;
};

export type ProductDeletionBlockerResult = {
  blockers: ProductDeletionBlockers;
  hasBlockers: boolean;
  blockerCount: number;
};

/** Soft blockers (movements, CMS refs) can be force-deleted; order/shipment history cannot. */
export function productDeletionAllowsForce(blockers: ProductDeletionBlockers) {
  return blockers.order_items === 0 && blockers.shipment_items === 0;
}
