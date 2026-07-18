import { assertSupabaseAdminConfig } from "@/lib/env";
import { createActivityLogRecord } from "@/services/admin-actions";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

type EnvSource = Record<string, string | undefined>;

function headers(serviceRoleKey: string, prefer?: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {})
  };
}

export type WarehouseOption = {
  code: string;
  name: string;
  location: string | null;
  isActive: boolean;
  operatorCount: number;
};

type WarehouseRow = {
  code?: string;
  name?: string;
  location?: string | null;
  is_active?: boolean;
};

function normalizeWarehouseRow(row: WarehouseRow, operatorCount = 0): WarehouseOption | null {
  const code = String(row.code ?? "").trim();
  const name = String(row.name ?? "").trim();
  if (!code || !name) return null;
  return {
    code,
    name,
    location: typeof row.location === "string" && row.location.trim() ? row.location.trim() : null,
    isActive: row.is_active !== false,
    operatorCount
  };
}

function slugWarehouseCode(name: string) {
  const base = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28);
  return base || "WAREHOUSE";
}

async function fetchWarehouseRows(env: EnvSource, activeOnly: boolean) {
  const config = assertSupabaseAdminConfig(env);
  const filter = activeOnly ? "&is_active=eq.true" : "";
  const response = await fetchWithTimeout(
    `${config.url}/rest/v1/warehouses?select=code,name,location,is_active&order=name.asc${filter}`,
    { headers: headers(config.serviceRoleKey), cache: "no-store" }
  );
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Failed to load warehouses (${response.status})${body ? `: ${body.slice(0, 160)}` : ""}`);
  }
  return (await response.json()) as WarehouseRow[];
}

async function fetchOperatorCounts(env: EnvSource) {
  const config = assertSupabaseAdminConfig(env);
  const response = await fetchWithTimeout(
    `${config.url}/rest/v1/profiles?select=assigned_warehouse_code&assigned_warehouse_code=not.is.null`,
    { headers: headers(config.serviceRoleKey), cache: "no-store" }
  );
  if (!response.ok) return new Map<string, number>();
  const rows = (await response.json()) as Array<{ assigned_warehouse_code?: string | null }>;
  const counts = new Map<string, number>();
  for (const row of rows) {
    const code = String(row.assigned_warehouse_code ?? "").trim();
    if (!code) continue;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return counts;
}

async function loadAdminWarehouses(
  env: EnvSource,
  activeOnly: boolean,
  options: { includeOperatorCounts?: boolean } = {}
): Promise<WarehouseOption[]> {
  const includeOperatorCounts = options.includeOperatorCounts ?? true;
  const rows = await fetchWarehouseRows(env, activeOnly);
  const operatorCounts = includeOperatorCounts ? await fetchOperatorCounts(env) : new Map<string, number>();
  return rows
    .map((row) => normalizeWarehouseRow(row, operatorCounts.get(String(row.code ?? "").trim()) ?? 0))
    .filter((row): row is WarehouseOption => Boolean(row));
}

export async function listAdminWarehouses(
  env: EnvSource = process.env,
  options: { includeOperatorCounts?: boolean; activeOnly?: boolean } = {}
): Promise<WarehouseOption[]> {
  const activeOnly = options.activeOnly ?? false;
  const { readThroughCache, REDIS_CACHE_KEYS } = await import("@/lib/cache-redis");
  const { cacheControlPlaneRead } = await import("@/lib/control-plane/query-cache");
  const cacheKey = activeOnly
    ? REDIS_CACHE_KEYS.controlPlaneAdminWarehousesActive
    : REDIS_CACHE_KEYS.controlPlaneAdminWarehouses;

  return readThroughCache(
    cacheKey,
    30,
    () =>
      cacheControlPlaneRead(
        ["admin-warehouses", activeOnly ? "active" : "all"],
        () => loadAdminWarehouses(env, activeOnly, options),
        { revalidate: 30, tags: ["admin-warehouses", "control-plane-warehouses"] }
      )
  );
}

export async function listActiveWarehouses(
  env: EnvSource = process.env,
  options: { includeOperatorCounts?: boolean } = {}
): Promise<WarehouseOption[]> {
  const warehouses = await listAdminWarehouses(env, { ...options, activeOnly: true });
  if (!warehouses.length) {
    throw new Error("No active warehouse is configured. Create a warehouse before continuing.");
  }
  return warehouses;
}

export async function getActiveWarehouseCodes(env: EnvSource = process.env): Promise<string[]> {
  const warehouses = await listActiveWarehouses(env);
  return warehouses.map((warehouse) => warehouse.code);
}

export async function assertValidWarehouseCode(code: string, env: EnvSource = process.env) {
  const normalized = code.trim();
  if (!normalized) {
    throw new Error("warehouse_code is required.");
  }
  const activeCodes = await getActiveWarehouseCodes(env);
  if (!activeCodes.includes(normalized)) {
    throw new Error(`Unknown warehouse_code "${normalized}". Valid codes: ${activeCodes.join(", ")}.`);
  }
  return normalized;
}

async function warehouseNameExists(name: string, env: EnvSource) {
  const config = assertSupabaseAdminConfig(env);
  const normalized = name.trim();
  const response = await fetchWithTimeout(
    `${config.url}/rest/v1/warehouses?select=code,name&name=ilike.${encodeURIComponent(normalized)}&limit=1`,
    { headers: headers(config.serviceRoleKey), cache: "no-store" }
  );
  if (!response.ok) return false;
  const rows = (await response.json()) as WarehouseRow[];
  return rows.some((row) => String(row.name ?? "").trim().toLowerCase() === normalized.toLowerCase());
}

async function nextWarehouseCode(name: string, env: EnvSource) {
  const existing = await listAdminWarehouses(env, { includeOperatorCounts: false });
  const codes = new Set(existing.map((warehouse) => warehouse.code));
  const base = slugWarehouseCode(name);
  if (!codes.has(base)) return base;
  for (let index = 2; index < 100; index += 1) {
    const candidate = `${base}-${String(index).padStart(2, "0")}`;
    if (!codes.has(candidate)) return candidate;
  }
  throw new Error("Unable to generate a unique warehouse code.");
}

export async function createWarehouseRecord(
  input: { name: string; location?: string | null; actorId?: string | null },
  env: EnvSource = process.env
) {
  const name = input.name.trim();
  if (name.length < 3) {
    throw new Error("Warehouse name must be at least 3 characters.");
  }
  if (await warehouseNameExists(name, env)) {
    throw new Error(`A warehouse named "${name}" already exists. Choose a unique name.`);
  }

  const config = assertSupabaseAdminConfig(env);
  const code = await nextWarehouseCode(name, env);
  const payload = {
    code,
    name,
    location: input.location?.trim() || null,
    is_active: true
  };

  const response = await fetchWithTimeout(`${config.url}/rest/v1/warehouses`, {
    method: "POST",
    headers: headers(config.serviceRoleKey, "return=representation"),
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Failed to create warehouse (${response.status})${body ? `: ${body.slice(0, 200)}` : ""}`);
  }

  const [record] = (await response.json()) as WarehouseRow[];
  await createActivityLogRecord(
    {
      actor_id: input.actorId ?? null,
      action: "warehouses.create",
      entity_table: "warehouses",
      entity_id: code,
      severity: "info",
      metadata: { code, name, location: payload.location }
    },
    input.actorId ?? null,
    env
  );

  const created = normalizeWarehouseRow(record ?? payload, 0);
  if (!created) {
    throw new Error("Warehouse was created but the response was incomplete.");
  }
  return created;
}

export async function assignWarehouseOperator(
  input: { userId: string; warehouseCode: string; actorId?: string | null },
  env: EnvSource = process.env
) {
  await assertValidWarehouseCode(input.warehouseCode, env);
  const config = assertSupabaseAdminConfig(env);
  const response = await fetchWithTimeout(`${config.url}/rest/v1/profiles?id=eq.${encodeURIComponent(input.userId)}`, {
    method: "PATCH",
    headers: headers(config.serviceRoleKey, "return=representation"),
    body: JSON.stringify({
      assigned_warehouse_code: input.warehouseCode,
      updated_at: new Date().toISOString()
    })
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Failed to assign warehouse operator (${response.status})${body ? `: ${body.slice(0, 160)}` : ""}`);
  }

  await createActivityLogRecord(
    {
      actor_id: input.actorId ?? null,
      action: "warehouses.operator_assign",
      entity_table: "profiles",
      entity_id: input.userId,
      severity: "info",
      metadata: { user_id: input.userId, warehouse_code: input.warehouseCode }
    },
    input.actorId ?? null,
    env
  );
}
