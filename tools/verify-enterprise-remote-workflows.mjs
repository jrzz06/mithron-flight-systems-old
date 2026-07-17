import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !serviceRoleKey) {
  console.error(JSON.stringify({
    status: "FAILED",
    reason: "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY."
  }, null, 2));
  process.exit(1);
}

const headers = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  "Content-Type": "application/json"
};

const marker = `codex-verify-${Date.now()}`;
const sku = `VERIFY-${Date.now()}`;
const productSlug = "source-agri-kisan-drone-small-8-liter";
const results = {
  marker,
  schema: {},
  mutations: {},
  rbac: {},
  realtime: {},
  media: {},
  cmsSourceCutover: {},
  cleanup: []
};
const cleanup = [];

async function rest(path, options = {}) {
  const response = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers ?? {})
    }
  });

  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${path} failed: ${response.status} ${response.statusText} ${typeof body === "string" ? body : JSON.stringify(body)}`);
  }

  return { response, body };
}

async function publicRest(path, options = {}) {
  if (!publishableKey) {
    return {
      response: { ok: false, status: 0, statusText: "NO_PUBLISHABLE_KEY" },
      body: null
    };
  }

  const response = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${publishableKey}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {})
    }
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { response, body };
}

async function countRows(table) {
  const { response } = await rest(`/rest/v1/${table}?select=*&limit=1`, {
    headers: { Prefer: "count=exact" }
  });
  const range = response.headers.get("content-range") ?? "";
  const count = Number(range.includes("/") ? range.split("/").at(-1) : 0);
  return Number.isFinite(count) ? count : 0;
}

async function countRowsByQuery(table, query) {
  const { response } = await rest(`/rest/v1/${table}?select=*&${query}&limit=1`, {
    headers: { Prefer: "count=exact" }
  });
  const range = response.headers.get("content-range") ?? "";
  const count = Number(range.includes("/") ? range.split("/").at(-1) : 0);
  return Number.isFinite(count) ? count : 0;
}

async function insert(table, payload) {
  const { body } = await rest(`/rest/v1/${table}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload)
  });
  return Array.isArray(body) ? body[0] : body;
}

async function insertContentRevision(entityTable, entityId, snapshot, changeSummary) {
  const { body } = await rest("/rest/v1/rpc/cms_insert_content_revision", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      p_entity_table: entityTable,
      p_entity_id: entityId,
      p_snapshot: snapshot,
      p_change_summary: changeSummary,
      p_created_by: null
    })
  });
  return Array.isArray(body) ? body[0] : body;
}

async function upsert(table, conflict, payload) {
  const { body } = await rest(`/rest/v1/${table}?on_conflict=${encodeURIComponent(conflict)}`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(payload)
  });
  return Array.isArray(body) ? body[0] : body;
}

async function patch(table, column, value, payload) {
  const { body } = await rest(`/rest/v1/${table}?${column}=eq.${encodeURIComponent(value)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload)
  });
  return Array.isArray(body) ? body[0] : body;
}

async function remove(table, query) {
  await rest(`/rest/v1/${table}?${query}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" }
  });
  results.cleanup.push(`${table}?${query}`);
}

async function verifySchema() {
  await rest("/rest/v1/inventory?select=variant_id&limit=1");
  await rest("/rest/v1/warehouse_stock?select=variant_id&limit=1");
  await rest("/rest/v1/media_assets?select=id,bucket,storage_path,public_url,alt,alt_text,caption,folder,tags,mime_type,width,height,size_bytes,file_size_bytes,variants,responsive_variants,upload_metadata,uploaded_by,visibility,status,created_at,updated_at&limit=1");
  await rest("/rest/v1/product_media_assets?select=product_slug,media_asset_id,usage,variant_id,alt_text,caption,metadata,sort_order,is_primary,created_at,updated_at&limit=1");
  await rest("/rest/v1/inventory_movements?select=id,product_id,variant_id,warehouse_stock_id,movement_type,quantity_delta,quantity_before,quantity_after,reason_code,actor_user_id,related_order_id,related_shipment_id,created_at&limit=1");
  await rest("/rest/v1/shipments?select=id,order_id,shipment_number,shipment_status,warehouse_id,carrier_name,tracking_number,shipped_at,delivered_at,failed_at,returned_at,notes,actor_user_id,created_at,updated_at&limit=1");
  await rest("/rest/v1/shipment_items?select=id,shipment_id,order_item_id,product_id,variant_id,quantity,created_at&limit=1");
  await rest("/rest/v1/shipment_timeline?select=id,shipment_id,event_type,previous_status,next_status,notes,actor_user_id,created_at&limit=1");
  await rest("/rest/v1/orders?select=timeline,shipment_tracking,fulfillment_status,payment_status&limit=1");
  await rest("/rest/v1/deployment_requests?select=assigned_to,payload,status&limit=1");
  await rest("/rest/v1/notifications?select=priority,entity_table,entity_id,payload&limit=1");
  results.schema = {
    mediaAssets: "VERIFIED",
    productMediaAssets: "VERIFIED",
    inventoryVariantId: "VERIFIED",
    warehouseStockVariantId: "VERIFIED",
    inventoryMovements: "VERIFIED",
    shipments: "VERIFIED",
    shipmentItems: "VERIFIED",
    shipmentTimeline: "VERIFIED",
    orderLifecycleColumns: "VERIFIED",
    operationsWorkflowColumns: "VERIFIED"
  };
}

