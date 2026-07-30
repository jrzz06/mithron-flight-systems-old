import type { EnterpriseRealtimeEvent, EnterpriseRealtimeTable } from "@/services/enterprise-realtime";

export type AdminEntityRow = Record<string, unknown>;
export type AdminEntityTable = EnterpriseRealtimeTable;

export type AdminEntityCollections = Partial<Record<AdminEntityTable, AdminEntityRow[]>>;

export type AdminConnectionStatus = "idle" | "live" | "reconnecting" | "offline";

export type AdminLiveResourceId =
  | "orders"
  | "inventory"
  | "products"
  | "enquiries"
  | "contact_requests"
  | "suppliers"
  | "users"
  | "warehouses"
  | "audit"
  | "archives"
  | "dashboard"
  | "nav_metrics";

/** Cap live collection growth from realtime INSERTs / hydrates (newest-first). */
export const ADMIN_ENTITY_COLLECTION_MAX_ROWS = 500;

function capAdminEntityRows(rows: AdminEntityRow[]): AdminEntityRow[] {
  return rows.length > ADMIN_ENTITY_COLLECTION_MAX_ROWS
    ? rows.slice(0, ADMIN_ENTITY_COLLECTION_MAX_ROWS)
    : rows;
}

const TABLE_IDENTITY_KEYS: Partial<Record<AdminEntityTable, string[]>> = {
  inventory: ["id", "product_slug"],
  warehouse_stock: ["id", "product_slug", "warehouse_code"],
  mithron_products: ["slug", "id"],
  leads: ["id"],
  profiles: ["id"],
  user_roles: ["id", "user_id"],
  payments: ["id"],
  order_items: ["id"],
  orders: ["id"],
  product_media_assets: ["id", "media_asset_id", "asset_id"],
  media_assets: ["id", "asset_id"],
  homepage_ordering: ["id", "section_key"],
  section_visibility: ["id", "section_key"]
};

export function resolveAdminEntityId(table: AdminEntityTable, row: AdminEntityRow | null | undefined) {
  if (!row || typeof row !== "object") return null;
  const keys = TABLE_IDENTITY_KEYS[table] ?? ["id"];
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return `${key}:${value.trim()}`;
    if (typeof value === "number" && Number.isFinite(value)) return `${key}:${value}`;
  }
  return null;
}

export function parseUpdatedAtMs(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isIncomingEntityNewer(incomingUpdatedAt: unknown, currentUpdatedAt: unknown) {
  const incomingMs = parseUpdatedAtMs(incomingUpdatedAt);
  const currentMs = parseUpdatedAtMs(currentUpdatedAt);
  if (incomingMs == null) return true;
  if (currentMs == null) return true;
  return incomingMs >= currentMs;
}

function mergeRow(existing: AdminEntityRow, incoming: AdminEntityRow) {
  if (!isIncomingEntityNewer(incoming.updated_at, existing.updated_at)) {
    return existing;
  }
  return { ...existing, ...incoming };
}

export function applyAdminEntityEvent(
  rows: AdminEntityRow[],
  table: AdminEntityTable,
  event: Pick<EnterpriseRealtimeEvent, "eventType" | "record" | "oldRecord">
) {
  const record = (event.record ?? null) as AdminEntityRow | null;
  const oldRecord = (event.oldRecord ?? null) as AdminEntityRow | null;
  const eventType = event.eventType;

  if (eventType === "DELETE") {
    const deleteId = resolveAdminEntityId(table, oldRecord) ?? resolveAdminEntityId(table, record);
    if (!deleteId) return rows;
    const next = rows.filter((row) => resolveAdminEntityId(table, row) !== deleteId);
    return next.length === rows.length ? rows : next;
  }

  if (!record) return rows;
  const recordId = resolveAdminEntityId(table, record);
  if (!recordId) return rows;

  const index = rows.findIndex((row) => resolveAdminEntityId(table, row) === recordId);
  if (index === -1) {
    if (eventType === "INSERT" || eventType === "UPDATE" || eventType === "*") {
      return capAdminEntityRows([record, ...rows]);
    }
    return rows;
  }

  const merged = mergeRow(rows[index], record);
  if (merged === rows[index]) return rows;
  const next = [...rows];
  next[index] = merged;
  return next;
}

export function applyAuthoritativeEntityRows(
  rows: AdminEntityRow[],
  table: AdminEntityTable,
  authoritative: AdminEntityRow[],
  options?: { replaceAll?: boolean; matchKey?: string }
) {
  if (options?.replaceAll) {
    return capAdminEntityRows([...authoritative]);
  }

  const matchKey = options?.matchKey;
  if (matchKey) {
    const authoritativeKeys = new Set(
      authoritative.map((next) => String(next[matchKey] ?? "").trim()).filter(Boolean)
    );
    const keep = rows.filter((row) => {
      const value = String(row[matchKey] ?? "").trim();
      return !authoritativeKeys.has(value);
    });
    return capAdminEntityRows([...keep, ...authoritative]);
  }

  let next = [...rows];
  for (const row of authoritative) {
    const id = resolveAdminEntityId(table, row);
    if (!id) continue;
    const index = next.findIndex((existing) => resolveAdminEntityId(table, existing) === id);
    if (index === -1) {
      next = [row, ...next];
    } else {
      next[index] = { ...next[index], ...row };
    }
  }
  return capAdminEntityRows(next);
}

export function createEmptyAdminEntityCollections(): AdminEntityCollections {
  return {};
}

export function hydrateAdminEntityCollection(
  collections: AdminEntityCollections,
  table: AdminEntityTable,
  rows: AdminEntityRow[]
): AdminEntityCollections {
  return {
    ...collections,
    [table]: capAdminEntityRows([...rows])
  };
}

export function reduceAdminEntityEvent(
  collections: AdminEntityCollections,
  table: AdminEntityTable,
  event: Pick<EnterpriseRealtimeEvent, "eventType" | "record" | "oldRecord">
): AdminEntityCollections {
  const current = collections[table] ?? [];
  const nextRows = applyAdminEntityEvent(current, table, event);
  if (nextRows === current) return collections;
  return {
    ...collections,
    [table]: nextRows
  };
}

export const ADMIN_RESOURCE_TABLES: Record<AdminLiveResourceId, AdminEntityTable[]> = {
  orders: ["orders", "order_items", "payments", "shipments", "shipment_timeline", "inventory"],
  inventory: ["inventory", "warehouse_stock", "inventory_movements", "mithron_products"],
  products: ["mithron_products", "inventory", "warehouse_stock", "product_media_assets", "media_assets"],
  enquiries: ["leads", "orders", "enquiries", "contact_requests"],
  contact_requests: ["leads", "contact_requests", "orders", "enquiries"],
  suppliers: ["mithron_products", "profiles", "user_roles", "notifications"],
  users: ["profiles", "user_roles", "admin_invites", "roles", "activity_logs"],
  warehouses: ["warehouses"],
  audit: ["activity_logs", "security_events", "audit_logs", "notifications"],
  archives: ["data_archive_runs", "orders", "enquiries", "contact_requests", "leads"],
  dashboard: ["orders", "payments", "inventory", "mithron_products", "leads", "enquiries", "notifications", "activity_logs"],
  nav_metrics: ["orders", "leads", "enquiries", "contact_requests", "mithron_products", "notifications"]
};
