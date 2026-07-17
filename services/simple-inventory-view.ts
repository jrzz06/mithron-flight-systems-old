import { deriveProductSku } from "@/lib/product-sku";
import { stockStatusFromQuantity } from "@/services/inventory";

export type SimpleInventoryStatus = "available" | "out_of_stock" | "archived" | "discontinued";

export type SimpleInventoryRow = {
  id: string;
  productSlug: string;
  productName: string;
  productImage: string | null;
  sku: string;
  variantId: string | null;
  warehouseCode: string;
  stockStatus: SimpleInventoryStatus;
  quantity: number;
  category: string;
  price: number;
  inventoryValue: number;
  lastUpdated: string | null;
  warehouseUpdatedAt: string | null;
  inventoryUpdatedAt: string | null;
  supplierName: string;
  isArchived: boolean;
};

type AdminRow = Record<string, unknown>;

function asText(value: unknown, fallback = "n/a") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : fallback;
}

export function resolveStockStatus(value: unknown, quantity: number, product?: AdminRow): SimpleInventoryStatus {
  const workflowStatus = asText(product?.workflow_status, "").toLowerCase();
  const archivedAt = asText(product?.archived_at, "");
  if (workflowStatus === "archived" || archivedAt) return "archived";
  if (value === "archived") return "archived";
  if (value === "discontinued") return "discontinued";
  if (value === "inactive" || value === "hidden") return "discontinued";
  return stockStatusFromQuantity(quantity);
}

function asStockStatus(value: unknown, quantity: number, product?: AdminRow): SimpleInventoryStatus {
  return resolveStockStatus(value, quantity, product);
}

function firstImageFrom(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const image = firstImageFrom(item);
      if (image) return image;
    }
    return null;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return firstImageFrom(record.src ?? record.url ?? record.image ?? record.desktop ?? record.mobile ?? record[0]);
  }
  return null;
}

function productImage(product?: AdminRow) {
  return firstImageFrom(product?.image)
    ?? firstImageFrom(product?.hero)
    ?? firstImageFrom(product?.gallery)
    ?? firstImageFrom(product?.source_images);
}

function isProductArchived(product?: AdminRow) {
  if (!product) return false;
  const workflowStatus = asText(product.workflow_status, "").toLowerCase();
  return workflowStatus === "archived" || Boolean(asText(product.archived_at, ""));
}

export function readAdminText(value: unknown, fallback = "n/a") {
  return asText(value, fallback);
}

export function readAdminNumber(value: unknown, fallback = 0) {
  return asNumber(value, fallback);
}

/** Builds exactly one inventory row per product in the loaded set. */
export function buildSimpleInventoryRows(
  products: AdminRow[],
  inventory: AdminRow[],
  preferredWarehouseCode = ""
): SimpleInventoryRow[] {
  const inventoryBySlug = new Map<string, AdminRow>();
  for (const row of inventory) {
    const productSlug = asText(row.product_slug, "");
    if (productSlug && !inventoryBySlug.has(productSlug)) {
      inventoryBySlug.set(productSlug, row);
    }
  }

  const productOrder = new Map(products.map((product, index) => [asText(product.slug, ""), index]));

  const rows = products.map((product) => {
    const productSlug = asText(product.slug, "");
    const inv = inventoryBySlug.get(productSlug);
    const sku = asText(inv?.sku, deriveProductSku(productSlug));
    const warehouseCode = preferredWarehouseCode;
    const quantity = asNumber(inv?.quantity);
    const price = asNumber(product.price);

    return {
      id: productSlug || sku,
      productSlug,
      productName: asText(product.name, productSlug),
      productImage: productImage(product),
      sku,
      variantId: asText(inv?.variant_id, "") || null,
      warehouseCode,
      stockStatus: asStockStatus(inv?.stock_status, quantity, product),
      quantity,
      category: asText(product.category, "Uncategorized"),
      price,
      inventoryValue: price * quantity,
      lastUpdated: asText(inv?.updated_at, "") || null,
      warehouseUpdatedAt: null,
      inventoryUpdatedAt: asText(inv?.updated_at, "") || null,
      supplierName: asText(product.supplier_name, ""),
      isArchived: isProductArchived(product)
    } satisfies SimpleInventoryRow;
  });

  return rows.sort(
    (left, right) => (productOrder.get(left.productSlug) ?? 999) - (productOrder.get(right.productSlug) ?? 999)
  );
}

/** @deprecated Use buildSimpleInventoryRows — alias kept for clarity in warehouse contexts. */
export const buildWarehouseInventoryRows = buildSimpleInventoryRows;