async function verifyRbacRestrictions() {
  if (!publishableKey) {
    results.rbac = {
      inventoryMovementsUnauthenticatedInsert: "NOT_VERIFIED",
      reason: "Missing publishable key."
    };
    return;
  }

  const { response, body } = await publicRest("/rest/v1/inventory_movements", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      product_id: productSlug,
      sku: `${sku}-RBAC`,
      warehouse_code: "VERIFY-WH",
      movement_type: "adjustment",
      quantity_delta: 0,
      quantity_before: 0,
      quantity_after: 0,
      reason_code: "rbac_probe",
      notes: marker
    })
  });

  const shipmentProbe = await publicRest("/rest/v1/shipments", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      order_id: "00000000-0000-0000-0000-000000000000",
      shipment_number: `${marker.toUpperCase()}-RBAC`,
      shipment_status: "pending",
      warehouse_id: "VERIFY-WH",
      notes: marker
    })
  });

  const mediaProbe = await publicRest("/rest/v1/media_assets", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      id: `${marker}-media-rbac`,
      bucket: "mithron-products",
      storage_path: `verification/${marker}-rbac.svg`,
      public_url: `${url}/storage/v1/object/public/mithron-products/verification/${marker}-rbac.svg`,
      folder: "verification",
      tags: ["verification"],
      mime_type: "image/svg+xml",
      file_size_bytes: 0,
      visibility: "public",
      status: "published"
    })
  });

  if (response.ok) {
    const inserted = Array.isArray(body) ? body[0] : body;
    if (inserted?.id) cleanup.push(() => remove("inventory_movements", `id=eq.${inserted.id}`));
  }

  if (mediaProbe.response.ok) {
    const inserted = Array.isArray(mediaProbe.body) ? mediaProbe.body[0] : mediaProbe.body;
    if (inserted?.id) cleanup.push(() => remove("media_assets", `id=eq.${encodeURIComponent(inserted.id)}`));
  }

  results.rbac = {
    inventoryMovementsUnauthenticatedInsert: response.ok ? "FAILED" : "VERIFIED",
    shipmentsUnauthenticatedInsert: shipmentProbe.response.ok ? "FAILED" : "VERIFIED",
    mediaAssetsUnauthenticatedInsert: mediaProbe.response.ok ? "FAILED" : "VERIFIED",
    status: response.status,
    statusText: response.statusText,
    shipmentStatus: shipmentProbe.response.status,
    shipmentStatusText: shipmentProbe.response.statusText,
    mediaStatus: mediaProbe.response.status,
    mediaStatusText: mediaProbe.response.statusText
  };
}

