type OrderLike = {
  id?: unknown;
  order_number?: unknown;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function formatOrderReference(order: OrderLike): string {
  const orderNumber = text(order.order_number);
  if (orderNumber && !isUuid(orderNumber)) return orderNumber;

  const id = text(order.id);
  if (!id) return "Order";
  if (isUuid(id)) {
    const suffix = id.replace(/-/g, "").slice(-4).toUpperCase();
    return `Order ····${suffix}`;
  }

  return `Order ${id.slice(0, 8)}`;
}

export function formatOrderDate(value: unknown): string {
  const raw = text(value);
  if (!raw) return "—";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw.slice(0, 10);
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(date);
}

export function formatItemCount(count: number | null | undefined): string | null {
  if (count == null || !Number.isFinite(count) || count < 0) return null;
  if (count === 1) return "1 item";
  return `${count} items`;
}

export function orderItemCount(order: Record<string, unknown>): number | null {
  const nested = order.order_items;
  if (Array.isArray(nested)) return nested.length;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const aggregate = (nested as { count?: unknown }).count;
    if (typeof aggregate === "number" && Number.isFinite(aggregate)) return aggregate;
  }
  const metadata = order.metadata;
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const itemCount = (metadata as Record<string, unknown>).item_count;
    if (typeof itemCount === "number" && Number.isFinite(itemCount)) return itemCount;
  }
  return null;
}

export function neverExposeUuidLabel(value: unknown): string {
  const raw = text(value);
  if (!raw) return "";
  if (isUuid(raw)) return "";
  return raw;
}
