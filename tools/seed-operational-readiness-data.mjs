import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { pathToFileURL } from "node:url";

const { loadEnvConfig } = nextEnv;

const seed = {
  marker: "production-readiness-seed-v1",
  orderId: "0b5e0632-11dc-496f-9d7c-625c1aa41101",
  orderItemId: "9d480b2c-e876-4078-92f5-5cf769ed8455",
  shipmentId: "f14563ef-169c-4cf6-9e52-2c649a5359e3",
  shipmentItemId: "cfad6fd4-c33d-4848-bad5-4595d188f0d8",
  shipmentTimelineId: "4bc28abf-3abf-4bf1-bd07-9e30f4521617",
  inventoryMovementId: "62825a89-8f0b-4de9-8c75-f5f26e79b5f5",
  deploymentRequestId: "fd698205-d759-4aaf-bc11-b1d7d86b7a8d",
  staffTaskId: "a9809ff2-7ae9-43bb-a3d7-57762c8cc83f",
  notificationId: "6c3cc0d8-5834-4a1c-881e-43f16d79bb50",
  activityId: "810c1921-1120-4ddb-b9d7-d7055e1f6f4d"
};

const productSlug = "source-agri-kisan-drone-small-8-liter";
const sku = "PROD-READY-AG-8L";
const variantId = "production-readiness-base";

export function parseCliArgs(argv) {
  const args = new Set(argv);
  return {
    apply: args.has("--apply"),
    json: args.has("--json")
  };
}

function isoAt(offsetMinutes = 0) {
  return new Date(Date.UTC(2026, 4, 25, 8, offsetMinutes, 0)).toISOString();
}

function buildTimeline(event, status, note, offsetMinutes) {
  return {
    at: isoAt(offsetMinutes),
    event,
    status,
    note,
    actor_id: null,
    metadata: {
      marker: seed.marker,
      seeded: true,
      rollback_safe: true
    }
  };
}

export function buildOperationalSeedRows({ existingWarehouseStockId = null } = {}) {
  const orderId = seed.orderId;
  const shipmentTracking = {
    carrier: "Mithron Field Logistics",
    tracking: "MITHRON-READY-001",
    seeded: true,
    marker: seed.marker
  };

  return {
    orders: [{
      id: orderId,
      order_number: "PROD-READY-001",
      customer_email: "ops-readiness@example.com",
      status: "confirmed",
      payment_status: "not_required",
      fulfillment_status: "packed",
      channel: "production-readiness-seed",
      subtotal: 120000,
      total: 120000,
      currency: "INR",
      items: [{ product_slug: productSlug, sku, quantity: 1 }],
      shipment_tracking: shipmentTracking,
      timeline: [
        buildTimeline("order.created", "confirmed", "Production-readiness seed order created.", 0),
        buildTimeline("order.lifecycle_update", "processing", "Order moved into operational processing.", 5),
        buildTimeline("order.lifecycle_update", "packed", "Warehouse packed seed shipment.", 10)
      ],
      metadata: {
        marker: seed.marker,
        seeded: true,
        rollback_safe: true,
        purpose: "production-readiness-operational-dataset"
      },
      updated_at: isoAt(10)
    }],
    order_items: [{
      id: seed.orderItemId,
      order_id: orderId,
      product_slug: productSlug,
      product_name: "Agri Kisan Drone Small - 8 Liter",
      bundle_id: "production-readiness-kit",
      sku,
      quantity: 1,
      unit_price: 120000,
      line_total: 120000,
      metadata: {
        marker: seed.marker,
        seeded: true,
        rollback_safe: true
      },
      updated_at: isoAt(10)
    }],
    shipments: [{
      id: seed.shipmentId,
      order_id: orderId,
      shipment_number: "PROD-READY-SHP-001",
      shipment_status: "packed",
      warehouse_id: "IN-WEST-01",
      carrier_name: "Mithron Field Logistics",
      tracking_number: "MITHRON-READY-001",
      notes: "Seeded operational shipment for production-readiness dashboards.",
      actor_user_id: null,
      updated_at: isoAt(10)
    }],
    shipment_items: [{
      id: seed.shipmentItemId,
      shipment_id: seed.shipmentId,
      order_item_id: seed.orderItemId,
      product_id: productSlug,
      variant_id: variantId,
      quantity: 1
    }],
    shipment_timeline: [{
      id: seed.shipmentTimelineId,
      shipment_id: seed.shipmentId,
      event_type: "shipment.packed",
      previous_status: "pending",
      next_status: "packed",
      notes: "Production-readiness seed shipment packed.",
      actor_user_id: null,
      created_at: isoAt(10)
    }],
    inventory_movements: existingWarehouseStockId ? [{
      id: seed.inventoryMovementId,
      product_id: productSlug,
      sku,
      variant_id: variantId,
      warehouse_code: "IN-WEST-01",
      warehouse_stock_id: existingWarehouseStockId,
      movement_type: "fulfillment",
      quantity_delta: -1,
      quantity_before: 18,
      quantity_after: 17,
      reason_code: "production_readiness_seed",
      notes: "Production-readiness seed movement linked to packed shipment.",
      actor_user_id: null,
      related_order_id: orderId,
      related_shipment_id: seed.shipmentId
    }] : [],
    deployment_requests: [{
      id: seed.deploymentRequestId,
      order_id: orderId,
      requester_email: "ops-readiness@example.com",
      region: "IN-WEST",
      mission_profile: "agriculture-field-readiness",
      status: "pending",
      notes: "Seeded deployment request for operations readiness dashboards.",
      payload: {
        marker: seed.marker,
        seeded: true,
        priority: "high",
        rollback_safe: true,
        linked_shipment_id: seed.shipmentId
      },
      assigned_to: null,
      updated_at: isoAt(12)
    }],
    staff_tasks: [{
      id: seed.staffTaskId,
      title: "Confirm production-readiness shipment handoff",
      body: "Validate the seeded order, shipment, and deployment request workflow remains visible across operations dashboards.",
      status: "in_progress",
      priority: "high",
      assigned_to: null,
      related_request_id: seed.deploymentRequestId,
      due_at: isoAt(1440),
      created_by: null,
      updated_at: isoAt(12)
    }],
    notifications: [{
      id: seed.notificationId,
      recipient_id: null,
      channel: "operations",
      title: "Production-readiness deployment request pending",
      body: "Seeded operational request is ready for workflow validation.",
      status: "unread",
      priority: "high",
      entity_table: "deployment_requests",
      entity_id: seed.deploymentRequestId,
      payload: {
        marker: seed.marker,
        seeded: true,
        linked_order_id: orderId,
        linked_shipment_id: seed.shipmentId
      }
    }],
    activity_logs: [{
      id: seed.activityId,
      actor_id: null,
      action: "operations.production_readiness_seed",
      entity_table: "deployment_requests",
      entity_id: seed.deploymentRequestId,
      severity: "info",
      metadata: {
        marker: seed.marker,
        seeded: true,
        rollback_safe: true,
        order_id: orderId,
        shipment_id: seed.shipmentId,
        tables: ["order_items", "shipments", "shipment_items", "shipment_timeline", "deployment_requests", "staff_tasks", "notifications"]
      },
      created_at: isoAt(12)
    }]
  };
}

