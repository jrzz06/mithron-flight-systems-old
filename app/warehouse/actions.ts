"use server";

import { revalidatePath } from "next/cache";
import { revalidateAfterMutation } from "@/lib/control-plane/revalidate-realtime";
import { revalidateCatalogSurfaces } from "@/lib/catalog-cache";
import { assertSupabaseAdminConfig } from "@/lib/env";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import {
  assertAdminMutationPermission,
  createActivityLogRecord,
  createCustomerCheckoutNotificationRecord,
  createNotificationRecord,
  fetchAdminRecordsByColumn,
  recordEntityRevisionSnapshot,
  updateOrderRecord,
  updateProductPublicationRecord,
  upsertProductRecord
} from "@/services/admin-actions";
import { readExpectedUpdatedAt, readOptionalExpectedUpdatedAt } from "@/lib/admin/conflict-handling";
import { AdminRecordConflictError } from "@/services/admin-actions";
import { assertValidWarehouseCode } from "@/services/warehouses";
import {
  getDefaultWarehouseCode,
  getWarehouseConfiguration,
  parseWarehouseConfigurationFormData
} from "@/services/warehouse-config";
import {
  assertOrderFulfillmentTransition,
  buildOrderCreateWorkflowFromFormData,
  buildOrderLifecycleUpdateFromFormData,
  buildProductInventoryWorkflowFromFormData,
  buildSimpleInventoryUpdateFromFormData
} from "@/services/enterprise-admin-forms";
import {
  CSV_IMPORT_SOURCE_TAGS,
  inventoryStatusForQuantity,
  mapInventoryCsvRows,
  parseInventoryCsv,
  type InventoryCsvRecord
} from "@/services/inventory-csv";
import { buildOrderTimelineEntry, appendOrderTimeline, syncOrderStatusFromFulfillment } from "@/services/orders";
import { createStaffOrderFromWorkflowInput } from "@/services/manual-order";
import { parseShipmentTracking } from "@/lib/customer/shipment-tracking";
import { generateWarehouseOrderNumber } from "@/lib/orders/order-number";
import { orderInventoryDeducted } from "@/services/inventory";
import { deriveProductSku } from "@/lib/product-sku";
import { upsertProductInventoryRecord } from "@/services/product-inventory";
import { saveProductInventory } from "@/services/product-inventory-workflow";
import { requirePermission, getCurrentAuthContext } from "@/services/auth";
import { resolveWarehouseScope } from "@/services/warehouse-scope";
import { roleHasPermission, PermissionDeniedError } from "@/lib/auth/permissions";
import { ProfileDisabledError } from "@/lib/auth/profile-disabled";
import {
  applyFulfillmentStockMovements,
  applyWarehouseStockMovement,
  buildWarehouseMovementFormFromFormData,
  fetchInventoryBySku,
  fetchWarehouseStockBySku,
  recordInventoryMovementForStockChange,
  shouldDeductFulfillmentStock
} from "@/services/warehouse-movements";
import {
  buildShipmentCreateWorkflowFromFormData,
  buildShipmentUpdateWorkflowFromFormData,
  createShipmentWorkflow,
  fetchShipmentItemsByOrderId,
  fetchShipmentOrderItems,
  fetchShipmentsByOrderId,
  updateShipmentWorkflow
} from "@/services/shipments";
import {
  assertPackingChecklistComplete,
  buildPackingChecklistFromFormData,
  buildRemainingShipmentItems
} from "@/services/warehouse-packing";
import { cancelAdminOrderWorkflow } from "@/services/order-workflow";

type JsonRecord = Record<string, unknown>;
type InventorySourceTable = "inventory" | "warehouse_stock";

const warehouseActionReadColumns = {
  orderLifecycle: "select=id,status,payment_status,fulfillment_status,shipment_tracking,timeline,created_by_user_id,order_number,customer_email"
};

async function currentActorId() {
  const context = await requireWarehouseActor();
  return context.userId;
}

async function requireWarehouseActor() {
  return requirePermission("orders.lifecycle");
}

async function requireWarehouseScope() {
  const context = await requireWarehouseActor();
  return resolveWarehouseScope({ userId: context.userId, role: context.role });
}

async function requireProductCatalogActor() {
  const context = await requirePermission("products.write");
  return context.userId;
}

async function requireInventoryImportActor() {
  const context = await getCurrentAuthContext();
  if (context.disabled) {
    throw new ProfileDisabledError();
  }
  if (roleHasPermission(context.role, "products.write") || roleHasPermission(context.role, "warehouse.write")) {
    return context.userId;
  }
  throw new PermissionDeniedError("The current user does not have permission to import inventory CSV.");
}

async function fetchOrderRecord(orderId: string, env: Record<string, string | undefined> = process.env) {
  const config = assertSupabaseAdminConfig(env);
  const response = await fetchWithTimeout(`${config.url}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}&${warehouseActionReadColumns.orderLifecycle}`, {
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Failed to load order ${orderId}: ${response.status} ${response.statusText}`);
  }

  const rows = (await response.json()) as JsonRecord[];
  if (!rows.length) {
    throw new Error(`Order ${orderId} was not found.`);
  }

  return rows[0];
}

async function fetchOrderLifecycleNotifications(orderId: string, fulfillmentStatus: string, env: Record<string, string | undefined> = process.env) {
  const config = assertSupabaseAdminConfig(env);
  const response = await fetchWithTimeout(
    `${config.url}/rest/v1/notifications?select=id,payload&entity_table=eq.orders&entity_id=eq.${encodeURIComponent(orderId)}&limit=50`,
    {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        "Content-Type": "application/json"
      },
      cache: "no-store"
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to load order lifecycle notifications: ${response.status} ${response.statusText}`);
  }

  const rows = (await response.json()) as JsonRecord[];
  return rows.filter((row) => {
    const payload = row.payload;
    return Boolean(
      payload
      && typeof payload === "object"
      && !Array.isArray(payload)
      && (payload as JsonRecord).event === "order.fulfillment_notification"
      && (payload as JsonRecord).fulfillment_status === fulfillmentStatus
    );
  });
}

function notificationForFulfillmentStatus(status: string, orderId: string) {
  const templates: Record<string, { title: string; priority: string }> = {
    shipped: { title: `Order ${orderId} shipped`, priority: "normal" },
    delivered: { title: `Order ${orderId} delivered`, priority: "normal" },
    cancelled: { title: `Order ${orderId} cancelled`, priority: "high" },
    returned: { title: `Order ${orderId} returned`, priority: "high" }
  };

  return templates[status] ?? null;
}

async function createOrderLifecycleNotificationIfNeeded(input: {
  orderId: string;
  previousFulfillment: string;
  nextFulfillment: string;
  actorId: string | null;
  note: string | null;
  at: string;
}) {
  const template = notificationForFulfillmentStatus(input.nextFulfillment, input.orderId);
  if (!template) return null;

  const existing = await fetchOrderLifecycleNotifications(input.orderId, input.nextFulfillment);
  if (existing.length) return null;

  return createNotificationRecord(
    {
      recipient_id: null,
      channel: "operations",
      title: template.title,
      body: input.note ?? `Order fulfillment moved from ${input.previousFulfillment} to ${input.nextFulfillment}.`,
      status: "unread",
      priority: template.priority,
      entity_table: "orders",
      entity_id: input.orderId,
      payload: {
        event: "order.fulfillment_notification",
        previous_fulfillment_status: input.previousFulfillment,
        fulfillment_status: input.nextFulfillment,
        created_by: input.actorId,
        created_at: input.at
      }
    },
    input.actorId
  );
}