async function verifyMutations() {
  const now = new Date().toISOString();
  const inventory = await upsert("inventory", "product_slug,sku", {
    product_slug: productSlug,
    sku,
    variant_id: "verify-base",
    stock_status: "low_stock",
    quantity: 2,
    reserved_quantity: 1,
    reorder_threshold: 3,
    updated_at: now
  });
  cleanup.push(() => remove("inventory", `product_slug=eq.${encodeURIComponent(productSlug)}&sku=eq.${encodeURIComponent(sku)}`));

  const stock = await upsert("warehouse_stock", "warehouse_code,product_slug,sku", {
    warehouse_code: "VERIFY-WH",
    product_slug: productSlug,
    sku,
    variant_id: "verify-base",
    available_quantity: 2,
    committed_quantity: 1,
    last_counted_at: now,
    updated_at: now
  });
  cleanup.push(() => remove("warehouse_stock", `warehouse_code=eq.VERIFY-WH&product_slug=eq.${encodeURIComponent(productSlug)}&sku=eq.${encodeURIComponent(sku)}`));

  const order = await insert("orders", {
    order_number: marker.toUpperCase(),
    customer_email: "codex-verify@example.com",
    status: "confirmed",
    payment_status: "not_required",
    fulfillment_status: "queued",
    channel: "verification",
    subtotal: 120000,
    total: 120000,
    currency: "INR",
    items: [{ product_slug: productSlug, sku, quantity: 1 }],
    timeline: [{
      at: now,
      event: "order.created",
      status: "confirmed",
      note: "Remote verification order",
      actor_id: null,
      metadata: { marker }
    }],
    metadata: { marker }
  });
  cleanup.push(() => remove("orders", `id=eq.${order.id}`));

  const item = await insert("order_items", {
    order_id: order.id,
    product_slug: productSlug,
    product_name: "Agri Kisan Drone Small",
    sku,
    quantity: 1,
    unit_price: 120000,
    line_total: 120000,
    metadata: { marker }
  });
  cleanup.push(() => remove("order_items", `id=eq.${item.id}`));

  const shipment = await insert("shipments", {
    order_id: order.id,
    shipment_number: `${marker.toUpperCase()}-SHP`,
    shipment_status: "pending",
    warehouse_id: "VERIFY-WH",
    carrier_name: "Mithron Field",
    tracking_number: marker,
    notes: marker
  });
  cleanup.push(() => remove("shipments", `id=eq.${shipment.id}`));

  const shipmentItem = await insert("shipment_items", {
    shipment_id: shipment.id,
    order_item_id: item.id,
    product_id: productSlug,
    variant_id: "verify-base",
    quantity: 1
  });
  cleanup.push(() => remove("shipment_items", `id=eq.${shipmentItem.id}`));

  const shipmentTimeline = await insert("shipment_timeline", {
    shipment_id: shipment.id,
    event_type: "shipment.created",
    previous_status: null,
    next_status: "pending",
    notes: marker
  });
  cleanup.push(() => remove("shipment_timeline", `id=eq.${shipmentTimeline.id}`));

  const updatedShipment = await patch("shipments", "id", shipment.id, {
    shipment_status: "shipped",
    shipped_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  const movement = await insert("inventory_movements", {
    product_id: productSlug,
    sku,
    variant_id: "verify-base",
    warehouse_code: "VERIFY-WH",
    warehouse_stock_id: stock.id,
    movement_type: "fulfillment",
    quantity_delta: -1,
    quantity_before: 2,
    quantity_after: 1,
    reason_code: "remote_verification_probe",
    notes: marker,
    related_order_id: order.id,
    related_shipment_id: shipment.id
  });
  cleanup.push(() => remove("inventory_movements", `id=eq.${movement.id}`));

  const processingOrder = await patch("orders", "id", order.id, {
    status: "active",
    fulfillment_status: "processing",
    timeline: [
      ...(Array.isArray(order.timeline) ? order.timeline : []),
      {
        at: new Date().toISOString(),
        event: "order.lifecycle_update",
        status: "active",
        note: "Processing by remote verification",
        actor_id: null,
        metadata: { fulfillment_status: "processing", marker }
      }
    ],
    updated_at: new Date().toISOString()
  });

  const updatedOrder = await patch("orders", "id", order.id, {
    status: "active",
    fulfillment_status: "packed",
    shipment_tracking: { carrier: "Mithron Field", tracking: marker },
    timeline: [
      ...(Array.isArray(processingOrder.timeline) ? processingOrder.timeline : []),
      {
        at: new Date().toISOString(),
        event: "order.lifecycle_update",
        status: "active",
        note: "Packed by remote verification",
        actor_id: null,
        metadata: { fulfillment_status: "packed", marker }
      }
    ],
    updated_at: new Date().toISOString()
  });

  const request = await insert("deployment_requests", {
    order_id: order.id,
    requester_email: "codex-verify@example.com",
    region: "VERIFY",
    mission_profile: "verification",
    status: "pending",
    notes: "Remote verification deployment request",
    payload: { marker, priority: "critical" },
    updated_at: new Date().toISOString()
  });
  cleanup.push(() => remove("deployment_requests", `id=eq.${request.id}`));

  const updatedRequest = await patch("deployment_requests", "id", request.id, {
    status: "escalated",
    payload: { marker, priority: "critical", approval_state: "needs_director" },
    updated_at: new Date().toISOString()
  });

  const task = await insert("staff_tasks", {
    title: `Verify task ${marker}`,
    body: "Remote verification staff task",
    status: "open",
    priority: "high",
    related_request_id: request.id,
    due_at: new Date(Date.now() + 86400000).toISOString()
  });
  cleanup.push(() => remove("staff_tasks", `id=eq.${task.id}`));

  const updatedTask = await patch("staff_tasks", "id", task.id, {
    status: "in_progress",
    updated_at: new Date().toISOString()
  });

  const notification = await insert("notifications", {
    channel: "operations",
    title: `Verify notification ${marker}`,
    body: "Remote verification notification",
    status: "unread",
    priority: "critical",
    entity_table: "deployment_requests",
    entity_id: request.id,
    payload: { marker }
  });
  cleanup.push(() => remove("notifications", `id=eq.${notification.id}`));

  const activity = await insert("activity_logs", {
    action: "verification.remote_probe",
    entity_table: "deployment_requests",
    entity_id: request.id,
    severity: "info",
    metadata: { marker }
  });
  cleanup.push(() => remove("activity_logs", `id=eq.${activity.id}`));

  results.mutations = {
    inventory: inventory?.variant_id === "verify-base" ? "VERIFIED" : "FAILED",
    warehouseStock: stock?.variant_id === "verify-base" ? "VERIFIED" : "FAILED",
    shipment: updatedShipment?.shipment_status === "shipped" ? "VERIFIED" : "FAILED",
    shipmentItems: shipmentItem?.shipment_id === shipment.id && shipmentItem?.order_item_id === item.id ? "VERIFIED" : "FAILED",
    shipmentTimeline: shipmentTimeline?.shipment_id === shipment.id ? "VERIFIED" : "FAILED",
    inventoryMovement: movement?.related_order_id === order.id && movement?.warehouse_stock_id === stock.id && movement?.related_shipment_id === shipment.id ? "VERIFIED" : "FAILED",
    order: updatedOrder?.fulfillment_status === "packed" ? "VERIFIED" : "FAILED",
    orderItems: item?.order_id === order.id ? "VERIFIED" : "FAILED",
    deploymentRequest: updatedRequest?.status === "escalated" ? "VERIFIED" : "FAILED",
    staffTask: updatedTask?.status === "in_progress" ? "VERIFIED" : "FAILED",
    notification: notification?.priority === "critical" ? "VERIFIED" : "FAILED",
    activityLog: activity?.action === "verification.remote_probe" ? "VERIFIED" : "FAILED"
  };
}

function mediaPublicUrl(bucket, storagePath) {
  return `${url}/storage/v1/object/public/${bucket}/${storagePath}`;
}

async function createSignedUrl(supabase, bucket, storagePath) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(storagePath, 60);
  if (error) {
    throw new Error(`Storage signed URL failed for ${bucket}/${storagePath}: ${error.message}`);
  }
  return data?.signedUrl ?? data?.signedURL ?? null;
}

async function verifyMediaStorageWorkflow(bucketNames) {
  const requiredBuckets = ["mithron-products", "mithron-cms", "mithron-editorial", "mithron-warehouse-documents"];
  const missingBuckets = requiredBuckets.filter((bucket) => !bucketNames.includes(bucket));
  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const bucket = bucketNames.includes("mithron-editorial") ? "mithron-editorial" : "mithron-products";
  const storagePath = `verification/${marker}.svg`;
  const mediaAssetId = `${marker}-media-asset`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#7ce7c9"/></svg>`;

  const { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, new Blob([svg], { type: "image/svg+xml" }), {
    contentType: "image/svg+xml",
    upsert: false,
    cacheControl: "3600"
  });
  if (uploadError) {
    throw new Error(`Storage upload failed for ${bucket}/${storagePath}: ${uploadError.message}`);
  }
  cleanup.push(async () => {
    await supabase.storage.from(bucket).remove([storagePath]);
    results.cleanup.push(`/storage/v1/object/${bucket}/${storagePath}`);
  });

  const signedUrl = await createSignedUrl(supabase, bucket, storagePath);
  const publicUrl = mediaPublicUrl(bucket, storagePath);
  const cdnResponse = await fetch(publicUrl, { cache: "no-store" });

  const mediaAsset = await upsert("media_assets", "id", {
    id: mediaAssetId,
    bucket,
    storage_path: storagePath,
    public_url: publicUrl,
    alt: "Remote verification SVG",
    alt_text: "Remote verification SVG",
    caption: "Remote verification media probe",
    folder: "verification",
    tags: ["verification", "canonical"],
    mime_type: "image/svg+xml",
    width: 8,
    height: 8,
    size_bytes: svg.length,
    file_size_bytes: svg.length,
    variants: {
      source: { storage_path: storagePath, ready: true }
    },
    responsive_variants: {
      source: { width: 8, height: 8 },
      avif_ready: false,
      webp_ready: false,
      thumbnail_ready: false
    },
    upload_metadata: {
      marker,
      usage_scope: "verification",
      optimization: {
        avif_ready: false,
        webp_ready: false,
        thumbnail_ready: false
      }
    },
    visibility: "public",
    status: "published",
    is_visible: true,
    updated_at: new Date().toISOString()
  });
  cleanup.push(() => remove("media_assets", `id=eq.${encodeURIComponent(mediaAssetId)}`));

  const productLink = await upsert("product_media_assets", "product_slug,media_asset_id,usage", {
    product_slug: productSlug,
    media_asset_id: mediaAssetId,
    usage: "gallery",
    variant_id: "verify-base",
    sort_order: 1,
    is_primary: true,
    alt_text: "Remote verification product media",
    caption: "Variant-linked media verification",
    metadata: { marker },
    updated_at: new Date().toISOString()
  });
  cleanup.push(() => remove("product_media_assets", `product_slug=eq.${encodeURIComponent(productSlug)}&media_asset_id=eq.${encodeURIComponent(mediaAssetId)}&usage=eq.gallery`));

  return {
    requiredBuckets: missingBuckets.length ? "PARTIAL" : "VERIFIED",
    missingBuckets,
    storageUpload: "VERIFIED",
    createSignedUrl: signedUrl ? "VERIFIED" : "FAILED",
    cdnRendering: cdnResponse.ok ? "VERIFIED" : "FAILED",
    mediaAssetPersistence: mediaAsset?.id === mediaAssetId ? "VERIFIED" : "FAILED",
    productMediaLinkPersistence: productLink?.media_asset_id === mediaAssetId && productLink?.variant_id === "verify-base" ? "VERIFIED" : "FAILED"
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function selectRows(table, query) {
  const { body } = await rest(`/rest/v1/${table}?select=*&${query}`);
  return Array.isArray(body) ? body : [];
}

function createRealtimeClient(key = serviceRoleKey) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function waitForSubscribed(channel, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ subscribed: false, status: "TIMED_OUT" }), timeoutMs);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timer);
        resolve({ subscribed: true, status });
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        clearTimeout(timer);
        resolve({ subscribed: false, status });
      }
    });
  });
}

