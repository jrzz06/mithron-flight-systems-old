import { assertSupabaseAdminConfig } from "@/lib/env";
import { AdminRecordConflictError } from "@/services/admin-actions";
import { deductInventoryForOrder } from "@/services/inventory";
import {
  createActivityLogRecord,
  createInventoryMovementRecord,
  recordEntityRevisionSnapshot
} from "@/services/admin-actions";
import type { ProductInventoryWorkflowInput } from "@/services/enterprise-admin-forms";
import { upsertProductInventoryRecord } from "@/services/product-inventory";

type EnvSource = Record<string, string | undefined>;
type JsonRecord = Record<string, unknown>;

const warehouseMovementReadColumns = {
  warehouseStock: "select=id,warehouse_code,product_slug,sku,variant_id,available_quantity,committed_quantity,last_counted_at,updated_at",
  inventory: "select=id,product_slug,sku,variant_id,stock_status,quantity,reserved_quantity,reorder_threshold,updated_at",
  orderItems: "select=id,order_id,product_slug,sku,quantity,created_at"
};

export const INVENTORY_MOVEMENT_TYPES = [
  "stock_in",
  "stock_out",
  "adjustment",
  "transfer",
  "fulfillment",
  "return",
  "damaged",
  "correction"
] as const;

export type InventoryMovementType = (typeof INVENTORY_MOVEMENT_TYPES)[number];

export type InventoryMovementRecordInput = {
  productId: string;
  sku: string;
  variantId: string | null;
  warehouseCode: string;
  warehouseStockId: string | null;
  movementType: InventoryMovementType;
  quantityBefore: number;
  quantityDelta: number;
  reasonCode: string;
  notes: string | null;
  actorUserId: string | null;
  relatedOrderId: string | null;
  relatedShipmentId: string | null;
  at: string | Date;
};

export type WarehouseMovementFormInput = {
  productSlug: string;
  sku: string;
  variantId: string | null;
  warehouseCode: string;
  movementType: InventoryMovementType;
  quantityDelta: number | null;
  targetQuantity: number | null;
  reasonCode: string;
  notes: string | null;
  relatedOrderId: string | null;
  relatedShipmentId: string | null;
  changeSummary: string;
  expectedUpdatedAt?: string | null;
};

export type InventoryMovementRecord = {
  product_slug: string;
  sku: string;
  variant_id: string | null;
  warehouse_code: string;
  warehouse_stock_id: string | null;
  movement_type: InventoryMovementType;
  quantity_delta: number;
  quantity_before: number;
  quantity_after: number;
  reason_code: string;
  notes: string | null;
  actor_user_id: string | null;
  related_order_id: string | null;
  related_shipment_id: string | null;
  created_at: string;
};

function adminHeaders(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json"
  };
}

function readRequiredString(formData: FormData, key: string, label: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} ${key} is required.`);
  }
  return value.trim();
}

function readOptionalString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readOptionalInteger(formData: FormData, key: string, label: string) {
  const value = readOptionalString(formData, key);
  if (value === null) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return parsed;
}

function readOptionalSignedInteger(formData: FormData, key: string, label: string) {
  const value = readOptionalString(formData, key);
  if (value === null) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${label} must be an integer.`);
  }
  return parsed;
}

function readMovementType(formData: FormData) {
  const value = readRequiredString(formData, "movement_type", "Warehouse movement");
  if (!INVENTORY_MOVEMENT_TYPES.includes(value as InventoryMovementType)) {
    throw new Error(`Warehouse movement movement_type must be one of: ${INVENTORY_MOVEMENT_TYPES.join(", ")}.`);
  }
  return value as InventoryMovementType;
}

function normalizeRequired(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  return normalized;
}

function normalizeOptional(value: string | null | undefined) {
  return value?.trim() ? value.trim() : null;
}

function normalizeNonNegativeInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return value;
}

