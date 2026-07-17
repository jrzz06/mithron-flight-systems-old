import type { Product } from "@/config/types";

export type ShelfSlotProductItem = {
  slug: string;
  name: string;
  sku: string;
  category: string;
  brand: string;
  price: number;
  stock: number;
  imageSrc: string;
  available: boolean;
};

export function mapProductToReplaceItem(product: Product): ShelfSlotProductItem {
  return {
    slug: product.slug,
    name: product.name,
    sku: product.specs["Product ID"] || product.slug,
    category: product.category,
    brand: product.badge || "Mithron",
    price: product.price,
    stock: Number(product.specs["Stock"] ?? product.specs["In Stock"] ?? 0) || 0,
    imageSrc: product.image?.src ?? "",
    available: product.isVisible !== false && product.workflowStatus !== "draft" && product.workflowStatus !== "archived"
  };
}

export function mapProductsToSlotItems(products: Product[]): ShelfSlotProductItem[] {
  return products.map(mapProductToReplaceItem);
}