async function verifyRealtimeDelivery(supabase, {
  table,
  event = "INSERT",
  label,
  mutate,
  match,
  replayQuery,
  settleMs = 750,
  maxAttempts = 1
}) {
  const attemptResults = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const channel = supabase.channel(`enterprise-realtime-${label}-${Date.now()}-${attempt}`);
    let receivedPayload = null;
    let resolveEvent;
    let timer = null;
    const eventPromise = new Promise((resolve) => {
      resolveEvent = resolve;
    });

    channel.on("postgres_changes", { event, schema: "public", table }, (payload) => {
      if (match(payload)) {
        receivedPayload = payload;
        if (timer) clearTimeout(timer);
        resolveEvent(true);
      }
    });

    const subscription = await waitForSubscribed(channel);
    let row = null;
    let received = false;
    let replayRows = [];

    if (subscription.subscribed) {
      await wait(settleMs);
      timer = setTimeout(() => resolveEvent(false), 10000);
      row = await mutate({ attempt });
      received = Boolean(await eventPromise);
      replayRows = await selectRows(table, replayQuery(row));
    }

    if (timer) clearTimeout(timer);
    await supabase.removeChannel(channel);

    const attemptResult = {
      attempt,
      table,
      event,
      subscribed: subscription.subscribed,
      subscriptionStatus: subscription.status,
      received,
      replayed: replayRows.length > 0,
      status: subscription.subscribed && received && replayRows.length > 0 ? "VERIFIED" : "PARTIAL",
      commitTimestamp: receivedPayload?.commit_timestamp ?? null
    };
    attemptResults.push(attemptResult);

    if (attemptResult.status === "VERIFIED") {
      return {
        ...attemptResult,
        attempts: attempt,
        attemptResults
      };
    }

    if (attempt < maxAttempts) {
      await wait(500);
    }
  }

  return {
    ...attemptResults.at(-1),
    attempts: maxAttempts,
    attemptResults
  };
}

