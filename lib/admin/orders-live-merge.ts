export type AdminOrderRow = Record<string, unknown>;

export function parseUpdatedAtMs(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isIncomingOrderNewer(incomingUpdatedAt: unknown, currentUpdatedAt: unknown) {
  const incomingMs = parseUpdatedAtMs(incomingUpdatedAt);
  const currentMs = parseUpdatedAtMs(currentUpdatedAt);
  if (incomingMs == null) return true;
  if (currentMs == null) return true;
  return incomingMs >= currentMs;
}

export function mergeOrderRecord(existing: AdminOrderRow, record: AdminOrderRow) {
  if (!isIncomingOrderNewer(record.updated_at, existing.updated_at)) {
    return existing;
  }
  return { ...existing, ...record };
}

export function mergeOrdersFromRealtimeEvent(
  orders: AdminOrderRow[],
  record: AdminOrderRow | null | undefined,
  eventType: string
) {
  if (!record || typeof record !== "object") return orders;
  const orderId = typeof record.id === "string" ? record.id : null;
  if (!orderId) return orders;

  const index = orders.findIndex((order) => String(order.id ?? "") === orderId);
  if (eventType === "INSERT" && index === -1) {
    return [record, ...orders];
  }
  if (index === -1) return orders;

  const merged = mergeOrderRecord(orders[index], record);
  if (merged === orders[index]) return orders;

  const next = [...orders];
  next[index] = merged;
  return next;
}

export function applyAuthoritativeOrderRow(orders: AdminOrderRow[], row: AdminOrderRow) {
  const orderId = String(row.id ?? "").trim();
  if (!orderId) return orders;

  let found = false;
  const next = orders.map((order) => {
    if (String(order.id ?? "") !== orderId) return order;
    found = true;
    return { ...order, ...row };
  });

  return found ? next : orders;
}

function rowId(record: AdminOrderRow) {
  return typeof record.id === "string" ? record.id : String(record.id ?? "").trim() || null;
}

/** Merge order_items realtime events into the live items list. */
export function mergeOrderItemsFromRealtimeEvent(
  items: AdminOrderRow[],
  record: AdminOrderRow | null | undefined,
  eventType: string
) {
  if (!record || typeof record !== "object") return items;
  const itemId = rowId(record);
  if (!itemId) return items;

  const index = items.findIndex((item) => String(item.id ?? "") === itemId);
  const orderId = String(record.order_id ?? "").trim();
  const productSlug = String(record.product_slug ?? "").trim();

  if (eventType === "DELETE") {
    if (index === -1) return items;
    return items.filter((_, i) => i !== index);
  }

  // Drop matching optimistic placeholders once the authoritative row arrives.
  const withoutOptimistic =
    orderId && productSlug
      ? items.filter(
          (item) =>
            !(
              item._optimistic &&
              String(item.order_id ?? "") === orderId &&
              String(item.product_slug ?? "") === productSlug
            )
        )
      : items;

  const resolvedIndex = withoutOptimistic.findIndex((item) => String(item.id ?? "") === itemId);

  if (eventType === "INSERT" && resolvedIndex === -1) {
    return [...withoutOptimistic, record];
  }

  if (resolvedIndex === -1) {
    // UPDATE for an item we don't have yet — treat as insert so detail stays fresh.
    return [...withoutOptimistic, record];
  }

  const merged = mergeOrderRecord(withoutOptimistic[resolvedIndex], record);
  if (merged === withoutOptimistic[resolvedIndex] && withoutOptimistic === items) return items;
  const next = [...withoutOptimistic];
  next[resolvedIndex] = merged;
  return next;
}

export function applyAuthoritativeOrderItems(
  items: AdminOrderRow[],
  orderId: string,
  nextItems: AdminOrderRow[]
) {
  const other = items.filter((item) => String(item.order_id ?? "") !== orderId);
  return [...other, ...nextItems];
}
