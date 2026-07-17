import type { ShipmentCreateItemInput } from "@/services/shipments";

type JsonRecord = Record<string, unknown>;

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function rowQuantity(row: JsonRecord) {
  const quantity = Number(row.quantity ?? 0);
  return Number.isFinite(quantity) ? Math.trunc(quantity) : 0;
}

export type PackingChecklistInput = {
  orderId: string;
  verifiedItemIds: string[];
  slipConfirmed: boolean;
  packingNote: string;
};

export function readVerifiedItemIds(formData: FormData) {
  return formData.getAll("verified_item_id")
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
}

export function buildPackingChecklistFromFormData(formData: FormData): PackingChecklistInput {
  return {
    orderId: text(formData.get("order_id"), ""),
    verifiedItemIds: readVerifiedItemIds(formData),
    slipConfirmed: formData.get("slip_confirmed") === "on",
    packingNote: text(formData.get("packing_note"))
  };
}

export function assertPackingChecklistComplete(
  checklist: PackingChecklistInput,
  orderItems: JsonRecord[],
  options?: { requireItemScan?: boolean }
) {
  if (!checklist.orderId) {
    throw new Error("Packing checklist requires an order id.");
  }
  if (!checklist.packingNote.trim()) {
    throw new Error("Packing note is required before completing pack.");
  }
  if (!checklist.slipConfirmed) {
    throw new Error("Confirm the packing slip before completing pack.");
  }

  const requiredItemIds = orderItems.map((item) => text(item.id)).filter(Boolean);
  if (!requiredItemIds.length) {
    throw new Error("Cannot pack an order without line items.");
  }

  const requireItemScan = options?.requireItemScan ?? true;
  if (!requireItemScan) return;

  const verified = new Set(checklist.verifiedItemIds);
  const missing = requiredItemIds.filter((itemId) => !verified.has(itemId));
  if (missing.length) {
    throw new Error(`Verify every line item before packing. Missing ${missing.length} item check(s).`);
  }
}

export function buildRemainingShipmentItems(
  orderItems: JsonRecord[],
  existingShipmentItems: JsonRecord[],
  explicitItemIds?: string[]
): ShipmentCreateItemInput[] {
  const shippedByOrderItem = new Map<string, number>();
  for (const item of existingShipmentItems) {
    const orderItemId = text(item.order_item_id);
    if (!orderItemId) continue;
    shippedByOrderItem.set(orderItemId, (shippedByOrderItem.get(orderItemId) ?? 0) + rowQuantity(item));
  }

  const selectedIds = explicitItemIds?.length ? new Set(explicitItemIds) : null;
  const items: ShipmentCreateItemInput[] = [];

  for (const orderItem of orderItems) {
    const orderItemId = text(orderItem.id);
    const productId = text(orderItem.product_slug);
    const sku = text(orderItem.sku);
    if (!orderItemId || !productId || !sku) {
      throw new Error(`Order item ${orderItemId || "unknown"} is missing product slug or SKU.`);
    }
    if (selectedIds && !selectedIds.has(orderItemId)) continue;

    const orderQuantity = rowQuantity(orderItem);
    const alreadyShipped = shippedByOrderItem.get(orderItemId) ?? 0;
    const remaining = orderQuantity - alreadyShipped;
    if (remaining <= 0) continue;

    items.push({
      orderItemId,
      productId,
      variantId: text(orderItem.variant_id) || null,
      quantity: remaining
    });
  }

  if (!items.length) {
    throw new Error("All order items are already included in shipments.");
  }

  return items;
}

export function buildPackingSlipLines(input: {
  orderNumber: string;
  warehouseCode: string;
  carrierName: string;
  trackingNumber: string;
  shipmentNumber: string;
  items: Array<{ sku: string; productSlug: string; quantity: number }>;
  packingNote: string;
}) {
  return [
    `Order ${input.orderNumber}`,
    `Shipment ${input.shipmentNumber}`,
    `Warehouse ${input.warehouseCode}`,
    `Carrier ${input.carrierName}`,
    `Tracking ${input.trackingNumber || "pending"}`,
    "",
    ...input.items.map((item) => `${item.sku} | ${item.productSlug} | qty ${item.quantity}`),
    "",
    `Note: ${input.packingNote}`
  ];
}