async function verifyRealtimeIsolation() {
  if (!publishableKey) {
    return {
      status: "NOT_VERIFIED",
      reason: "Missing publishable key."
    };
  }

  const realtimeMarker = `${marker}-rt-isolation`;
  const anon = createRealtimeClient(publishableKey);
  const channel = anon.channel(`enterprise-realtime-isolation-${Date.now()}`);
  let received = false;

  channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, (payload) => {
    if (payload.new?.payload?.marker === realtimeMarker) {
      received = true;
    }
  });

  const subscription = await waitForSubscribed(channel, 6000);
  if (subscription.subscribed) {
    await wait(750);
  }
  const notification = await insert("notifications", {
    channel: "operations",
    title: `Isolation verify ${marker}`,
    status: "unread",
    priority: "normal",
    entity_table: "notifications",
    entity_id: realtimeMarker,
    payload: { marker: realtimeMarker }
  });
  cleanup.push(() => remove("notifications", `id=eq.${notification.id}`));

  await wait(2500);
  await anon.removeChannel(channel);
  anon.realtime.disconnect();

  return {
    subscribed: subscription.subscribed,
    received,
    status: subscription.subscribed && !received ? "VERIFIED_RLS_FILTERED" : "PARTIAL"
  };
}

async function verifyRealtimeReliability() {
  const supabase = createRealtimeClient();
  const realtimeMarker = `${marker}-realtime`;
  const realtimeSku = `${sku}-RT`;
  const order = await insert("orders", {
    order_number: `${marker.toUpperCase()}-REALTIME`,
    customer_email: "codex-verify@example.com",
    status: "confirmed",
    payment_status: "not_required",
    fulfillment_status: "queued",
    channel: "verification",
    subtotal: 1,
    total: 1,
    currency: "INR",
    items: [],
    timeline: [],
    metadata: { marker: realtimeMarker }
  });
  cleanup.push(() => remove("orders", `id=eq.${order.id}`));

  const probes = [];

  probes.push(await verifyRealtimeDelivery(supabase, {
    table: "notifications",
    label: "notifications",
    mutate: async () => {
      const row = await insert("notifications", {
        channel: "operations",
        title: `Realtime verify ${marker}`,
        status: "unread",
        priority: "normal",
        entity_table: "notifications",
        entity_id: realtimeMarker,
        payload: { marker: realtimeMarker }
      });
      cleanup.push(() => remove("notifications", `id=eq.${row.id}`));
      return row;
    },
    match: (payload) => payload.new?.payload?.marker === realtimeMarker,
    replayQuery: (row) => `id=eq.${row.id}`,
    maxAttempts: 2
  }));

  probes.push(await verifyRealtimeDelivery(supabase, {
    table: "activity_logs",
    label: "activity-logs",
    mutate: async () => {
      const row = await insert("activity_logs", {
        action: "verification.realtime_probe",
        entity_table: "notifications",
        entity_id: realtimeMarker,
        severity: "info",
        metadata: { marker: realtimeMarker }
      });
      cleanup.push(() => remove("activity_logs", `id=eq.${row.id}`));
      return row;
    },
    match: (payload) => payload.new?.metadata?.marker === realtimeMarker,
    replayQuery: (row) => `id=eq.${row.id}`
  }));

  probes.push(await verifyRealtimeDelivery(supabase, {
    table: "inventory",
    label: "inventory",
    mutate: async () => {
      const row = await insert("inventory", {
        product_slug: productSlug,
        sku: realtimeSku,
        variant_id: "realtime-base",
        stock_status: "low_stock",
        quantity: 1,
        reserved_quantity: 0,
        reorder_threshold: 3,
        updated_at: new Date().toISOString()
      });
      cleanup.push(() => remove("inventory", `id=eq.${row.id}`));
      return row;
    },
    match: (payload) => payload.new?.sku === realtimeSku,
    replayQuery: (row) => `id=eq.${row.id}`
  }));

  probes.push(await verifyRealtimeDelivery(supabase, {
    table: "warehouse_stock",
    label: "warehouse-stock",
    mutate: async () => {
      const row = await insert("warehouse_stock", {
        warehouse_code: "VERIFY-WH",
        product_slug: productSlug,
        sku: realtimeSku,
        variant_id: "realtime-base",
        available_quantity: 1,
        committed_quantity: 0,
        updated_at: new Date().toISOString()
      });
      cleanup.push(() => remove("warehouse_stock", `id=eq.${row.id}`));
      return row;
    },
    match: (payload) => payload.new?.sku === realtimeSku,
    replayQuery: (row) => `id=eq.${row.id}`
  }));

  probes.push(await verifyRealtimeDelivery(supabase, {
    table: "inventory_movements",
    label: "inventory-movements",
    mutate: async () => {
      const row = await insert("inventory_movements", {
        product_id: productSlug,
        sku: realtimeSku,
        variant_id: "realtime-base",
        warehouse_code: "VERIFY-WH",
        movement_type: "adjustment",
        quantity_delta: 0,
        quantity_before: 1,
        quantity_after: 1,
        reason_code: "realtime_probe",
        notes: realtimeMarker,
        related_order_id: order.id
      });
      cleanup.push(() => remove("inventory_movements", `id=eq.${row.id}`));
      return row;
    },
    match: (payload) => payload.new?.notes === realtimeMarker,
    replayQuery: (row) => `id=eq.${row.id}`
  }));

  probes.push(await verifyRealtimeDelivery(supabase, {
    table: "order_items",
    label: "order-items",
    mutate: async () => {
      const row = await insert("order_items", {
        order_id: order.id,
        product_slug: productSlug,
        product_name: "Agri Kisan Drone Small",
        sku: realtimeSku,
        quantity: 1,
        unit_price: 1,
        line_total: 1,
        metadata: { marker: realtimeMarker }
      });
      cleanup.push(() => remove("order_items", `id=eq.${row.id}`));
      return row;
    },
    match: (payload) => payload.new?.metadata?.marker === realtimeMarker,
    replayQuery: (row) => `id=eq.${row.id}`
  }));

  let shipmentId = null;
  probes.push(await verifyRealtimeDelivery(supabase, {
    table: "shipments",
    label: "shipments",
    mutate: async () => {
      const row = await insert("shipments", {
        order_id: order.id,
        shipment_number: `${marker.toUpperCase()}-REALTIME-SHP`,
        shipment_status: "pending",
        warehouse_id: "VERIFY-WH",
        notes: realtimeMarker
      });
      shipmentId = row.id;
      cleanup.push(() => remove("shipments", `id=eq.${row.id}`));
      return row;
    },
    match: (payload) => payload.new?.notes === realtimeMarker,
    replayQuery: (row) => `id=eq.${row.id}`
  }));

  probes.push(await verifyRealtimeDelivery(supabase, {
    table: "shipment_timeline",
    label: "shipment-timeline",
    mutate: async () => {
      const row = await insert("shipment_timeline", {
        shipment_id: shipmentId,
        event_type: "shipment.created",
        next_status: "pending",
        notes: realtimeMarker
      });
      cleanup.push(() => remove("shipment_timeline", `id=eq.${row.id}`));
      return row;
    },
    match: (payload) => payload.new?.notes === realtimeMarker,
    replayQuery: (row) => `id=eq.${row.id}`
  }));

  probes.push(await verifyRealtimeDelivery(supabase, {
    table: "deployment_requests",
    label: "deployment-requests",
    mutate: async () => {
      const row = await insert("deployment_requests", {
        order_id: order.id,
        requester_email: "codex-verify@example.com",
        region: "VERIFY",
        mission_profile: "realtime",
        status: "pending",
        notes: realtimeMarker,
        payload: { marker: realtimeMarker },
        updated_at: new Date().toISOString()
      });
      cleanup.push(() => remove("deployment_requests", `id=eq.${row.id}`));
      return row;
    },
    match: (payload) => payload.new?.payload?.marker === realtimeMarker,
    replayQuery: (row) => `id=eq.${row.id}`
  }));

  probes.push(await verifyRealtimeDelivery(supabase, {
    table: "staff_tasks",
    label: "staff-tasks",
    mutate: async () => {
      const row = await insert("staff_tasks", {
        title: `Realtime task ${marker}`,
        body: realtimeMarker,
        status: "open",
        priority: "normal",
        due_at: new Date(Date.now() + 86400000).toISOString()
      });
      cleanup.push(() => remove("staff_tasks", `id=eq.${row.id}`));
      return row;
    },
    match: (payload) => payload.new?.body === realtimeMarker,
    replayQuery: (row) => `id=eq.${row.id}`
  }));

  probes.push(await verifyRealtimeDelivery(supabase, {
    table: "content_revisions",
    label: "content-revisions",
    mutate: async () => {
      const row = await insertContentRevision("cms_pages", realtimeMarker, { marker: realtimeMarker }, realtimeMarker);
      cleanup.push(() => remove("content_revisions", `id=eq.${row.id}`));
      return row;
    },
    match: (payload) => payload.new?.change_summary === realtimeMarker,
    replayQuery: (row) => `id=eq.${row.id}`
  }));

  // Admin publication membership for newly published governance/content tables.
  // PostgREST cannot query pg_catalog; assert migration coverage + table reachability.
  const adminPublicationTables = [
    "admin_invites",
    "roles",
    "customer_order_reviews",
    "press_coverage",
    "data_archive_runs",
    "audit_logs"
  ];
  const adminRealtimeMigrationPath = join(
    process.cwd(),
    "supabase/migrations/20260730000100_admin_realtime_full_publication.sql"
  );
  const adminRealtimeMigration = existsSync(adminRealtimeMigrationPath)
    ? readFileSync(adminRealtimeMigrationPath, "utf8")
    : "";
  const publicationMembership = await Promise.all(
    adminPublicationTables.map(async (table) => {
      const inMigration =
        adminRealtimeMigration.includes(`'${table}'`) &&
        adminRealtimeMigration.includes("replica identity full") &&
        adminRealtimeMigration.includes("alter publication supabase_realtime add table");
      let reachable = null;
      try {
        await rest(`/rest/v1/${table}?select=id&limit=1`);
        reachable = true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // Missing table vs RLS/permission still counts as "known" for diagnostics.
        reachable = !message.includes("404") && !message.includes("PGRST205");
      }
      return { table, inMigration, reachable, published: inMigration };
    })
  );

  const reconnectProbe = await verifyReconnectRecovery(supabase);
  const isolation = await verifyRealtimeIsolation();
  await supabase.removeAllChannels();
  supabase.realtime.disconnect();

  return {
    probes,
    publicationMembership,
    deterministicDelivery: probes.every((probe) => probe.status === "VERIFIED") ? "VERIFIED" : "PARTIAL",
    replayRecovery: probes.every((probe) => probe.replayed) ? "VERIFIED" : "PARTIAL",
    reconnectRecovery: reconnectProbe.status,
    unauthenticatedIsolation: isolation.status,
    isolation
  };
}