async function notifyCustomerAboutFulfillmentIfNeeded(input: {
  orderId: string;
  previousFulfillment: string;
  nextFulfillment: string;
}) {
  if (input.previousFulfillment === input.nextFulfillment) return;
  if (!["shipped", "delivered"].includes(input.nextFulfillment)) return;

  const order = await fetchOrderRecord(input.orderId);
  const customerUserId = String(order.created_by_user_id ?? "").trim();
  const customerEmail = String(order.customer_email ?? "").trim();
  if (!customerUserId && !customerEmail) return;

  const orderNumber = String(order.order_number ?? input.orderId);
  const tracking = parseShipmentTracking(order.shipment_tracking);
  const title = input.nextFulfillment === "delivered" ? "Order delivered" : "Order shipped";
  const body = input.nextFulfillment === "delivered"
    ? `Your order ${orderNumber} has been delivered.`
    : tracking?.trackingNumber
      ? `Your order ${orderNumber} is on its way via ${tracking.carrier ?? "our courier"}. Tracking number: ${tracking.trackingNumber}.`
      : tracking?.carrier
        ? `Your order ${orderNumber} is on its way via ${tracking.carrier}.`
        : `Your order ${orderNumber} is on its way.`;

  await createCustomerCheckoutNotificationRecord({
    recipient_id: customerUserId || null,
    channel: "customer",
    title,
    body,
    status: "unread",
    entity_table: "orders",
    entity_id: input.orderId,
    payload: {
      fulfillment_status: input.nextFulfillment,
      order_number: orderNumber,
      recipient_email: customerEmail || undefined,
      carrier: tracking?.carrier ?? undefined,
      tracking_number: tracking?.trackingNumber ?? undefined,
      tracking_url: tracking?.trackingUrl ?? undefined
    }
  }).catch(() => undefined);
}

async function resolveWarehouseCodeFromFormData(formData: FormData) {
  const value = formData.get("warehouse_code");
  const raw = typeof value === "string" && value.trim()
    ? value.trim()
    : await getDefaultWarehouseCode();
  return assertValidWarehouseCode(raw);
}

function readInventoryString(formData: FormData, key: string, fallback = "") {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readInventoryInteger(formData: FormData, key: string, fallback = 0) {
  const raw = readInventoryString(formData, key);
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${key} must be a non-negative integer.`);
  }
  return parsed;
}

function readInventoryNumber(formData: FormData, key: string, fallback = 0) {
  const raw = readInventoryString(formData, key);
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${key} must be a non-negative number.`);
  }
  return parsed;
}

function normalizeLinkageStockStatus(
  status: string,
  quantity: number
): "available" | "out_of_stock" {
  if (status === "out_of_stock" || status === "available") return status;
  return quantity <= 0 ? "out_of_stock" : "available";
}

function readInventoryStatus(formData: FormData, key = "stock_status") {
  const status = readInventoryString(formData, key, "available");
  if (status === "available" || status === "low_stock" || status === "out_of_stock" || status === "archived" || status === "discontinued" || status === "reserved") {
    return status;
  }
  throw new Error(`${key} must be one of: available, low_stock, out_of_stock, archived, discontinued, reserved.`);
}


async function revalidateInventoryPaths(productSlug?: string) {
  await revalidateCatalogSurfaces(productSlug);
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/products");
  revalidatePath("/warehouse/inventory");
  await revalidateAfterMutation("inventory", "warehouse_stock", "inventory_movements");
}

async function revalidateWarehouseFulfillmentPaths() {
  await revalidateAfterMutation("orders", "order_items", "shipments");
}

const FULFILLMENT_TRANSITION_SEQUENCE: Record<string, string> = {
  pending: "processing",
  processing: "picked",
  picked: "packed",
  packed: "ready_to_dispatch",
  ready_to_dispatch: "shipped"
};

async function advanceOrderFulfillmentStep(input: {
  orderId: string;
  warehouseCode: string;
  nextFulfillment: string;
  note: string;
  changeSummary: string;
  skipRevalidate?: boolean;
}) {
  const lifecycleForm = new FormData();
  lifecycleForm.set("order_id", input.orderId);
  lifecycleForm.set("fulfillment_status", input.nextFulfillment);
  lifecycleForm.set("warehouse_code", input.warehouseCode);
  lifecycleForm.set("note", input.note);
  lifecycleForm.set("change_summary", input.changeSummary);
  await updateWarehouseOrderLifecycleFormAction(lifecycleForm, {
    skipRevalidate: input.skipRevalidate
  });
}

async function ensurePackedShipmentForOrder(input: {
  orderId: string;
  warehouseCode: string;
  carrierName: string | null;
  trackingNumber: string | null;
  actorId: string;
  at: string;
}) {
  const shipments = await fetchShipmentsByOrderId(input.orderId);
  const existing = shipments.find((row) =>
    ["pending", "packed", "ready_for_pickup"].includes(String(row.shipment_status ?? "pending"))
  ) ?? shipments[0];

  if (existing) {
    const shipmentId = String(existing.id ?? "");
    if (input.carrierName || input.trackingNumber) {
      const shipmentForm = new FormData();
      shipmentForm.set("shipment_id", shipmentId);
      shipmentForm.set("shipment_status", String(existing.shipment_status ?? "packed"));
      shipmentForm.set("carrier_name", input.carrierName ?? String(existing.carrier_name ?? ""));
      shipmentForm.set("tracking_number", input.trackingNumber ?? String(existing.tracking_number ?? ""));
      shipmentForm.set("notes", "Updated during warehouse dispatch");
      shipmentForm.set("change_summary", `Update shipment for order ${input.orderId}`);
      await updateShipmentLifecycleFormAction(shipmentForm);
    }
    return shipmentId;
  }

  const orderItems = await fetchShipmentOrderItems(input.orderId);
  const items = orderItems.map((item) => ({
    orderItemId: String(item.id ?? ""),
    productId: String(item.product_slug ?? ""),
    variantId: String(item.variant_id ?? "").trim() || null,
    quantity: Number(item.quantity ?? 0)
  })).filter((item) => item.orderItemId && item.productId && item.quantity > 0);

  if (!items.length) {
    throw new Error("This order has no shippable items.");
  }

  const result = await createShipmentWorkflow(
    {
      orderId: input.orderId,
      warehouseId: input.warehouseCode,
      carrierName: input.carrierName,
      trackingNumber: input.trackingNumber,
      notes: "Shipment created during warehouse dispatch",
      items,
      changeSummary: `Create shipment for order ${input.orderId}`,
      initialStatus: "packed"
    },
    { actorId: input.actorId, at: input.at }
  );

  return String((result.shipment as JsonRecord).id ?? "");
}

function adminRestHeaders(serviceRoleKey: string, prefer = "return=representation") {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    Prefer: prefer
  };
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

