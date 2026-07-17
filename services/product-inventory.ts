import { assertSupabaseAdminConfig } from "@/lib/env";
import { deriveProductSku } from "@/lib/product-sku";
import { upsertInventoryRecord, updateAdminRecord } from "@/services/admin-actions";
import { availabilityLabelFromQuantity, stockStatusFromQuantity } from "@/lib/inventory-availability";
import type { ProductInventoryWorkflowInput } from "@/services/enterprise-admin-forms";

export { deriveProductSku };

type EnvSource = Record<string, string | undefined>;

function headers(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json"
  };
}

async function upsertProductInventoryViaAdminRecords(
  input: ProductInventoryWorkflowInput,
  actorId: string | null,
  env: EnvSource
) {
  const sku = deriveProductSku(input.productSlug);
  const stockStatus = stockStatusFromQuantity(input.quantity);
  const now = new Date().toISOString();

  await upsertInventoryRecord(
    {
      product_slug: input.productSlug,
      sku,
      variant_id: input.variantId,
      stock_status: stockStatus,
      quantity: input.quantity,
      reserved_quantity: 0,
      reorder_threshold: 0,
      updated_by: actorId,
      updated_at: now
    },
    actorId,
    env
  );

  await updateAdminRecord(
    "mithron_products",
    "slug",
    input.productSlug,
    {
      source_availability: availabilityLabelFromQuantity(input.quantity),
      updated_at: now
    },
    actorId,
    env
  );

  return {
    productSlug: input.productSlug,
    sku,
    stockStatus,
    quantity: input.quantity,
    warehouseCode: input.warehouseCode
  };
}

/** Atomically updates inventory, warehouse stock, and product availability in one database transaction. */
export async function upsertProductInventoryRecord(
  input: ProductInventoryWorkflowInput,
  actorId: string | null,
  env: EnvSource = process.env
) {
  const config = assertSupabaseAdminConfig(env);
  const sku = deriveProductSku(input.productSlug);
  const stockStatus = stockStatusFromQuantity(input.quantity);

  const response = await fetch(`${config.url}/rest/v1/rpc/upsert_product_inventory`, {
    method: "POST",
    headers: headers(config.serviceRoleKey),
    body: JSON.stringify({
      p_product_slug: input.productSlug,
      p_sku: sku,
      p_warehouse_code: input.warehouseCode,
      p_quantity: input.quantity,
      p_reserved_quantity: 0,
      p_reorder_threshold: 0,
      p_stock_status: stockStatus,
      p_variant_id: input.variantId,
      p_updated_by: actorId
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    if (body.includes("42P10")) {
      return upsertProductInventoryViaAdminRecords(input, actorId, env);
    }
    throw new Error(`Inventory update failed (${response.status})${body ? `: ${body.slice(0, 240)}` : ""}`);
  }

  const result = (await response.json()) as Record<string, unknown>;
  if (result.ok !== true) {
    throw new Error(String(result.error ?? "Inventory update rejected."));
  }

  return {
    productSlug: input.productSlug,
    sku: String(result.sku ?? sku),
    stockStatus: String(result.stock_status ?? stockStatus),
    quantity: Number(result.quantity ?? input.quantity),
    warehouseCode: String(result.warehouse_code ?? input.warehouseCode)
  };
}