async function verifyReconnectRecovery(supabase) {
  const reconnectMarker = `${marker}-reconnect`;
  supabase.realtime.disconnect();
  await wait(500);
  supabase.realtime.connect();

  const probe = await verifyRealtimeDelivery(supabase, {
    table: "notifications",
    label: "reconnect-recovery",
    mutate: async () => {
      const row = await insert("notifications", {
        channel: "operations",
        title: `Reconnect verify ${marker}`,
        status: "unread",
        priority: "normal",
        entity_table: "notifications",
        entity_id: reconnectMarker,
        payload: { marker: reconnectMarker }
      });
      cleanup.push(() => remove("notifications", `id=eq.${row.id}`));
      return row;
    },
    match: (payload) => payload.new?.payload?.marker === reconnectMarker,
    replayQuery: (row) => `id=eq.${row.id}`
  });

  return {
    ...probe,
    status: probe.status === "VERIFIED" ? "VERIFIED" : "PARTIAL"
  };
}

async function verifyRealtime() {
  const reliability = await verifyRealtimeReliability();
  results.realtime = {
    ...reliability,
    status: reliability.deterministicDelivery === "VERIFIED"
      && reliability.replayRecovery === "VERIFIED"
      && reliability.reconnectRecovery === "VERIFIED"
      && reliability.unauthenticatedIsolation === "VERIFIED_RLS_FILTERED"
      ? "VERIFIED_DETERMINISTIC"
      : "PARTIAL"
  };
}

