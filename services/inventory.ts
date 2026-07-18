import { assertSupabaseAdminConfig } from "@/lib/env";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import {
  availabilityLabelFromQuantity,
  resolveCatalogAvailability,
  stockStatusFromQuantity,
  type InventoryAvailability
} from "@/lib/inventory-availability";
import { deriveProductSku } from "@/lib/product-sku";
import { getCheckoutWarehouseCode } from "@/services/warehouse-config";
import type { ProductInventoryWorkflowInput } from "@/services/enterprise-admin-forms";
import { upsertProductInventoryRecord } from "@/services/product-inventory";

export {
  availabilityLabelFromQuantity,
  resolveCatalogAvailability,
  stockStatusFromQuantity,
  type InventoryAvailability
};

type EnvSource = Record<string, string | undefined>;

export type OrderStockItem = {
  productSlug: string;
  quantity: number;
  sku?: string | null;
};

export type OrderStockIssue = {
  productSlug: string;
  requested: number;
  available: number;
  hasInventoryRow: boolean;
};

function headers(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json"
  };
}

const INVENTORY_SLUG_CHUNK_SIZE = 100;

export async function getInventoryQuantitiesBySlug(
  productSlugs: string[],
  env: EnvSource = process.env,
  options: { freshness?: "catalog" | "checkout" } = {}
): Promise<Map<string, { quantity: number; sku: string }>> {
  const config = assertSupabaseAdminConfig(env);
  const result = new Map<string, { quantity: number; sku: string }>();
  const slugs = [...new Set(productSlugs.filter(Boolean))];
  if (!slugs.length) return result;

  for (let index = 0; index < slugs.length; index += INVENTORY_SLUG_CHUNK_SIZE) {
    const chunk = slugs.slice(index, index + INVENTORY_SLUG_CHUNK_SIZE);
    const slugFilter = chunk.map((slug) => encodeURIComponent(slug)).join(",");
    const freshness = options.freshness ?? "checkout";
    const response = await fetchWithTimeout(
      `${config.url}/rest/v1/inventory?select=product_slug,sku,quantity,reserved_quantity&product_slug=in.(${slugFilter})&order=updated_at.desc`,
      {
        headers: headers(config.serviceRoleKey),
        ...(freshness === "catalog"
          ? { next: { revalidate: 60, tags: ["inventory"] } }
          : { cache: "no-store" as const })
      }
    );

    if (!response.ok) {
      throw new Error("Unable to read inventory quantities.");
    }

    const rows = (await response.json()) as Array<{
      product_slug?: string;
      sku?: string;
      quantity?: number;
      reserved_quantity?: number;
    }>;
    for (const row of rows) {
      const slug = String(row.product_slug ?? "");
      if (!slug || result.has(slug)) continue;
      const onHand = Math.max(0, Number(row.quantity ?? 0));
      const reserved = Math.max(0, Number(row.reserved_quantity ?? 0));
      result.set(slug, {
        quantity: Math.max(0, onHand - reserved),
        sku: String(row.sku ?? deriveProductSku(slug))
      });
    }
  }

  return result;
}

async function getInventoryQuantity(productSlug: string, env: EnvSource = process.env): Promise<number> {
  const quantities = await getInventoryQuantitiesBySlug([productSlug], env);
  return quantities.get(productSlug)?.quantity ?? 0;
}

export async function verifyOrderStockAvailability(
  items: Array<{ productSlug: string; quantity: number }>,
  env: EnvSource = process.env
): Promise<void> {
  if (!items.length) return;

  const slugs = [...new Set(items.map((item) => item.productSlug))];
  const quantities = await getInventoryQuantitiesBySlug(slugs, env);
  const requestedBySlug = new Map<string, number>();

  for (const item of items) {
    requestedBySlug.set(item.productSlug, (requestedBySlug.get(item.productSlug) ?? 0) + item.quantity);
  }

  const issues: OrderStockIssue[] = [];
  for (const [slug, requested] of requestedBySlug) {
    const available = quantities.get(slug)?.quantity ?? 0;
    if (available < requested) {
      issues.push({
        productSlug: slug,
        requested,
        available,
        hasInventoryRow: quantities.has(slug)
      });
    }
  }

  if (issues.length) {
    const first = issues[0];
    const error = new Error(
      first
        ? `Insufficient stock for ${first.productSlug}. Requested ${first.requested}, available ${first.available}.`
        : "Insufficient stock for one or more items."
    );
    (error as Error & { issues: OrderStockIssue[] }).issues = issues;
    throw error;
  }
}

