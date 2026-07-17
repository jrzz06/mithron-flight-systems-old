import {
  createActivityLogRecord,
  fetchAdminRecordsByColumn,
  recordEntityRevisionSnapshot
} from "@/services/admin-actions";
import {
  buildInventoryLinkageRecords,
  type ProductInventoryWorkflowInput
} from "@/services/enterprise-admin-forms";
import { stockStatusFromQuantity } from "@/services/inventory";
import { revalidateCatalogSurfaces } from "@/lib/catalog-cache";
import { deriveProductSku, upsertProductInventoryRecord } from "@/services/product-inventory";
import { fetchWarehouseStockBySku, recordInventoryMovementForStockChange } from "@/services/warehouse-movements";
import { assertValidWarehouseCode } from "@/services/warehouses";

type EnvSource = Record<string, string | undefined>;

function readOptionalInteger(formData: FormData, key: string) {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function readTrackInventory(formData: FormData, key = "inventory_track") {
  const values = formData.getAll(key).map((value) => String(value).trim().toLowerCase());
  if (!values.length) return true;
  return values.some((value) => value === "on" || value === "true" || value === "1");
}

export async function assertInventorySkuAvailable(
  sku: string,
  productSlug: string,
  env: EnvSource = process.env
) {
  const normalizedSku = sku.trim();
  if (!normalizedSku) {
    throw new Error("SKU is required.");
  }

  const existingRows = await fetchAdminRecordsByColumn("inventory", "sku", normalizedSku, env);
  const conflict = existingRows.find((row) => String(row.product_slug ?? "") !== productSlug);
  if (conflict) {
    throw new Error(`SKU "${normalizedSku}" is already assigned to another product.`);
  }

  return normalizedSku;
}

export function parseProductCreateInventoryFromFormData(
  formData: FormData,
  productSlug: string
): ProductInventoryWorkflowInput | null {
  if (!readTrackInventory(formData)) return null;

  const warehouseCode = String(formData.get("inventory_warehouse_code") ?? "").trim();
  const initialQuantity = readOptionalInteger(formData, "inventory_initial_quantity") ?? 0;

  if (!warehouseCode) {
    if (initialQuantity <= 0) return null;
    throw new Error("Warehouse is required when setting initial inventory.");
  }
  if (initialQuantity < 0) {
    throw new Error("Initial quantity cannot be negative.");
  }

  const sku = deriveProductSku(productSlug);

  return {
    productSlug,
    sku,
    variantId: null,
    stockStatus: stockStatusFromQuantity(initialQuantity),
    quantity: initialQuantity,
    warehouseCode,
    changeSummary: "Initial inventory on product creation"
  };
}

export function parseApprovalInventoryFromFormData(
  formData: FormData,
  productSlug: string
): ProductInventoryWorkflowInput | null {
  const warehouseCode = String(formData.get("approval_warehouse_code") ?? "").trim();
  const initialQuantity = readOptionalInteger(formData, "approval_initial_quantity") ?? 0;
  const sku = String(formData.get("approval_sku") ?? "").trim() || deriveProductSku(productSlug);

  if (!warehouseCode && initialQuantity <= 0) return null;
  if (!warehouseCode) {
    throw new Error("Warehouse is required when approving product stock.");
  }
  if (initialQuantity < 0) {
    throw new Error("Initial quantity cannot be negative.");
  }

  const stockNotes = String(formData.get("approval_stock_notes") ?? "").trim();

  return {
    productSlug,
    sku,
    variantId: null,
    stockStatus: stockStatusFromQuantity(initialQuantity),
    quantity: initialQuantity,
    warehouseCode,
    changeSummary: stockNotes || "Initial inventory on supplier approval"
  };
}

export async function saveProductInventory(
  input: ProductInventoryWorkflowInput,
  actorId: string,
  options: {
    actorRole?: string | null;
    auditAction?: string;
    env?: EnvSource;
  } = {}
) {
  const env = options.env ?? process.env;
  const now = new Date().toISOString();
  const normalizedInput: ProductInventoryWorkflowInput = {
    ...input,
    sku: deriveProductSku(input.productSlug),
    stockStatus: stockStatusFromQuantity(input.quantity)
  };

  await assertValidWarehouseCode(normalizedInput.warehouseCode, env);
  await assertInventorySkuAvailable(normalizedInput.sku, normalizedInput.productSlug, env);

  const previousStock = await fetchWarehouseStockBySku(
    normalizedInput.productSlug,
    normalizedInput.sku,
    normalizedInput.warehouseCode,
    env
  );
  const quantityBefore = Number(previousStock?.available_quantity ?? 0);
  const records = buildInventoryLinkageRecords(normalizedInput, { actorId, at: now });

  const saved = await upsertProductInventoryRecord(normalizedInput, actorId, env);

  if (saved.quantity !== quantityBefore) {
    await recordInventoryMovementForStockChange(
      {
        productId: normalizedInput.productSlug,
        sku: normalizedInput.sku,
        variantId: normalizedInput.variantId,
        warehouseCode: normalizedInput.warehouseCode,
        warehouseStockId: String(previousStock?.id ?? "") || null,
        movementType: quantityBefore === 0 && saved.quantity > 0 ? "stock_in" : "adjustment",
        quantityBefore,
        quantityAfter: saved.quantity,
        reasonCode: options.auditAction ?? "inventory.update",
        notes: normalizedInput.changeSummary,
        actorUserId: actorId,
        relatedOrderId: null,
        relatedShipmentId: null,
        at: now
      },
      actorId,
      env
    );
  }

  await recordEntityRevisionSnapshot(
    "inventory",
    `${normalizedInput.productSlug}:${normalizedInput.sku}`,
    {
      inventory: records.inventoryRecord,
      warehouse_stock: records.warehouseStockRecord,
      variant_id: normalizedInput.variantId,
      saved
    },
    actorId,
    normalizedInput.changeSummary,
    env
  );

  await createActivityLogRecord(
    {
      actor_id: actorId,
      action: options.auditAction ?? "inventory.update",
      entity_table: "inventory",
      entity_id: `${normalizedInput.productSlug}:${normalizedInput.sku}`,
      severity: records.lowStock ? "warning" : "info",
      metadata: {
        product_slug: normalizedInput.productSlug,
        sku: normalizedInput.sku,
        variant_id: normalizedInput.variantId,
        warehouse_code: normalizedInput.warehouseCode,
        stock_status: saved.stockStatus,
        quantity: saved.quantity
      }
    },
    actorId,
    env
  );

  await revalidateCatalogSurfaces(normalizedInput.productSlug);

  return { inventoryRecord: records.inventoryRecord, stockRecord: records.warehouseStockRecord, saved };
}

/** @deprecated Use saveProductInventory */
export const syncProductInventoryWorkflow = saveProductInventory;
