export type PickingScanTarget = {
  orderId: string;
  orderNumber: string;
  sku: string;
  productSlug: string;
  warehouseCode: string;
};

export type PackingScanTarget = {
  orderItemId: string;
  orderId: string;
  orderNumber: string;
  sku: string;
  productSlug: string;
};

export function normalizeBarcodeScan(value: string) {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

export function stripBarcodePrefix(scan: string, prefix = "") {
  const normalized = normalizeBarcodeScan(scan);
  const normalizedPrefix = normalizeBarcodeScan(prefix);
  if (normalizedPrefix && normalized.startsWith(normalizedPrefix)) {
    return normalized.slice(normalizedPrefix.length);
  }
  return normalized;
}

export function matchPickingScan(scan: string, targets: PickingScanTarget[], prefix = "") {
  const normalized = stripBarcodePrefix(scan, prefix);
  if (!normalized) return null;

  const exactOrder = targets.find((target) =>
    normalizeBarcodeScan(target.orderNumber) === normalized
    || normalizeBarcodeScan(target.orderId) === normalized
  );
  if (exactOrder) return { kind: "order" as const, orderId: exactOrder.orderId, target: exactOrder };

  const skuMatch = targets.find((target) => normalizeBarcodeScan(target.sku) === normalized);
  if (skuMatch) return { kind: "sku" as const, orderId: skuMatch.orderId, target: skuMatch };

  const partialOrder = targets.find((target) =>
    normalizeBarcodeScan(target.orderNumber).includes(normalized)
    || normalizeBarcodeScan(target.sku).includes(normalized)
  );
  if (partialOrder) return { kind: "partial" as const, orderId: partialOrder.orderId, target: partialOrder };

  return null;
}

export function matchPackingItemScan(scan: string, targets: PackingScanTarget[], prefix = "") {
  const normalized = stripBarcodePrefix(scan, prefix);
  if (!normalized) return null;

  return targets.find((target) =>
    normalizeBarcodeScan(target.sku) === normalized
    || normalizeBarcodeScan(target.orderItemId) === normalized
    || normalizeBarcodeScan(target.orderNumber) === normalized
  ) ?? null;
}

function formatPackingSlipBarcode(value: string, prefix = "") {
  const normalized = normalizeBarcodeScan(value);
  return prefix ? `${normalizeBarcodeScan(prefix)}${normalized}` : normalized;
}