async function sourceTableError(response: Response, table: InventorySourceTable, action: string) {
  const body = await response.text();
  return `Failed to ${action} ${table} during CSV source replacement: ${response.status} ${response.statusText}${body ? ` - ${body.slice(0, 500)}` : ""}`;
}

async function fetchInventoryCsvSourceSlugs(env: Record<string, string | undefined> = process.env) {
  const config = assertSupabaseAdminConfig(env);
  const tags = [...CSV_IMPORT_SOURCE_TAGS];
  const slugs = new Set<string>();
  const pageSize = 500;

  for (const tag of tags) {
    let offset = 0;

    while (true) {
      const response = await fetchWithTimeout(
        `${config.url}/rest/v1/mithron_products?select=slug&source_availability=eq.${encodeURIComponent(tag)}&limit=${pageSize}&offset=${offset}`,
        {
          headers: adminRestHeaders(config.serviceRoleKey),
          cache: "no-store"
        }
      );

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Failed to read legacy CSV inventory product slugs: ${response.status} ${response.statusText}${body ? ` - ${body.slice(0, 500)}` : ""}`);
      }

      const rows = await response.json() as JsonRecord[];
      if (!rows.length) break;

      for (const row of rows) {
        const slug = String(row.slug ?? "").trim();
        if (slug) slugs.add(slug);
      }

      if (rows.length < pageSize) break;
      offset += pageSize;
    }
  }

  return [...slugs];
}

async function deleteInventorySourceRows(table: InventorySourceTable, productSlugs: string[], env: Record<string, string | undefined> = process.env) {
  if (!productSlugs.length) return 0;
  const config = assertSupabaseAdminConfig(env);
  let deletedRows = 0;
  for (const slugChunk of chunks([...new Set(productSlugs)], 100)) {
    const slugFilter = slugChunk.map((slug) => encodeURIComponent(slug)).join(",");
    const response = await fetchWithTimeout(`${config.url}/rest/v1/${table}?product_slug=in.(${slugFilter})&select=id`, {
      method: "DELETE",
      headers: adminRestHeaders(config.serviceRoleKey)
    });

    if (!response.ok) {
      throw new Error(await sourceTableError(response, table, "delete existing rows from"));
    }
    const deleted = await response.json() as JsonRecord[];
    deletedRows += deleted.length;
  }
  return deletedRows;
}

async function clearInventorySourceTable(table: InventorySourceTable, actorId: string | null, productSlugs: string[]) {
  await assertAdminMutationPermission(table, actorId);
  return deleteInventorySourceRows(table, productSlugs);
}

async function clearInventorySourceTables(actorId: string | null, productSlugs: string[]) {
  return {
    inventory: await clearInventorySourceTable("inventory", actorId, productSlugs)
  };
}

export async function saveWarehouseInventoryFormAction(formData: FormData) {
  const input = buildProductInventoryWorkflowFromFormData(formData);
  const actorId = await currentActorId();
  if (!actorId) throw new Error("Authentication required.");

  await saveProductInventory(input, actorId, {
    auditAction: "warehouse.stock_adjustment"
  });

  revalidatePath("/admin/products");
  revalidatePath("/warehouse");
  revalidatePath("/warehouse/inventory");
  revalidatePath("/warehouse/movements");
}

export async function saveSimpleInventoryFormAction(formData: FormData) {
  const input = buildSimpleInventoryUpdateFromFormData(formData);
  const actorId = await currentActorId();
  if (!actorId) throw new Error("Authentication required.");

  const previousInventory = await fetchInventoryBySku(input.productSlug, input.sku);
  const previousVariantId = String(previousInventory?.variant_id ?? "").trim();
  const variantId = input.variantId ?? (previousVariantId || null);

  await saveProductInventory(
    {
      productSlug: input.productSlug,
      sku: input.sku,
      variantId,
      stockStatus: input.stockStatus,
      quantity: input.quantity,
      warehouseCode: input.warehouseCode,
      changeSummary: input.note ?? input.changeSummary
    },
    actorId,
    {
      auditAction: "warehouse.simple_stock_update"
    }
  );

  await revalidateInventoryPaths();
}

export async function saveInventoryQuickEditFormAction(formData: FormData) {
  const auth = await getCurrentAuthContext();
  if (auth.disabled) {
    throw new ProfileDisabledError();
  }
  if (!roleHasPermission(auth.role, "products.write")) {
    throw new PermissionDeniedError(
      "Stock edits are managed in the Admin panel. Warehouse operators can view stock levels only."
    );
  }

  const productSlug = readInventoryString(formData, "product_slug");
  const sku = readInventoryString(formData, "sku");
  if (!productSlug || !sku) throw new Error("Product and SKU are required for inventory updates.");

  const warehouseCode = await resolveWarehouseCodeFromFormData(formData);
  const stockStatus = readInventoryStatus(formData);
  const adjustmentMode = readInventoryString(formData, "adjustment_mode")
    || (readInventoryString(formData, "adjustment_type") === "decrease" ? "decrease" : "replace");
  const adjustmentQuantity = readInventoryInteger(formData, "adjustment_quantity");
  let quantity = readInventoryInteger(formData, "quantity");
  const category = readInventoryString(formData, "category");
  const price = readInventoryNumber(formData, "price");
  const variantId = readInventoryString(formData, "variant_id") || null;
  const note = readInventoryString(formData, "note") || null;
  const reasonCode = readInventoryString(formData, "reason_code") || "warehouse_quick_edit";
  const expectedInventoryUpdatedAt = readOptionalExpectedUpdatedAt(formData, "expected_inventory_updated_at");
  const actorId = await currentActorId();
  const now = new Date().toISOString();
  const previousInventory = await fetchInventoryBySku(productSlug, sku);
  const quantityBefore = Number(previousInventory?.quantity ?? 0);

  if (adjustmentMode === "increase") {
    quantity = quantityBefore + (adjustmentQuantity ?? quantity);
  } else if (adjustmentMode === "decrease") {
    quantity = quantityBefore - (adjustmentQuantity ?? quantity);
  } else if (adjustmentMode === "replace") {
    quantity = adjustmentQuantity ?? quantity;
  }

  if (quantity < 0) {
    throw new Error("Stock cannot go below zero.");
  }
  const shouldArchiveProduct = stockStatus === "archived";
  if (shouldArchiveProduct) await assertAdminMutationPermission("mithron_products", actorId);
  const persistedStatus = stockStatus === "archived" ? "out_of_stock" : stockStatus;

  if (
    expectedInventoryUpdatedAt
    && previousInventory?.updated_at
    && String(previousInventory.updated_at) !== expectedInventoryUpdatedAt
  ) {
    throw new AdminRecordConflictError(
      "Concurrent inventory update detected. Reload stock levels and retry.",
      previousInventory
    );
  }

  await saveProductInventory(
    {
      productSlug,
      sku,
      variantId,
      stockStatus: normalizeLinkageStockStatus(persistedStatus, quantity),
      quantity,
      warehouseCode,
      changeSummary: note ?? `Update inventory for ${productSlug}:${sku}`
    },
    actorId!,
    { auditAction: reasonCode }
  );

  if (shouldArchiveProduct || category || price) {
    const productPayload: JsonRecord = {
      slug: productSlug,
      updated_at: now
    };
    if (category) productPayload.category = category;
    if (price) productPayload.price = price;
    if (shouldArchiveProduct) {
      productPayload.workflow_status = "archived";
      productPayload.is_visible = false;
    }
    await updateProductPublicationRecord(productPayload, actorId);
  }

  await revalidateInventoryPaths(productSlug);
}

async function importInventoryCsvRecord(
  record: InventoryCsvRecord,
  actorId: string | null,
  now: string,
  warehouseCode: string,
  prefetched?: {
    productsBySlug: Map<string, JsonRecord>;
    inventoryByKey: Map<string, JsonRecord>;
  }
) {
  const productSlug = record.productSlug.trim();
  const canonicalSku = deriveProductSku(productSlug);
  const product = prefetched?.productsBySlug.get(productSlug)
    ?? (await fetchAdminRecordsByColumn("mithron_products", "slug", productSlug))[0];
  if (!product) {
    throw new Error(
      `Product "${productSlug}" does not exist. Create it in Products before importing inventory for row ${record.sourceRow}.`
    );
  }

  const inventoryKey = `${productSlug}::${canonicalSku}`;
  const previousInventory = prefetched?.inventoryByKey.get(inventoryKey)
    ?? await fetchInventoryBySku(productSlug, canonicalSku);
  const quantityBefore = Number(previousInventory?.quantity ?? 0);

  await upsertProductInventoryRecord(
    {
      productSlug,
      sku: canonicalSku,
      variantId: null,
      stockStatus: normalizeLinkageStockStatus(record.stockStatus, record.stock),
      quantity: record.stock,
      warehouseCode,
      changeSummary: `Imported from inventory CSV row ${record.sourceRow}.`
    },
    actorId
  );

  const movement = await recordInventoryMovementForStockChange(
    {
      productId: productSlug,
      sku: canonicalSku,
      variantId: null,
      warehouseCode,
      warehouseStockId: null,
      movementType: "correction",
      quantityBefore,
      quantityAfter: record.stock,
      reasonCode: "csv_import",
      notes: `Imported from inventory CSV row ${record.sourceRow}.`,
      actorUserId: actorId,
      relatedOrderId: null,
      relatedShipmentId: null,
      at: now
    },
    actorId
  );

  return { product, movement };
}

async function prefetchCsvImportContext(records: InventoryCsvRecord[]) {
  const config = assertSupabaseAdminConfig(process.env);
  const productsBySlug = new Map<string, JsonRecord>();
  const inventoryByKey = new Map<string, JsonRecord>();
  const slugs = [...new Set(records.map((record) => record.productSlug.trim()).filter(Boolean))];

  for (const slugChunk of chunks(slugs, 100)) {
    const slugFilter = slugChunk.map((slug) => encodeURIComponent(slug)).join(",");
    const [productsResponse, inventoryResponse] = await Promise.all([
      fetchWithTimeout(
        `${config.url}/rest/v1/mithron_products?slug=in.(${slugFilter})&select=slug,id,name,workflow_status`,
        {
          headers: {
            apikey: config.serviceRoleKey,
            Authorization: `Bearer ${config.serviceRoleKey}`
          },
          cache: "no-store"
        }
      ),
      fetchWithTimeout(
        `${config.url}/rest/v1/inventory?product_slug=in.(${slugFilter})&select=id,product_slug,sku,variant_id,stock_status,quantity,reserved_quantity,reorder_threshold,updated_at`,
        {
          headers: {
            apikey: config.serviceRoleKey,
            Authorization: `Bearer ${config.serviceRoleKey}`
          },
          cache: "no-store"
        }
      )
    ]);

    if (!productsResponse.ok) {
      throw new Error(`Failed to prefetch products for CSV import: ${productsResponse.status}`);
    }
    if (!inventoryResponse.ok) {
      throw new Error(`Failed to prefetch inventory for CSV import: ${inventoryResponse.status}`);
    }

    const products = (await productsResponse.json()) as JsonRecord[];
    const inventoryRows = (await inventoryResponse.json()) as JsonRecord[];
    for (const product of products) {
      const slug = String(product.slug ?? "").trim();
      if (slug) productsBySlug.set(slug, product);
    }
    for (const row of inventoryRows) {
      const slug = String(row.product_slug ?? "").trim();
      const sku = String(row.sku ?? "").trim();
      if (slug && sku) inventoryByKey.set(`${slug}::${sku}`, row);
    }
  }

  return { productsBySlug, inventoryByKey };
}

export async function importInventoryCsvFormAction(formData: FormData) {
  await requireInventoryImportActor();
  const file = formData.get("inventory_csv");
  if (!(file instanceof File) || file.size <= 0) {
    throw new Error("Choose an inventory CSV file before importing.");
  }
  if (file.size > 2_000_000) {
    throw new Error("Inventory CSV is too large for this import pass.");
  }

  const mapped = mapInventoryCsvRows(parseInventoryCsv(await file.text()));
  if (mapped.errors.length) {
    throw new Error(mapped.errors.slice(0, 5).join(" "));
  }
  if (!mapped.records.length) {
    throw new Error("Inventory CSV did not contain any valid rows.");
  }

  const actorId = await currentActorId();
  const scope = await requireWarehouseScope();
  const now = new Date().toISOString();
  const sourceSlugs = await fetchInventoryCsvSourceSlugs();
  const cleared = await clearInventorySourceTables(actorId, sourceSlugs);
  const prefetched = await prefetchCsvImportContext(mapped.records);

  for (const record of mapped.records) {
    await importInventoryCsvRecord(record, actorId, now, scope.warehouseCode, prefetched);
  }

  await createActivityLogRecord(
    {
      actor_id: actorId,
      action: "warehouse.csv_import",
      entity_table: "inventory",
      entity_id: "csv-import",
      severity: mapped.warnings.length ? "warning" : "info",
      metadata: {
        imported_rows: mapped.records.length,
        cleared_rows: cleared,
        source_of_truth: "uploaded_csv",
        warnings: mapped.warnings.slice(0, 20),
        generated_skus: mapped.generatedSkus.slice(0, 20)
      }
    },
    actorId
  );

  await revalidateInventoryPaths();
}

export async function saveInventoryBulkUpdateFormAction(formData: FormData) {
  const selectedRows = formData.getAll("selected_inventory_row").filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  if (!selectedRows.length) throw new Error("Select at least one inventory row.");

  const nextStatus = readInventoryStatus(formData, "bulk_stock_status");
  const nextCategory = readInventoryString(formData, "bulk_category");
  if (nextCategory || nextStatus === "archived") {
    await requireProductCatalogActor();
  }
  const actorId = await currentActorId();
  const scope = await requireWarehouseScope();
  const now = new Date().toISOString();
  let updated = 0;

  const parsedRows = selectedRows.map((selected) => {
    const [warehouseCode = scope.warehouseCode, productSlug = "", sku = ""] = selected.split("::");
    return { selected, warehouseCode, productSlug, sku };
  }).filter((row) => row.productSlug && row.sku);

  const inventoryByKey = new Map<string, JsonRecord>();
  const slugs = [...new Set(parsedRows.map((row) => row.productSlug))];
  const config = assertSupabaseAdminConfig(process.env);
  for (const slugChunk of chunks(slugs, 100)) {
    const slugFilter = slugChunk.map((slug) => encodeURIComponent(slug)).join(",");
    const response = await fetchWithTimeout(
      `${config.url}/rest/v1/inventory?product_slug=in.(${slugFilter})&select=id,product_slug,sku,variant_id,stock_status,quantity,reserved_quantity,reorder_threshold,updated_at`,
      {
        headers: {
          apikey: config.serviceRoleKey,
          Authorization: `Bearer ${config.serviceRoleKey}`
        },
        cache: "no-store"
      }
    );
    if (!response.ok) {
      throw new Error(`Failed to prefetch inventory for bulk edit: ${response.status}`);
    }
    const rows = (await response.json()) as JsonRecord[];
    for (const row of rows) {
      const slug = String(row.product_slug ?? "").trim();
      const sku = String(row.sku ?? "").trim();
      if (slug && sku) inventoryByKey.set(`${slug}::${sku}`, row);
    }
  }

  for (const { warehouseCode, productSlug, sku } of parsedRows) {
    const previousInventory = inventoryByKey.get(`${productSlug}::${sku}`) ?? null;
    const onHandQuantity = Number(previousInventory?.quantity ?? 0);
    const variantId = String(previousInventory?.variant_id ?? "").trim() || null;
    const persistedStatus = nextStatus === "archived" ? "out_of_stock" : nextStatus;

    await upsertProductInventoryRecord(
      {
        productSlug,
        sku,
        variantId,
        stockStatus: normalizeLinkageStockStatus(persistedStatus || inventoryStatusForQuantity(onHandQuantity), onHandQuantity),
        quantity: onHandQuantity,
        warehouseCode,
        changeSummary: "Bulk inventory update"
      },
      actorId
    );

    const productPayload: JsonRecord = { slug: productSlug, updated_at: now };
    if (nextCategory) productPayload.category = nextCategory;
    if (nextStatus === "archived") {
      productPayload.workflow_status = "archived";
      productPayload.is_visible = false;
    }
    if (nextCategory || nextStatus === "archived") {
      await updateProductPublicationRecord(productPayload, actorId);
    }
    updated += 1;
  }

  await createActivityLogRecord(
    {
      actor_id: actorId,
      action: "warehouse.inventory_bulk_update",
      entity_table: "inventory",
      entity_id: "bulk",
      severity: nextStatus === "out_of_stock" || nextStatus === "archived" ? "warning" : "info",
      metadata: {
        selected_rows: selectedRows.length,
        updated_rows: updated,
        stock_status: nextStatus,
        category: nextCategory || null
      }
    },
    actorId
  );

  await revalidateInventoryPaths();
}

export async function saveInventoryBulkRestockFormAction(formData: FormData) {
  const auth = await getCurrentAuthContext();
  if (auth.disabled) {
    throw new ProfileDisabledError();
  }
  if (!roleHasPermission(auth.role, "products.write")) {
    throw new PermissionDeniedError(
      "Stock edits are managed in the Admin panel. Warehouse operators can view stock levels only."
    );
  }

  const amount = readInventoryInteger(formData, "restock_amount", 10);
  if (amount < 1) throw new Error("Restock amount must be at least 1.");
  if (amount > 10000) throw new Error("Restock amount cannot exceed 10,000.");

  const scopeMode = readInventoryString(formData, "restock_scope", "all");
  const actorId = await currentActorId();
  const warehouseScope = await requireWarehouseScope();
  const warehouseCode = await resolveWarehouseCodeFromFormData(formData);
  const config = assertSupabaseAdminConfig(process.env);

  type RestockTarget = { productSlug: string; sku: string; quantity: number; variantId: string | null };
  const targets: RestockTarget[] = [];

  if (scopeMode === "selected") {
    const selectedRows = formData
      .getAll("selected_inventory_row")
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
    if (!selectedRows.length) throw new Error("Select at least one inventory row.");

    const parsedRows = selectedRows
      .map((selected) => {
        const [rowWarehouse = warehouseScope.warehouseCode, productSlug = "", sku = ""] = selected.split("::");
        return { warehouseCode: rowWarehouse, productSlug, sku };
      })
      .filter((row) => row.productSlug && row.sku);

    const slugs = [...new Set(parsedRows.map((row) => row.productSlug))];
    const inventoryByKey = new Map<string, JsonRecord>();
    for (const slugChunk of chunks(slugs, 100)) {
      const slugFilter = slugChunk.map((slug) => encodeURIComponent(slug)).join(",");
      const response = await fetchWithTimeout(
        `${config.url}/rest/v1/inventory?product_slug=in.(${slugFilter})&select=id,product_slug,sku,variant_id,quantity`,
        {
          headers: {
            apikey: config.serviceRoleKey,
            Authorization: `Bearer ${config.serviceRoleKey}`
          },
          cache: "no-store"
        }
      );
      if (!response.ok) {
        throw new Error(`Failed to prefetch inventory for restock: ${response.status}`);
      }
      const rows = (await response.json()) as JsonRecord[];
      for (const row of rows) {
        const slug = String(row.product_slug ?? "").trim();
        const sku = String(row.sku ?? "").trim();
        if (slug && sku) inventoryByKey.set(`${slug}::${sku}`, row);
      }
    }

    for (const row of parsedRows) {
      const existing = inventoryByKey.get(`${row.productSlug}::${row.sku}`);
      targets.push({
        productSlug: row.productSlug,
        sku: row.sku,
        quantity: Number(existing?.quantity ?? 0),
        variantId: String(existing?.variant_id ?? "").trim() || null
      });
    }
  } else {
    let offset = 0;
    const pageSize = 500;
    for (;;) {
      const response = await fetchWithTimeout(
        `${config.url}/rest/v1/inventory?select=product_slug,sku,variant_id,quantity&order=product_slug.asc&limit=${pageSize}&offset=${offset}`,
        {
          headers: {
            apikey: config.serviceRoleKey,
            Authorization: `Bearer ${config.serviceRoleKey}`
          },
          cache: "no-store"
        }
      );
      if (!response.ok) {
        throw new Error(`Failed to load inventory for restock: ${response.status}`);
      }
      const rows = (await response.json()) as JsonRecord[];
      if (!rows.length) break;
      for (const row of rows) {
        const productSlug = String(row.product_slug ?? "").trim();
        const sku = String(row.sku ?? "").trim();
        if (!productSlug || !sku) continue;
        targets.push({
          productSlug,
          sku,
          quantity: Number(row.quantity ?? 0),
          variantId: String(row.variant_id ?? "").trim() || null
        });
      }
      if (rows.length < pageSize) break;
      offset += pageSize;
    }
  }

  if (!targets.length) throw new Error("No inventory rows found to restock.");

  let updated = 0;
  for (const target of targets) {
    const nextQuantity = Math.max(0, target.quantity) + amount;
    await upsertProductInventoryRecord(
      {
        productSlug: target.productSlug,
        sku: target.sku,
        variantId: target.variantId,
        stockStatus: normalizeLinkageStockStatus(inventoryStatusForQuantity(nextQuantity), nextQuantity),
        quantity: nextQuantity,
        warehouseCode: warehouseCode || warehouseScope.warehouseCode,
        changeSummary: `Bulk restock +${amount}`
      },
      actorId
    );
    updated += 1;
  }

  await createActivityLogRecord(
    {
      actor_id: actorId,
      action: "warehouse.inventory_bulk_restock",
      entity_table: "inventory",
      entity_id: "bulk_restock",
      severity: "info",
      metadata: {
        restock_amount: amount,
        restock_scope: scopeMode,
        updated_rows: updated
      }
    },
    actorId
  );

  await revalidateInventoryPaths();
}

export async function deleteInventoryProductFormAction(formData: FormData) {
  const productSlug = readInventoryString(formData, "product_slug");
  if (!productSlug) throw new Error("Product is required before archiving.");
  const actorId = await requireProductCatalogActor();
  const now = new Date().toISOString();
  await updateProductPublicationRecord(
    {
      slug: productSlug,
      workflow_status: "archived",
      is_visible: false,
      published_at: null,
      archived_at: now,
      updated_at: now
    },
    actorId
  );
  await revalidateInventoryPaths(productSlug);
}

export async function duplicateInventoryProductFormAction(formData: FormData) {
  const productSlug = readInventoryString(formData, "product_slug");
  const productName = readInventoryString(formData, "product_name", productSlug);
  const sku = readInventoryString(formData, "sku");
  if (!productSlug || !sku) throw new Error("Product and SKU are required before duplicating inventory.");

  const actorId = await requireProductCatalogActor();
  const context = await getCurrentAuthContext();
  const scope = await resolveWarehouseScope({ userId: context.userId, role: context.role });
  const now = new Date().toISOString();
  const copySlug = `${productSlug}-copy-${Date.now()}`;
  const copySku = deriveProductSku(copySlug);
  const quantity = readInventoryInteger(formData, "quantity");
  const price = readInventoryNumber(formData, "price");
  const category = readInventoryString(formData, "category", "Uncategorized");
  const imageUrl = readInventoryString(formData, "product_image");
  const stockStatus = inventoryStatusForQuantity(quantity);

  await upsertProductRecord(
    {
      slug: copySlug,
      name: `${productName} Copy`,
      category,
      price,
      image: imageUrl ? { src: imageUrl, alt: `${productName} Copy`, source: "inventory_duplicate" } : null,
      workflow_status: "draft",
      is_visible: false,
      source_availability: "inventory_duplicate",
      updated_at: now
    },
    actorId
  );

  if (quantity > 0) {
    await saveProductInventory(
      {
        productSlug: copySlug,
        sku: copySku,
        variantId: null,
        stockStatus: normalizeLinkageStockStatus(stockStatus, quantity),
        quantity,
        warehouseCode: scope.warehouseCode,
        changeSummary: `Duplicate inventory from ${productSlug}`
      },
      actorId!,
      { auditAction: "warehouse.inventory_duplicate" }
    );
  } else {
    await createActivityLogRecord(
      {
        actor_id: actorId,
        action: "warehouse.inventory_duplicate",
        entity_table: "inventory",
        entity_id: `${copySlug}:${copySku}`,
        severity: "info",
        metadata: {
          source_product_slug: productSlug,
          source_sku: sku,
          product_slug: copySlug,
          sku: copySku
        }
      },
      actorId
    );
  }

  await revalidateInventoryPaths();
}

export async function applyWarehouseMovementFormAction(formData: FormData) {
  const input = buildWarehouseMovementFormFromFormData(formData);
  const actorId = await currentActorId();
  const now = new Date().toISOString();

  await applyWarehouseStockMovement(input, {
    actorId,
    at: now
  });

  revalidatePath("/admin/products");
  revalidatePath("/warehouse");
  revalidatePath("/warehouse/inventory");
  revalidatePath("/warehouse/movements");
}

export async function createWarehouseOrderFormAction(formData: FormData) {
  const input = buildOrderCreateWorkflowFromFormData(formData);
  const actorId = await currentActorId();
  if (!actorId) throw new Error("Unauthorized: no active session.");
  const warehouseCode = await resolveWarehouseCodeFromFormData(formData);

  await createStaffOrderFromWorkflowInput(
    {
      checkout: input.checkout,
      status: input.status,
      paymentStatus: input.paymentStatus,
      fulfillmentStatus: input.fulfillmentStatus,
      currency: input.currency,
      note: input.note,
      changeSummary: input.changeSummary,
      warehouseCode,
      orderNumber: generateWarehouseOrderNumber(),
      createdByStaffId: actorId,
      timelineSource: "warehouse"
    },
    actorId
  );

  await revalidateWarehouseFulfillmentPaths();
}

export async function updateWarehouseOrderLifecycleFormAction(
  formData: FormData,
  options?: { skipRevalidate?: boolean }
) {
  const input = buildOrderLifecycleUpdateFromFormData(formData);
  const actorId = await currentActorId();
  const now = new Date().toISOString();
  const warehouseCode = await resolveWarehouseCodeFromFormData(formData);
  const current = await fetchOrderRecord(input.orderId);
  const expectedUpdatedAt = readExpectedUpdatedAt(formData, String(current.updated_at ?? ""));
  let nextStatus = input.status ?? String(current.status ?? "draft");
  const nextPayment = input.paymentStatus ?? String(current.payment_status ?? "not_required");
  const previousStatus = String(current.status ?? "draft");
  const previousPayment = String(current.payment_status ?? "not_required");
  const previousFulfillment = String(current.fulfillment_status ?? "pending");
  const nextFulfillment = input.fulfillmentStatus
    ? assertOrderFulfillmentTransition(previousFulfillment, input.fulfillmentStatus)
    : previousFulfillment;
  if (input.fulfillmentStatus) {
    nextStatus = syncOrderStatusFromFulfillment(nextStatus, nextFulfillment);
  }

  const warehouseConfig = await getWarehouseConfiguration();
  const alreadyDeducted = await orderInventoryDeducted(input.orderId).catch(() => false);
  const fulfillmentMovements = !alreadyDeducted
    && shouldDeductFulfillmentStock(previousFulfillment, nextFulfillment, warehouseConfig.stockDeductionTrigger)
    ? await applyFulfillmentStockMovements({
      orderId: input.orderId,
      warehouseCode,
      actorId,
      at: now
    })
    : [];
  const timeline = appendOrderTimeline(
    current.timeline,
    buildOrderTimelineEntry({
      status: nextStatus,
      event: "order.lifecycle_update",
      note: input.note,
      actorId,
      metadata: {
        payment_status: nextPayment,
        previous_status: previousStatus,
        previous_payment_status: previousPayment,
        previous_fulfillment_status: previousFulfillment,
        fulfillment_status: nextFulfillment,
        warehouse_code: warehouseCode,
        inventory_movements: fulfillmentMovements.length,
        stock_deduction_trigger: warehouseConfig.stockDeductionTrigger
      },
      at: now
    })
  );

  const updated = await updateOrderRecord(
    input.orderId,
    {
      status: nextStatus,
      payment_status: nextPayment,
      fulfillment_status: nextFulfillment,
      shipment_tracking: input.shipmentTracking ?? current.shipment_tracking ?? {},
      timeline,
      updated_at: now
    },
    actorId,
    process.env,
    { expectedUpdatedAt }
  );

  await Promise.all([
    createActivityLogRecord(
      {
        actor_id: actorId,
        action: "orders.lifecycle_update",
        entity_table: "orders",
        entity_id: input.orderId,
        severity: nextFulfillment === "delivered" || nextFulfillment === "fulfilled" ? "info" : "warning",
        metadata: {
          status: nextStatus,
          payment_status: nextPayment,
          previous_status: previousStatus,
          previous_payment_status: previousPayment,
          previous_fulfillment_status: previousFulfillment,
          fulfillment_status: nextFulfillment,
          warehouse_code: warehouseCode,
          inventory_movements: fulfillmentMovements.length,
          stock_deduction_trigger: warehouseConfig.stockDeductionTrigger,
          note: input.note
        }
      },
      actorId
    ),
    recordEntityRevisionSnapshot(
      "orders",
      input.orderId,
      updated as JsonRecord,
      actorId,
      input.changeSummary
    ),
    createOrderLifecycleNotificationIfNeeded({
      orderId: input.orderId,
      previousFulfillment,
      nextFulfillment,
      actorId,
      note: input.note,
      at: now
    }),
    notifyCustomerAboutFulfillmentIfNeeded({
      orderId: input.orderId,
      previousFulfillment,
      nextFulfillment
    })
  ]);

  if (!options?.skipRevalidate) {
    await revalidateWarehouseFulfillmentPaths();
    revalidatePath("/warehouse/inventory");
  }
}

export async function completeWarehousePackingFormAction(formData: FormData) {
  const actorId = await currentActorId();
  const now = new Date().toISOString();
  const checklist = buildPackingChecklistFromFormData(formData);
  const requireItemScan = formData.get("require_item_scan") === "on";
  const order = await fetchOrderRecord(checklist.orderId);
  const previousFulfillment = String(order.fulfillment_status ?? "pending");
  if (!["picked", "packed"].includes(previousFulfillment)) {
    throw new Error(`Order must be picked before packing. Current fulfillment status is "${previousFulfillment}".`);
  }

  const orderItems = await fetchShipmentOrderItems(checklist.orderId);
  assertPackingChecklistComplete(checklist, orderItems, { requireItemScan });

  const warehouseId = readInventoryString(formData, "warehouse_id")
    || await resolveWarehouseCodeFromFormData(formData);
  const carrierName = readInventoryString(formData, "carrier_name") || null;
  const trackingNumber = readInventoryString(formData, "tracking_number") || null;
  const existingShipmentItems = await fetchShipmentItemsByOrderId(checklist.orderId);
  const items = buildRemainingShipmentItems(orderItems, existingShipmentItems, checklist.verifiedItemIds);

  const result = await createShipmentWorkflow(
    {
      orderId: checklist.orderId,
      warehouseId,
      carrierName,
      trackingNumber,
      notes: checklist.packingNote,
      items,
      changeSummary: readInventoryString(formData, "change_summary", `Complete pack for order ${checklist.orderId}`),
      initialStatus: "packed"
    },
    { actorId, at: now }
  );

  const syncedFulfillment = String((result.order as JsonRecord)?.fulfillment_status ?? "");
  if (syncedFulfillment !== "packed" && previousFulfillment === "picked") {
    const nextFulfillment = assertOrderFulfillmentTransition(previousFulfillment, "packed");
    const nextStatus = syncOrderStatusFromFulfillment(String(order.status ?? "assigned"), nextFulfillment);
    await updateOrderRecord(
      checklist.orderId,
      {
        status: nextStatus,
        fulfillment_status: nextFulfillment,
        updated_at: now
      },
      actorId
    );
  }

  await revalidateWarehouseFulfillmentPaths();
  revalidatePath("/warehouse/inventory");
  const shipmentId = String((result.shipment as JsonRecord).id ?? "");
  if (shipmentId) {
    revalidatePath(`/warehouse/shipments/${shipmentId}`);
  }

  return {
    shipmentId,
    shipmentNumber: String((result.shipment as JsonRecord).shipment_number ?? ""),
    itemCount: items.length
  };
}

export async function saveWarehouseConfigurationFormAction(formData: FormData) {
  const actorId = await currentActorId();
  const input = parseWarehouseConfigurationFormData(formData);
  if (!input.defaultWarehouseCode) throw new Error("Default warehouse is required.");
  await assertValidWarehouseCode(input.defaultWarehouseCode);
  await assertValidWarehouseCode(input.checkoutWarehouseCode);
  await assertValidWarehouseCode(input.supplierIntakeWarehouseCode);

  const config = assertSupabaseAdminConfig();
  const payload = {
    id: "global",
    default_warehouse_code: input.defaultWarehouseCode,
    checkout_warehouse_code: input.checkoutWarehouseCode,
    supplier_intake_warehouse_code: input.supplierIntakeWarehouseCode,
    auto_reserve_on_allocate: false,
    stock_deduction_trigger: input.stockDeductionTrigger,
    default_carrier: input.defaultCarrier,
    barcode_prefix: input.barcodePrefix,
    printer_name: input.printerName,
    label_width_mm: input.labelWidthMm,
    require_item_scan: input.requireItemScan,
    updated_at: new Date().toISOString(),
    updated_by: actorId
  };

  const response = await fetchWithTimeout(`${config.url}/rest/v1/warehouse_configuration`, {
    method: "POST",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Failed to save warehouse configuration (${response.status})${body ? `: ${body.slice(0, 200)}` : ""}`);
  }

  await createActivityLogRecord(
    {
      actor_id: actorId,
      action: "warehouse.configuration.update",
      entity_table: "warehouse_configuration",
      entity_id: "global",
      severity: "info",
      metadata: {
        default_warehouse_code: input.defaultWarehouseCode,
        checkout_warehouse_code: input.checkoutWarehouseCode,
        supplier_intake_warehouse_code: input.supplierIntakeWarehouseCode,
        stock_deduction_trigger: input.stockDeductionTrigger
      }
    },
    actorId
  );

  revalidatePath("/warehouse/settings");
  revalidatePath("/admin/inventory");
  await revalidateWarehouseFulfillmentPaths();
}