function normalizeInteger(value: number, label: string) {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be an integer.`);
  }
  return value;
}

function normalizeTimestamp(value: string | Date) {
  const timestamp = value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  if (!timestamp || Number.isNaN(Date.parse(timestamp))) {
    throw new Error("Inventory movement timestamp is invalid.");
  }
  return timestamp;
}

function stockStatusFor(quantity: number): ProductInventoryWorkflowInput["stockStatus"] {
  return quantity > 0 ? "available" : "out_of_stock";
}

function numberField(record: JsonRecord | null, key: string, fallback = 0) {
  const value = Number(record?.[key] ?? fallback);
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

async function fetchAdminRows<T extends JsonRecord>(table: string, query: string, env: EnvSource = process.env) {
  const config = assertSupabaseAdminConfig(env);
  const response = await fetch(`${config.url}/rest/v1/${table}?${query}`, {
    headers: adminHeaders(config.serviceRoleKey),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Failed to load ${table}: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T[];
}

export async function fetchWarehouseStockBySku(
  productSlug: string,
  sku: string,
  warehouseCode: string,
  env: EnvSource = process.env
) {
  const rows = await fetchAdminRows<JsonRecord>(
    "warehouse_stock",
    `warehouse_code=eq.${encodeURIComponent(warehouseCode)}&product_slug=eq.${encodeURIComponent(productSlug)}&sku=eq.${encodeURIComponent(sku)}&${warehouseMovementReadColumns.warehouseStock}&limit=1`,
    env
  );
  return rows[0] ?? null;
}

export async function fetchInventoryBySku(productSlug: string, sku: string, env: EnvSource = process.env) {
  const rows = await fetchAdminRows<JsonRecord>(
    "inventory",
    `product_slug=eq.${encodeURIComponent(productSlug)}&sku=eq.${encodeURIComponent(sku)}&${warehouseMovementReadColumns.inventory}&limit=1`,
    env
  );
  return rows[0] ?? null;
}

export async function fetchOrderItemsByOrderId(orderId: string, env: EnvSource = process.env) {
  return fetchAdminRows<JsonRecord>(
    "order_items",
    `order_id=eq.${encodeURIComponent(orderId)}&${warehouseMovementReadColumns.orderItems}&order=created_at.asc`,
    env
  );
}

export function buildInventoryMovementRecord(input: InventoryMovementRecordInput): InventoryMovementRecord {
  const productSlug = normalizeRequired(input.productId, "Inventory movement product_slug");
  const sku = normalizeRequired(input.sku, "Inventory movement sku");
  const warehouseCode = normalizeRequired(input.warehouseCode, "Inventory movement warehouse_code");
  const reasonCode = normalizeRequired(input.reasonCode, "Inventory movement reason_code");
  const quantityBefore = normalizeNonNegativeInteger(input.quantityBefore, "Inventory movement quantity_before");
  const quantityDelta = normalizeInteger(input.quantityDelta, "Inventory movement quantity_delta");
  const quantityAfter = quantityBefore + quantityDelta;

  if (!INVENTORY_MOVEMENT_TYPES.includes(input.movementType)) {
    throw new Error(`Inventory movement_type must be one of: ${INVENTORY_MOVEMENT_TYPES.join(", ")}.`);
  }

  if (quantityAfter < 0) {
    throw new Error("Inventory movement would make available stock negative.");
  }

  if ((input.movementType === "stock_in" || input.movementType === "return") && quantityDelta < 0) {
    throw new Error(`${input.movementType} movements cannot reduce stock.`);
  }

  if (["stock_out", "fulfillment", "damaged"].includes(input.movementType) && quantityDelta > 0) {
    throw new Error(`${input.movementType} movements cannot increase stock.`);
  }

  return {
    product_slug: productSlug,
    sku,
    variant_id: normalizeOptional(input.variantId),
    warehouse_code: warehouseCode,
    warehouse_stock_id: normalizeOptional(input.warehouseStockId),
    movement_type: input.movementType,
    quantity_delta: quantityDelta,
    quantity_before: quantityBefore,
    quantity_after: quantityAfter,
    reason_code: reasonCode,
    notes: normalizeOptional(input.notes),
    actor_user_id: normalizeOptional(input.actorUserId),
    related_order_id: normalizeOptional(input.relatedOrderId),
    related_shipment_id: normalizeOptional(input.relatedShipmentId),
    created_at: normalizeTimestamp(input.at)
  };
}

export function buildWarehouseMovementFormFromFormData(formData: FormData): WarehouseMovementFormInput {
  const productSlug = readOptionalString(formData, "product_slug")
    ?? readOptionalString(formData, "product_id")
    ?? readRequiredString(formData, "product_slug", "Warehouse movement");
  const movementType = readMovementType(formData);
  const movementQuantity = readOptionalInteger(formData, "movement_quantity", "Warehouse movement quantity");
  const explicitDelta = readOptionalSignedInteger(formData, "quantity_delta", "Warehouse movement quantity_delta");
  const targetQuantity = readOptionalInteger(formData, "quantity_after", "Warehouse correction quantity_after");
  let quantityDelta = explicitDelta;

  if (quantityDelta === null && targetQuantity === null) {
    if (movementQuantity === null || movementQuantity <= 0) {
      throw new Error("Warehouse movement quantity is required.");
    }
    if (movementType === "stock_in" || movementType === "return") {
      quantityDelta = movementQuantity;
    } else if (movementType === "stock_out" || movementType === "damaged" || movementType === "fulfillment") {
      quantityDelta = -movementQuantity;
    } else if (movementType === "adjustment") {
      quantityDelta = movementQuantity;
    } else {
      throw new Error("Transfer and correction movements require quantity_delta or quantity_after.");
    }
  }

  if (movementType === "correction" && targetQuantity === null) {
    throw new Error("Correction movements require quantity_after.");
  }

  return {
    productSlug: productSlug.trim(),
    sku: readRequiredString(formData, "sku", "Warehouse movement"),
    variantId: readOptionalString(formData, "variant_id"),
    warehouseCode: readRequiredString(formData, "warehouse_code", "Warehouse movement"),
    movementType,
    quantityDelta,
    targetQuantity,
    reasonCode: readRequiredString(formData, "reason_code", "Warehouse movement"),
    notes: readOptionalString(formData, "notes"),
    relatedOrderId: readOptionalString(formData, "related_order_id"),
    relatedShipmentId: readOptionalString(formData, "related_shipment_id"),
    changeSummary: readOptionalString(formData, "change_summary") ?? `Record ${movementType} movement`,
    expectedUpdatedAt: readOptionalString(formData, "expected_updated_at")
  };
}

export type StockDeductionTrigger = "packed" | "dispatched";

export function shouldDeductFulfillmentStock(
  previousStatus: string | null | undefined,
  nextStatus: string | null | undefined,
  trigger: StockDeductionTrigger = "dispatched"
) {
  const previous = previousStatus?.trim().toLowerCase() ?? "";
  const next = nextStatus?.trim().toLowerCase() ?? "";
  if (trigger === "packed") {
    return next === "packed" && previous !== "packed";
  }
  const dispatchStates = new Set(["ready_to_dispatch", "shipped", "delivered"]);
  return dispatchStates.has(next) && !dispatchStates.has(previous);
}

export async function recordInventoryMovementForStockChange(
  input: Omit<InventoryMovementRecordInput, "quantityDelta"> & { quantityAfter: number },
  actorId: string | null,
  env: EnvSource = process.env
) {
  const movementRecord = buildInventoryMovementRecord({
    ...input,
    quantityDelta: input.quantityAfter - input.quantityBefore,
    actorUserId: input.actorUserId ?? actorId
  });
  const movement = await createInventoryMovementRecord(movementRecord, actorId, env);
  const movementId = String((movement as JsonRecord).id ?? `${movementRecord.warehouse_code}:${movementRecord.product_slug}:${movementRecord.sku}:${movementRecord.created_at}`);

  await createActivityLogRecord(
    {
      actor_id: actorId,
      action: `warehouse.inventory_movement.${movementRecord.movement_type}`,
      entity_table: "inventory_movements",
      entity_id: movementId,
      severity: movementRecord.quantity_after <= 0 ? "warning" : "info",
      metadata: {
        ...movementRecord,
        movement_id: (movement as JsonRecord).id ?? null
      }
    },
    actorId,
    env
  );

  return movement;
}

async function applyInventoryAdjustmentRpc(
  input: {
    productSlug: string;
    sku: string;
    warehouseCode: string;
    quantityDelta: number;
    reasonCode: string;
    notes?: string | null;
    expectedUpdatedAt?: string | null;
  },
  actorId: string | null,
  env: EnvSource
) {
  const config = assertSupabaseAdminConfig(env);
  const response = await fetch(`${config.url}/rest/v1/rpc/apply_inventory_adjustment`, {
    method: "POST",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json"
    },
    cache: "no-store",
    body: JSON.stringify({
      p_product_slug: input.productSlug,
      p_sku: input.sku,
      p_warehouse_code: input.warehouseCode,
      p_quantity_delta: input.quantityDelta,
      p_reason_code: input.reasonCode,
      p_notes: input.notes ?? null,
      p_actor_id: actorId,
      p_expected_updated_at: input.expectedUpdatedAt ?? null
    })
  });

  const text = await response.text().catch(() => "");
  if (!response.ok) {
    throw new Error(`Inventory adjustment failed (${response.status})${text ? `: ${text.slice(0, 300)}` : ""}`);
  }

  const result = JSON.parse(text || "{}") as Record<string, unknown>;
  if (result.conflict === true) {
    throw new AdminRecordConflictError(
      "Concurrent inventory update detected. Reload stock levels and retry.",
      typeof result.current_row === "object" && result.current_row ? result.current_row as Record<string, unknown> : undefined
    );
  }

  return result;
}

export async function applyWarehouseStockMovement(
  input: WarehouseMovementFormInput,
  options: {
    actorId: string | null;
    at: string;
    env?: EnvSource;
    committedQuantityAfter?: number;
    reservedQuantityAfter?: number;
  }
) {
  const env = options.env ?? process.env;
  const existingStock = await fetchWarehouseStockBySku(input.productSlug, input.sku, input.warehouseCode, env);
  const quantityBefore = numberField(existingStock, "available_quantity");
  const quantityDelta = input.targetQuantity !== null
    ? input.targetQuantity - quantityBefore
    : input.quantityDelta ?? 0;

  const canUseAdjustmentRpc = input.targetQuantity === null
    && quantityDelta !== 0
    && !input.relatedOrderId
    && !input.relatedShipmentId
    && (input.movementType === "adjustment" || input.movementType === "stock_in" || input.movementType === "stock_out" || input.movementType === "correction");

  if (canUseAdjustmentRpc) {
    const rpcResult = await applyInventoryAdjustmentRpc(
      {
        productSlug: input.productSlug,
        sku: input.sku,
        warehouseCode: input.warehouseCode,
        quantityDelta,
        reasonCode: input.reasonCode,
        notes: input.notes,
        expectedUpdatedAt:
          input.expectedUpdatedAt
          ?? (typeof existingStock?.updated_at === "string" ? existingStock.updated_at : null)
      },
      options.actorId,
      env
    );

    return {
      inventoryRecord: await fetchInventoryBySku(input.productSlug, input.sku, env),
      stockRecord: await fetchWarehouseStockBySku(input.productSlug, input.sku, input.warehouseCode, env),
      movement: rpcResult,
      quantityBefore: Number(rpcResult.quantity_before ?? quantityBefore),
      quantityAfter: Number(rpcResult.quantity_after ?? quantityBefore + quantityDelta),
      quantityDelta
    };
  }

  const existingInventory = await fetchInventoryBySku(input.productSlug, input.sku, env);
  const quantityAfter = quantityBefore + quantityDelta;

  if (quantityAfter < 0) {
    throw new Error("Warehouse movement would make available stock negative.");
  }

  const inventoryQuantityBefore = existingInventory ? numberField(existingInventory, "quantity") : quantityBefore;
  const inventoryQuantity = Math.max(0, inventoryQuantityBefore + quantityDelta);
  const variantId = input.variantId ?? normalizeOptional(String(existingStock?.variant_id ?? existingInventory?.variant_id ?? ""));
  const workflowInput: ProductInventoryWorkflowInput = {
    productSlug: input.productSlug,
    sku: input.sku,
    variantId,
    stockStatus: stockStatusFor(inventoryQuantity),
    quantity: inventoryQuantity,
    warehouseCode: input.warehouseCode,
    changeSummary: input.changeSummary
  };
  const warehouseStockId = normalizeOptional(String(existingStock?.id ?? ""));
  const movement = await recordInventoryMovementForStockChange(
    {
      productId: input.productSlug,
      sku: input.sku,
      variantId,
      warehouseCode: input.warehouseCode,
      warehouseStockId,
      movementType: input.movementType,
      quantityBefore,
      quantityAfter,
      reasonCode: input.reasonCode,
      notes: input.notes,
      actorUserId: options.actorId,
      relatedOrderId: input.relatedOrderId,
      relatedShipmentId: input.relatedShipmentId,
      at: options.at
    },
    options.actorId,
    env
  );

  await upsertProductInventoryRecord(workflowInput, options.actorId, env);

  const inventoryRecord = await fetchInventoryBySku(input.productSlug, input.sku, env);
  const stockRecord = await fetchWarehouseStockBySku(input.productSlug, input.sku, input.warehouseCode, env);

  await recordEntityRevisionSnapshot(
    "inventory",
    `${input.productSlug}:${input.sku}`,
    {
      inventory: inventoryRecord,
      warehouse_stock: stockRecord,
      movement,
      variant_id: variantId
    },
    options.actorId,
    input.changeSummary,
    env
  );

  return {
    inventoryRecord,
    stockRecord,
    movement,
    quantityBefore,
    quantityAfter,
    quantityDelta
  };
}

export async function applyFulfillmentStockMovements(input: {
  orderId: string;
  warehouseCode: string;
  actorId: string | null;
  at: string;
  env?: EnvSource;
}) {
  const result = await deductInventoryForOrder(input.orderId, input.actorId, input.env, input.warehouseCode);
  return [{ movement_type: "fulfillment", related_order_id: input.orderId, created_at: input.at, result }];
}
