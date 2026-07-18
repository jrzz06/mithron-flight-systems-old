import { fetchWithTimeout, SUPABASE_FETCH_TIMEOUT_MS } from "@/lib/fetch-with-timeout";
import {
  deductInventoryForOrder,
  orderInventoryDeducted,
  prepareCheckoutStockItems,
  resolveOrderStockSkus,
  verifyOrderStockAvailability
} from "@/services/inventory";
import { getCheckoutWarehouseCode } from "@/services/warehouse-config";

type EnvSource = Record<string, string | undefined>;

export type CheckoutStockIssue = {
  productSlug: string;
  requested: number;
  available: number;
  warehouseCode: string;
  hasWarehouseRow: boolean;
};

export class CheckoutStockVerificationError extends Error {
  readonly issues: CheckoutStockIssue[];
  readonly warehouseCode: string;

  constructor(issues: CheckoutStockIssue[], warehouseCode: string) {
    const first = issues[0];
    super(
      first
        ? `Insufficient stock for ${first.productSlug}. Requested ${first.requested}, available ${first.available}.`
        : "Insufficient stock for one or more checkout items."
    );
    this.name = "CheckoutStockVerificationError";
    this.issues = issues;
    this.warehouseCode = warehouseCode;
  }
}

export type CheckoutStockItem = {
  productSlug: string;
  quantity: number;
  sku?: string | null;
};

export class CheckoutWarehouseConfigurationError extends Error {
  constructor() {
    super("Checkout warehouse is not configured. Set DEFAULT_WAREHOUSE_CODE or warehouse settings.");
    this.name = "CheckoutWarehouseConfigurationError";
  }
}

export async function resolveCheckoutStockSkus(
  items: Array<{ productSlug: string; quantity: number }>,
  env: EnvSource = process.env
): Promise<CheckoutStockItem[]> {
  return resolveOrderStockSkus(items, env);
}

export async function prepareCheckoutStock(
  items: Array<{ productSlug: string; quantity: number }>,
  env: EnvSource = process.env,
  warehouseCode?: string
): Promise<CheckoutStockItem[]> {
  try {
    return await prepareCheckoutStockItems(items, env);
  } catch (error) {
    const issues = (error as Error & { issues?: Array<{ productSlug: string; requested: number; available: number; hasInventoryRow: boolean }> }).issues ?? [];
    if (!issues.length) throw error;
    throw new CheckoutStockVerificationError(
      issues.map((issue) => ({
        productSlug: issue.productSlug,
        requested: issue.requested,
        available: issue.available,
        warehouseCode: warehouseCode?.trim() || "IN-WEST-01",
        hasWarehouseRow: issue.hasInventoryRow
      })),
      warehouseCode?.trim() || "IN-WEST-01"
    );
  }
}

export async function verifyCheckoutStockAvailability(
  items: Array<{ productSlug: string; quantity: number }>,
  env: EnvSource = process.env,
  warehouseCode?: string
) {
  try {
    await verifyOrderStockAvailability(items, env);
  } catch (error) {
    const issues = (error as Error & { issues?: Array<{ productSlug: string; requested: number; available: number; hasInventoryRow: boolean }> }).issues ?? [];
    if (!issues.length) throw error;
    throw new CheckoutStockVerificationError(
      issues.map((issue) => ({
        productSlug: issue.productSlug,
        requested: issue.requested,
        available: issue.available,
        warehouseCode: warehouseCode?.trim() || "IN-WEST-01",
        hasWarehouseRow: issue.hasInventoryRow
      })),
      warehouseCode?.trim() || "IN-WEST-01"
    );
  }
}

/** Soft-reserves stock for a checkout order (atomic with order create preferred). */
export async function reserveCheckoutStock(
  orderId: string,
  items: CheckoutStockItem[],
  env: EnvSource = process.env,
  warehouseCode?: string
) {
  const { assertSupabaseAdminConfig } = await import("@/lib/env");
  const config = assertSupabaseAdminConfig(env);
  const resolvedWarehouse =
    warehouseCode?.trim() || (await getCheckoutWarehouseCode(env)).trim() || "IN-WEST-01";

  const response = await fetchWithTimeout(
    `${config.url}/rest/v1/rpc/reserve_checkout_stock`,
    {
      method: "POST",
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        p_order_id: orderId,
        p_items: items.map((item) => ({
          product_slug: item.productSlug,
          quantity: item.quantity,
          sku: item.sku ?? null
        })),
        p_warehouse_code: resolvedWarehouse
      }),
      cache: "no-store"
    },
    SUPABASE_FETCH_TIMEOUT_MS
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Stock reservation failed (${response.status})${body ? `: ${body.slice(0, 300)}` : ""}`);
  }

  const result = (await response.json()) as { skipped?: boolean; rows_reserved?: number };
  return {
    skipped: Boolean(result.skipped),
    rows_reserved: Number(result.rows_reserved ?? 0)
  };
}

/** Fulfillment deduction uses deductInventoryForOrder on warehouse transition. */
export async function fulfillReservedStock(
  orderId: string,
  actorId: string | null,
  env: EnvSource = process.env,
  warehouseCode?: string
) {
  return deductInventoryForOrder(orderId, actorId, env, warehouseCode);
}

export async function orderHasCheckoutReservations(orderId: string, env: EnvSource = process.env) {
  return orderInventoryDeducted(orderId, env);
}

/** Releases soft-reserved stock when checkout is cancelled/expired. */
export async function releaseCheckoutStock(
  orderId: string,
  env: EnvSource = process.env,
  warehouseCode?: string
) {
  const { assertSupabaseAdminConfig } = await import("@/lib/env");
  const config = assertSupabaseAdminConfig(env);
  const resolvedWarehouse =
    warehouseCode?.trim() || (await getCheckoutWarehouseCode(env)).trim() || "IN-WEST-01";

  const response = await fetchWithTimeout(
    `${config.url}/rest/v1/rpc/release_checkout_stock`,
    {
      method: "POST",
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        p_order_id: orderId,
        p_warehouse_code: resolvedWarehouse
      }),
      cache: "no-store"
    },
    SUPABASE_FETCH_TIMEOUT_MS
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Stock release failed (${response.status})${body ? `: ${body.slice(0, 300)}` : ""}`);
  }

  const result = (await response.json()) as { skipped?: boolean; rows_released?: number };
  return {
    skipped: Boolean(result.skipped),
    rows_released: Number(result.rows_released ?? 0)
  };
}