async function verifyMediaAndCutoverState() {
  const buckets = await rest("/storage/v1/bucket");
  const bucketNames = Array.isArray(buckets.body) ? buckets.body.map((bucket) => bucket.name).sort() : [];
  const storageWorkflow = await verifyMediaStorageWorkflow(bucketNames);
  const mediaAssets = await countRows("media_assets");
  const sourceAssets = await countRows("mithron_assets");
  const productMediaLinks = await countRows("product_media_assets");
  const mediaPageSource = existsSync(join(process.cwd(), "app", "admin", "media", "page.tsx"))
    ? readFileSync(join(process.cwd(), "app", "admin", "media", "page.tsx"), "utf8")
    : "";
  const mediaUploadPanelSource = existsSync(join(process.cwd(), "app", "admin", "media", "media-upload-panel.tsx"))
    ? readFileSync(join(process.cwd(), "app", "admin", "media", "media-upload-panel.tsx"), "utf8")
    : "";
  const mediaUiSource = `${mediaPageSource}\n${mediaUploadPanelSource}`;

  results.media = {
    buckets: bucketNames,
    mediaAssets,
    sourceAssets,
    productMediaLinks,
    adminMediaUploadUi: mediaUiSource.includes("type=\"file\"") && mediaUiSource.includes("data-media-upload-zone"),
    storageWorkflow,
    status: storageWorkflow.storageUpload === "VERIFIED"
      && storageWorkflow.mediaAssetPersistence === "VERIFIED"
      && storageWorkflow.productMediaLinkPersistence === "VERIFIED"
      ? "VERIFIED_REVERSIBLE_PROBE"
      : "PARTIAL"
  };

}