export async function createShipmentFormAction(formData: FormData) {
  const input = buildShipmentCreateWorkflowFromFormData(formData);
  const actorId = await currentActorId();
  const now = new Date().toISOString();

  const result = await createShipmentWorkflow(input, {
    actorId,
    at: now
  });

  const shipmentId = String((result.shipment as JsonRecord).id ?? "");
  await revalidateWarehouseFulfillmentPaths();
  revalidatePath("/warehouse/inventory");
  if (shipmentId) {
    revalidatePath(`/warehouse/shipments/${shipmentId}`);
  }
}

export async function updateShipmentLifecycleFormAction(formData: FormData) {
  const input = buildShipmentUpdateWorkflowFromFormData(formData);
  const actorId = await currentActorId();
  const now = new Date().toISOString();
  const shipmentRows = await fetchAdminRecordsByColumn("shipments", "id", input.shipmentId);
  const shipmentBefore = shipmentRows[0];
  const orderId = String(shipmentBefore?.order_id ?? "");
  const orderBefore = orderId ? await fetchOrderRecord(orderId) : null;
  const previousFulfillment = String(orderBefore?.fulfillment_status ?? "pending");

  const result = await updateShipmentWorkflow(input, {
    actorId,
    at: now
  });

  if (orderId && (input.shipmentStatus === "shipped" || input.shipmentStatus === "delivered")) {
    const nextFulfillment = String(
      result.order?.fulfillment_status ?? (input.shipmentStatus === "delivered" ? "delivered" : "shipped")
    );
    const currentStatus = String(result.order?.status ?? orderBefore?.status ?? "active");
    const nextStatus = syncOrderStatusFromFulfillment(currentStatus, nextFulfillment);
    const warehouseConfig = await getWarehouseConfiguration();
    const carrier = (
      input.carrierName
      || String(shipmentBefore?.carrier_name ?? "").trim()
      || warehouseConfig.defaultCarrier
    ).trim();
    const tracking = (input.trackingNumber ?? String(shipmentBefore?.tracking_number ?? "")).trim();

    await updateOrderRecord(
      orderId,
      {
        status: nextStatus,
        shipment_tracking: {
          carrier,
          ...(tracking ? { tracking_number: tracking } : {})
        },
        updated_at: now
      },
      actorId
    );

    await notifyCustomerAboutFulfillmentIfNeeded({
      orderId,
      previousFulfillment,
      nextFulfillment
    });
  }

  await revalidateWarehouseFulfillmentPaths();
  revalidatePath("/warehouse/inventory");
  revalidatePath(`/warehouse/shipments/${input.shipmentId}`);
  revalidatePath("/track-order");
  revalidatePath("/account/orders");
}

