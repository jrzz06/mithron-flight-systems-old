import { cache } from "react";
import { normalizeCmsRole } from "@/lib/auth/permissions";
import { assertSupabaseAdminConfig } from "@/lib/env";
import { getAdminSettingsPolicy } from "@/services/admin-settings-policy";
import { listActiveWarehouses } from "@/services/warehouses";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

type EnvSource = Record<string, string | undefined>;

export type WarehouseScope = {
  role: ReturnType<typeof normalizeCmsRole>;
  warehouseCode: string;
  warehouseName: string;
  isGlobal: boolean;
};

function headers(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`
  };
}

export async function getAssignedWarehouseCodeForUser(
  userId: string | null | undefined,
  env: EnvSource = process.env
): Promise<string | null> {
  if (!userId) return null;
  const config = assertSupabaseAdminConfig(env);
  const response = await fetchWithTimeout(
    `${config.url}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=assigned_warehouse_code,default_role&limit=1`,
    { headers: headers(config.serviceRoleKey), cache: "no-store" }
  );
  if (!response.ok) return null;
  const rows = (await response.json()) as Array<{ assigned_warehouse_code?: string | null; default_role?: string | null }>;
  const row = rows[0];
  if (!row) return null;
  const code = String(row.assigned_warehouse_code ?? "").trim();
  if (code) return code;
  if (normalizeCmsRole(row.default_role) === "warehouse") {
    const policy = await getAdminSettingsPolicy(env);
    return policy.defaultWarehouseCode || null;
  }
  return null;
}

export const resolveWarehouseScope = cache(async (
  input: { userId: string | null; role: ReturnType<typeof normalizeCmsRole> },
  env: EnvSource = process.env
): Promise<WarehouseScope> => {
  const [warehouses, policy] = await Promise.all([
    listActiveWarehouses(env),
    getAdminSettingsPolicy(env)
  ]);
  const fallbackCode = policy.defaultWarehouseCode || warehouses[0]?.code || "";
  const fallbackName = warehouses.find((warehouse) => warehouse.code === fallbackCode)?.name ?? fallbackCode;

  if (input.role === "admin") {
    return {
      role: input.role,
      warehouseCode: fallbackCode,
      warehouseName: fallbackName,
      isGlobal: true
    };
  }

  const assigned = await getAssignedWarehouseCodeForUser(input.userId, env);
  const warehouseCode = assigned || fallbackCode;
  const warehouse = warehouses.find((entry) => entry.code === warehouseCode);
  if (!warehouse) {
    throw new Error(
      assigned
        ? `Warehouse operator is assigned to unknown site "${assigned}". Ask an admin to fix the assignment.`
        : "No active warehouse is configured for this operator."
    );
  }

  return {
    role: input.role,
    warehouseCode: warehouse.code,
    warehouseName: warehouse.name,
    isGlobal: false
  };
});

export function orderMatchesWarehouseScope(
  order: Record<string, unknown>,
  scope: WarehouseScope,
  defaultWarehouseCode: string
) {
  if (scope.isGlobal) return true;
  const metadata = order.metadata;
  const assigned = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? String((metadata as Record<string, unknown>).assigned_warehouse_code ?? defaultWarehouseCode)
    : defaultWarehouseCode;
  return assigned === scope.warehouseCode;
}

export function filterOrdersForWarehouseScope<T extends Record<string, unknown>>(
  orders: T[],
  scope: WarehouseScope,
  defaultWarehouseCode: string
) {
  return orders.filter((order) => orderMatchesWarehouseScope(order, scope, defaultWarehouseCode));
}

function filterStockForWarehouseScope<T extends Record<string, unknown>>(
  stock: T[],
  scope: WarehouseScope
) {
  if (scope.isGlobal) return stock;
  return stock.filter((row) => String(row.warehouse_code ?? "").trim() === scope.warehouseCode);
}

export function filterInventoryForWarehouseScope<T extends Record<string, unknown>>(
  inventory: T[],
  scope: WarehouseScope
) {
  return filterStockForWarehouseScope(inventory, scope);
}

export function filterShipmentsForWarehouseScope<T extends Record<string, unknown>>(
  shipments: T[],
  scope: WarehouseScope
) {
  if (scope.isGlobal) return shipments;
  return shipments.filter((shipment) => String(shipment.warehouse_id ?? "").trim() === scope.warehouseCode);
}