export function summarizeSeedRows(rows) {
  return Object.fromEntries(
    Object.entries(rows).map(([table, tableRows]) => [table, tableRows.length])
  );
}

async function fetchFirst(supabase, table, query) {
  const { data, error } = await supabase.from(table).select(query).limit(1);
  if (error) throw new Error(`Failed to fetch ${table}: ${error.message}`);
  return data?.[0] ?? null;
}

async function fetchExistingCounts(supabase) {
  const tables = ["order_items", "shipments", "shipment_items", "shipment_timeline", "deployment_requests", "staff_tasks"];
  const counts = {};
  for (const table of tables) {
    const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
    if (error) throw new Error(`Failed to count ${table}: ${error.message}`);
    counts[table] = count ?? 0;
  }
  return counts;
}

async function applySeed(supabase, rows) {
  const order = rows.orders[0];
  const { data: orderUpsert, error: orderError } = await supabase
    .from("orders")
    .upsert(rows.orders, { onConflict: "id" })
    .select("id")
    .single();
  if (orderError) throw new Error(`orders upsert failed: ${orderError.message}`);
  if (orderUpsert.id !== order.id) throw new Error("orders upsert returned an unexpected id.");

  for (const table of [
    "order_items",
    "shipments",
    "shipment_items",
    "shipment_timeline",
    "deployment_requests",
    "staff_tasks",
    "notifications",
    "activity_logs"
  ]) {
    if (!rows[table].length) continue;
    const { error } = await supabase.from(table).upsert(rows[table], { onConflict: "id" });
    if (error) throw new Error(`${table} upsert failed: ${error.message}`);
  }

  for (const movement of rows.inventory_movements) {
    const { error } = await supabase
      .from("inventory_movements")
      .upsert(movement, { onConflict: "id" });
    if (error) throw new Error(`inventory_movements upsert failed: ${error.message}`);
  }
}

async function verifyApplied(supabase) {
  const checks = {
    orders: seed.orderId,
    order_items: seed.orderItemId,
    shipments: seed.shipmentId,
    shipment_items: seed.shipmentItemId,
    shipment_timeline: seed.shipmentTimelineId,
    deployment_requests: seed.deploymentRequestId,
    staff_tasks: seed.staffTaskId,
    notifications: seed.notificationId,
    activity_logs: seed.activityId
  };
  const verified = {};
  for (const [table, id] of Object.entries(checks)) {
    const { data, error } = await supabase.from(table).select("id").eq("id", id).limit(1);
    if (error) throw new Error(`Verification failed for ${table}: ${error.message}`);
    verified[table] = data?.length === 1;
  }
  return verified;
}

async function main() {
  loadEnvConfig(process.cwd());
  const options = parseCliArgs(process.argv.slice(2));
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const readKey = serviceRoleKey ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !readKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and a Supabase REST key are required for operational seed data.");
  }
  if (options.apply && !serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for --apply.");
  }

  const supabase = createClient(supabaseUrl, options.apply ? serviceRoleKey : readKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const [product, existingWarehouseStock, beforeCounts] = await Promise.all([
    fetchFirst(supabase, "mithron_products", "slug,name"),
    fetchFirst(supabase, "warehouse_stock", "id,warehouse_code,product_slug,sku,available_quantity"),
    fetchExistingCounts(supabase)
  ]);

  if (!product) {
    throw new Error(`Cannot seed operational readiness data because ${productSlug} is not present in mithron_products.`);
  }

  const rows = buildOperationalSeedRows({
    existingWarehouseStockId: existingWarehouseStock?.id ?? null
  });

  if (options.apply) {
    await applySeed(supabase, rows);
  }

  const result = {
    mode: options.apply ? "APPLIED" : "DRY_RUN",
    marker: seed.marker,
    seedOrderId: seed.orderId,
    usesExistingWarehouseStock: Boolean(existingWarehouseStock?.id),
    beforeCounts,
    plannedRows: summarizeSeedRows(rows),
    verification: options.apply ? await verifyApplied(supabase) : null,
    safety: {
      idempotent: true,
      destructiveCleanup: false,
      rollbackMarker: seed.marker
    }
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`[operational-seed] ${result.mode}`);
    console.log(JSON.stringify(result, null, 2));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
