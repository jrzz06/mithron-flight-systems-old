"use client";

import { ProductMultiImageField, type ProductMultiImageFieldDefaults } from "@/components/products/product-multi-image-field";

export type SupplierProductImageDefaults = ProductMultiImageFieldDefaults;

export function SupplierProductImageField({ defaults }: { defaults?: SupplierProductImageDefaults }) {
  return <ProductMultiImageField variant="supplier" defaults={defaults} />;
}