export async function receiveWarehouseOrderFormAction(formData: FormData) {
  const orderId = readInventoryString(formData, "order_id");
  if (!orderId) throw new Error("Order is required.");

  const warehouseCode = await resolveWarehouseCodeFromFormData(formData);
  const order = await fetchOrderRecord(orderId);
  const fulfillment = String(order.fulfillment_status ?? "pending");
  if (fulfillment !== "pending") {
    throw new Error(`Only awaiting-receipt orders can be marked received. Current status is "${fulfillment}".`);
  }

  await advanceOrderFulfillmentStep({
    orderId,
    warehouseCode,
    nextFulfillment: "processing",
    note: "Order received at warehouse",
    changeSummary: `Mark order ${orderId} received`
  });
}

export async function cancelWarehouseOrderFormAction(formData: FormData) {
  const actorId = await currentActorId();
  const orderId = readInventoryString(formData, "order_id");
  const reason = readInventoryString(formData, "cancel_reason") || readInventoryString(formData, "reason");
  if (!orderId) throw new Error("Order is required.");
  if (!reason) throw new Error("A cancellation reason is required.");

  const order = await fetchOrderRecord(orderId);
  const fulfillment = String(order.fulfillment_status ?? "pending");
  const terminal = ["shipped", "delivered", "cancelled", "returned"];
  if (terminal.includes(fulfillment)) {
    throw new Error(`Order cannot be cancelled after dispatch. Current status is "${fulfillment}".`);
  }

  const expectedUpdatedAt = readOptionalExpectedUpdatedAt(formData, "expected_updated_at");
  await cancelAdminOrderWorkflow({
    orderId,
    actorId: actorId!,
    reason,
    expectedUpdatedAt
  });

  await revalidateWarehouseFulfillmentPaths();
  revalidatePath(`/warehouse/fulfillment/${orderId}`);
}