export async function resolveOrderStockSkus(
  items: Array<{ productSlug: string; quantity: number }>,
  env: EnvSource = process.env,
  quantities?: Map<string, { quantity: number; sku: string }>
): Promise<OrderStockItem[]> {
  const resolvedQuantities = quantities ?? await getInventoryQuantitiesBySlug(
    items.map((item) => item.productSlug),
    env
  );

  return items.map((item) => ({
    productSlug: item.productSlug,
    quantity: item.quantity,
    sku: resolvedQuantities.get(item.productSlug)?.sku ?? deriveProductSku(item.productSlug)
  }));
}

export async function prepareCheckoutStockItems(
  items: Array<{ productSlug: string; quantity: number }>,
  env: EnvSource = process.env,
  warehouseCode?: string
): Promise<OrderStockItem[]> {
  if (!items.length) return [];

  const slugs = [...new Set(items.map((item) => item.productSlug))];
  const quantities = await getInventoryQuantitiesBySlug(slugs, env);
  const requestedBySlug = new Map<string, number>();

  for (const item of items) {
    requestedBySlug.set(item.productSlug, (requestedBySlug.get(item.productSlug) ?? 0) + item.quantity);
  }

  const issues: OrderStockIssue[] = [];
  for (const [slug, requested] of requestedBySlug) {
    const available = quantities.get(slug)?.quantity ?? 0;
    if (available < requested) {
      issues.push({
        productSlug: slug,
        requested,
        available,
        hasInventoryRow: quantities.has(slug)
      });
    }
  }

  if (issues.length) {
    const first = issues[0];
    const error = new Error(
      first
        ? `Insufficient stock for ${first.productSlug}. Requested ${first.requested}, available ${first.available}.`
        : "Insufficient stock for one or more items."
    );
    (error as Error & { issues: OrderStockIssue[] }).issues = issues;
    throw error;
  }

  return resolveOrderStockSkus(items, env, quantities);
}

async function setInventoryQuantity(
  input: ProductInventoryWorkflowInput,
  actorId: string | null,
  env: EnvSource = process.env
) {
  return upsertProductInventoryRecord(input, actorId, env);
}

export async function deductInventoryForOrder(
  orderId: string,
  actorId: string | null,
  env: EnvSource = process.env,
  warehouseCode?: string
) {
  const config = assertSupabaseAdminConfig(env);
  const resolvedWarehouseCode = warehouseCode?.trim() || (await getCheckoutWarehouseCode(env)).trim() || "IN-WEST-01";

  const response = await fetchWithTimeout(`${config.url}/rest/v1/rpc/deduct_order_inventory_on_fulfillment`, {
    method: "POST",
    headers: headers(config.serviceRoleKey),
    body: JSON.stringify({
      p_order_id: orderId,
      p_actor_id: actorId,
      p_warehouse_code: resolvedWarehouseCode
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Inventory deduction failed (${response.status})${body ? `: ${body.slice(0, 300)}` : ""}`);
  }

  return response.json();
}

export async function orderInventoryDeducted(orderId: string, env: EnvSource = process.env): Promise<boolean> {
  const config = assertSupabaseAdminConfig(env);
  const response = await fetchWithTimeout(
    `${config.url}/rest/v1/inventory_movements?select=id&related_order_id=eq.${encodeURIComponent(orderId)}&movement_type=eq.fulfillment&limit=1`,
    { headers: headers(config.serviceRoleKey), cache: "no-store" }
  );
  if (!response.ok) return false;
  const rows = (await response.json()) as unknown[];
  return rows.length > 0;
}