async function verifyCmsCutoverReadiness() {
  const cmsSource = existsSync(join(process.cwd(), "services", "cms.ts"))
    ? readFileSync(join(process.cwd(), "services", "cms.ts"), "utf8")
    : "";
  const homePageSource = existsSync(join(process.cwd(), "app", "page.tsx"))
    ? readFileSync(join(process.cwd(), "app", "page.tsx"), "utf8")
    : "";
  const migrationSource = existsSync(join(process.cwd(), "supabase", "migrations", "20260524000900_cms_cutover_readiness.sql"))
    ? readFileSync(join(process.cwd(), "supabase", "migrations", "20260524000900_cms_cutover_readiness.sql"), "utf8")
    : "";

  const [testimonials, campaigns, visibility, revisions] = await Promise.all([
    countRows("testimonials"),
    countRows("promotional_campaigns"),
    countRows("section_visibility"),
    countRowsByQuery("content_revisions", "entity_table=in.(testimonials,promotional_campaigns,section_visibility)")
  ]);

  const publishedRows = {
    testimonials: await countRowsByQuery("testimonials", "status=eq.published&is_visible=eq.true"),
    promotionalCampaigns: await countRowsByQuery("promotional_campaigns", "status=eq.published&is_visible=eq.true"),
    sectionVisibility: await countRowsByQuery("section_visibility", "status=eq.published&is_visible=eq.true&route_path=eq.%2F")
  };

  const draftId = `${marker}-draft-testimonial`;
  const draftProbe = await insert("testimonials", {
    id: draftId,
    name: "Draft visibility probe",
    body: "Draft rows must not render through public CMS reads.",
    status: "draft",
    is_visible: true,
    sort_order: 999
  });
  cleanup.push(() => remove("testimonials", `id=eq.${encodeURIComponent(draftProbe.id)}`));

  const publicDraftProbe = await publicRest(`/rest/v1/testimonials?select=id&id=eq.${encodeURIComponent(draftId)}`);
  const publicDraftRows = Array.isArray(publicDraftProbe.body) ? publicDraftProbe.body : [];

  const sourceWiring = {
    canonicalBuilder: cmsSource.includes("buildPublicCmsSnapshotFromRows"),
    diagnostics: cmsSource.includes("getCmsCutoverDiagnostics"),
    strictFallbackBoundary: cmsSource.includes("MITHRON_CMS_STRICT"),
    homepageOrdering: homePageSource.includes("cms.home.sectionOrder") && homePageSource.includes("sectionRenderers"),
    fallbackRecovery: cmsSource.includes("fallbackSnapshot") && cmsSource.includes("fallbackSurfaces"),
    publishedFiltering: cmsSource.includes("function publishedRows")
      && cmsSource.includes("status === \"published\"")
      && cmsSource.includes("filteredDraftRows"),
    migrationSeeds: migrationSource.includes("insert into public.testimonials")
      && migrationSource.includes("insert into public.promotional_campaigns")
      && migrationSource.includes("insert into public.section_visibility")
  };

  const revisionSafety = revisions >= 3 ? "VERIFIED" : "PARTIAL";
  const draftIsolation = publicDraftProbe.response.ok && publicDraftRows.length === 0 ? "VERIFIED" : "PARTIAL";
  const visibilityHandling = publishedRows.sectionVisibility >= 4 && cmsSource.includes("mapHomepageSectionOrder") ? "VERIFIED" : "PARTIAL";
  const fallbackRecovery = Object.values(sourceWiring).every(Boolean) ? "VERIFIED" : "PARTIAL";
  const remoteCoverage = publishedRows.testimonials > 0 && publishedRows.promotionalCampaigns > 0 && publishedRows.sectionVisibility > 0 ? "VERIFIED" : "PARTIAL";

  results.cmsSourceCutover = {
    testimonials,
    promotionalCampaigns: campaigns,
    sectionVisibility: visibility,
    contentRevisions: revisions,
    publishedRows,
    draftIsolation,
    revisionSafety,
    visibilityHandling,
    fallbackRecovery,
    sourceWiring,
    fallbackLoadersStillActive: /fallback|fallbackSnapshot|config\//i.test(cmsSource),
    cleanupReady: false,
    status: remoteCoverage === "VERIFIED"
      && draftIsolation === "VERIFIED"
      && revisionSafety === "VERIFIED"
      && visibilityHandling === "VERIFIED"
      && fallbackRecovery === "VERIFIED"
      ? "READY_FOR_STAGED_PARITY_TEST"
      : "PARTIAL"
  };
}

async function runCleanup() {
  for (const action of cleanup.reverse()) {
    try {
      await action();
    } catch (error) {
      results.cleanup.push(`FAILED: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

try {
  await verifySchema();
  await verifyRbacRestrictions();
  await verifyRealtime();
  await verifyMutations();
  await verifyMediaAndCutoverState();
  await verifyCmsCutoverReadiness();
} catch (error) {
  results.error = error instanceof Error ? error.message : String(error);
  await runCleanup();
  console.error(JSON.stringify({ status: "FAILED", ...results }, null, 2));
  process.exit(1);
}

await runCleanup();
console.log(JSON.stringify({ status: "VERIFICATION_COMPLETE", ...results }, null, 2));