export async function advanceWarehouseOrderStepFormAction(formData: FormData) {
  await updateWarehouseOrderLifecycleFormAction(formData);
}

export async function dispatchWarehouseOrderFormAction(formData: FormData) {
  const orderId = readInventoryString(formData, "order_id");
  if (!orderId) throw new Error("Order is required for dispatch.");

  const actorId = await currentActorId();
  const now = new Date().toISOString();
  const warehouseCode = await resolveWarehouseCodeFromFormData(formData);
  const warehouseConfig = await getWarehouseConfiguration();
  const carrierName = readInventoryString(formData, "carrier_name") || warehouseConfig.defaultCarrier;
  const trackingNumber = readInventoryString(formData, "tracking_number") || null;

  let order = await fetchOrderRecord(orderId);
  let fulfillment = String(order.fulfillment_status ?? "pending");
  const terminal = ["shipped", "delivered", "cancelled", "returned"];
  if (terminal.includes(fulfillment)) {
    throw new Error(`Order is already ${fulfillment}.`);
  }

  const dispatchableFrom = ["processing", "picked", "packed", "ready_to_dispatch"];
  if (fulfillment === "pending") {
    await advanceOrderFulfillmentStep({
      orderId,
      warehouseCode,
      nextFulfillment: "processing",
      note: "Order received and prepared for dispatch",
      changeSummary: `Receive order ${orderId} for dispatch`,
      skipRevalidate: true
    });
    order = await fetchOrderRecord(orderId);
    fulfillment = String(order.fulfillment_status ?? "processing");
  }

  while (dispatchableFrom.includes(fulfillment) && fulfillment !== "ready_to_dispatch") {
    const nextFulfillment = FULFILLMENT_TRANSITION_SEQUENCE[fulfillment];
    if (!nextFulfillment || nextFulfillment === "shipped") break;
    await advanceOrderFulfillmentStep({
      orderId,
      warehouseCode,
      nextFulfillment,
      note: "Prepared for dispatch",
      changeSummary: `Advance order ${orderId} toward dispatch`,
      skipRevalidate: true
    });
    order = await fetchOrderRecord(orderId);
    fulfillment = String(order.fulfillment_status ?? "pending");
  }

  if (fulfillment === "packed") {
    await advanceOrderFulfillmentStep({
      orderId,
      warehouseCode,
      nextFulfillment: "ready_to_dispatch",
      note: "Ready for dispatch",
      changeSummary: `Queue order ${orderId} for dispatch`,
      skipRevalidate: true
    });
    order = await fetchOrderRecord(orderId);
    fulfillment = String(order.fulfillment_status ?? "pending");
  }

  const shipmentId = await ensurePackedShipmentForOrder({
    orderId,
    warehouseCode,
    carrierName,
    trackingNumber,
    actorId: actorId!,
    at: now
  });

  if (!shipmentId) {
    throw new Error("No shipment could be created for this order.");
  }

  const shipmentForm = new FormData();
  shipmentForm.set("shipment_id", shipmentId);
  shipmentForm.set("shipment_status", "shipped");
  shipmentForm.set("carrier_name", carrierName);
  if (trackingNumber) {
    shipmentForm.set("tracking_number", trackingNumber);
  }
  shipmentForm.set("notes", "Dispatched from warehouse fulfillment");
  shipmentForm.set("change_summary", `Dispatch order ${orderId}`);
  await updateShipmentLifecycleFormAction(shipmentForm);

  order = await fetchOrderRecord(orderId);
  fulfillment = String(order.fulfillment_status ?? "pending");
  if (["packed", "ready_to_dispatch"].includes(fulfillment)) {
    await advanceOrderFulfillmentStep({
      orderId,
      warehouseCode,
      nextFulfillment: "shipped",
      note: "Order dispatched from warehouse fulfillment",
      changeSummary: `Dispatch order ${orderId}`,
      skipRevalidate: true
    });
  }

  await revalidateWarehouseFulfillmentPaths();
  revalidatePath("/warehouse/inventory");
}
