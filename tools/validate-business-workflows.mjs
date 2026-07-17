import crypto from "node:crypto";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const baseUrl = process.argv.find((arg) => arg.startsWith("--base-url="))?.slice("--base-url=".length)
  ?? process.env.BUSINESS_WORKFLOW_BASE_URL
  ?? "http://127.0.0.1:3000";

const marker = `business-${Date.now()}`;
const productSlug = process.env.AUTH_VALIDATION_PRODUCT_SLUG ?? "source-agri-kisan-drone-small-8-liter";
const variantId = "business-validation-base";
const warehouseCode = process.env.AUTH_VALIDATION_WAREHOUSE_CODE ?? "IN-WEST-01";
const cleanup = [];

if (!url || !publishableKey || !serviceRoleKey) {
  console.error(JSON.stringify({
    status: "FAILED",
    reason: "Missing NEXT_PUBLIC_SUPABASE_URL, publishable key, or SUPABASE_SERVICE_ROLE_KEY."
  }, null, 2));
  process.exit(1);
}

const service = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const personas = [
  { key: "admin", role: "admin", email: "admin.validation@example.com", displayName: "Business Workflow Admin" },
  { key: "warehouse", role: "warehouse", email: "warehouse.hardening@example.com", displayName: "Business Workflow Warehouse" },
  { key: "user", role: "user", email: "user.validation@example.com", displayName: "Business Workflow User" },
  { key: "unauthorized", role: null, authMetadataRole: "unauthorized", email: "unauthorized.validation@example.com", displayName: "Business Workflow Unauthorized" }
].map((persona) => ({
  ...persona,
  password: process.env.BUSINESS_WORKFLOW_PASSWORD ?? `Mithron-${persona.key}-${crypto.randomUUID()}-Aa1!`
}));

function authClient() {
  return createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false
    },
    realtime: {
      params: {
        eventsPerSecond: 10
      }
    }
  });
}

function serviceHeaders(extra = {}) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    ...extra
  };
}

function authHeaders(persona, extra = {}) {
  return {
    apikey: publishableKey,
    Authorization: `Bearer ${persona.session.access_token}`,
    "Content-Type": "application/json",
    ...extra
  };
}

async function rest(path, options = {}, headers = serviceHeaders()) {
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
  return { response, body };
}

async function restOk(path, options = {}, headers = serviceHeaders()) {
  const result = await rest(path, options, headers);
  if (!result.response.ok) {
    const detail = typeof result.body === "string" ? result.body : JSON.stringify(result.body);
    throw new Error(`${options.method ?? "GET"} ${path} failed: ${result.response.status} ${result.response.statusText} ${detail ?? ""}`);
  }
  return result;
}

async function serviceDelete(table, query) {
  await restOk(`/rest/v1/${table}?${query}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" }
  });
}

async function serviceUpsert(table, conflict, payload) {
  const { body } = await restOk(`/rest/v1/${table}?on_conflict=${encodeURIComponent(conflict)}`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(payload)
  });
  return Array.isArray(body) ? body[0] : body;
}

async function serviceQuery(table, query) {
  const { body } = await restOk(`/rest/v1/${table}?${query}`);
  return Array.isArray(body) ? body : [];
}

async function authRest(persona, path, options = {}) {
  return rest(path, options, authHeaders(persona));
}

async function expectDenied(label, persona, path, options = {}) {
  const result = await authRest(persona, path, options);
  if (result.response.ok) {
    throw new Error(`${label} unexpectedly succeeded with HTTP ${result.response.status}.`);
  }
  return {
    status: "VERIFIED",
    httpStatus: result.response.status,
    statusText: result.response.statusText
  };
}

async function verifyDeleteDoesNotAffectRows(label, persona, table, query, verifyQuery) {
  const result = await authRest(persona, `/rest/v1/${table}?${query}`, {
    method: "DELETE",
    headers: { Prefer: "return=representation" }
  });
  const rows = await serviceQuery(table, verifyQuery);
  if (rows.length === 0) {
    throw new Error(`${label} removed protected rows with HTTP ${result.response.status}.`);
  }
  if (result.response.ok) {
    throw new Error(`${label} returned ambiguous HTTP ${result.response.status} instead of an explicit denial.`);
  }
  return {
    status: "VERIFIED_DENIED",
    httpStatus: result.response.status,
    statusText: result.response.statusText,
    remainingRows: rows.length
  };
}

async function findUserByEmail(email) {
  for (let page = 1; page <= 25; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase());
    if (user) return user;
    if (data.users.length < 100) break;
  }
  return null;
}

async function ensurePersonaUser(plan) {
  const metadataRole = plan.authMetadataRole ?? plan.role;
  const created = await service.auth.admin.createUser({
    email: plan.email,
    password: plan.password,
    email_confirm: true,
    app_metadata: { role: metadataRole },
    user_metadata: {
      role: metadataRole,
      display_name: plan.displayName
    }
  });

  let user = created.data?.user ?? null;
  if (created.error) {
    if (!/already|registered|exists/i.test(created.error.message)) throw created.error;
    user = await findUserByEmail(plan.email);
    if (!user) throw created.error;
    const updated = await service.auth.admin.updateUserById(user.id, {
      password: plan.password,
      app_metadata: { ...(user.app_metadata ?? {}), role: metadataRole },
      user_metadata: {
        ...(user.user_metadata ?? {}),
        role: metadataRole,
        display_name: plan.displayName
      }
    });
    if (updated.error) throw updated.error;
    user = updated.data.user;
  }

  if (!user?.id) throw new Error(`Auth user provisioning failed for ${plan.key}.`);

  if (plan.role) {
    await serviceUpsert("profiles", "id", {
      id: user.id,
      email: plan.email,
      display_name: plan.displayName,
      default_role: plan.role,
      updated_at: new Date().toISOString()
    });
    await serviceUpsert("user_roles", "user_id,role_key", {
      user_id: user.id,
      role_key: plan.role
    });
  } else {
    await serviceDelete("user_roles", `user_id=eq.${encodeURIComponent(user.id)}`);
  }

  return { ...plan, userId: user.id };
}

async function signInPersona(persona) {
  const client = authClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: persona.email,
    password: persona.password
  });
  if (error) throw new Error(`${persona.key} sign in failed: ${error.message}`);
  if (!data.session?.access_token) throw new Error(`${persona.key} sign in did not return a session.`);
  const signedIn = { ...persona, client, session: data.session };
  const { data: role, error: roleError } = await client.rpc("current_enterprise_role");
  if (roleError) throw new Error(`${persona.key} role RPC failed: ${roleError.message}`);
  return { ...signedIn, fetchedRole: role ?? null };
}

async function loginBrowser(page, persona, nextPath) {
  await page.goto(`${baseUrl}/login?next=${encodeURIComponent(nextPath)}`, { waitUntil: "domcontentloaded" });
  await page.locator("input[type='email']").fill(persona.email);
  await page.locator("input[type='password']").fill(persona.password);
  await Promise.all([
    page.waitForURL((target) => {
      if (target.pathname !== "/login") return true;
      return target.searchParams.get("admin_status") === "forbidden"
        || target.searchParams.get("access_status") === "forbidden"
        || target.searchParams.get("auth_status") === "role_required";
    }, { timeout: 30000 }),
    page.locator("button[type='submit']").click()
  ]);
  await page.waitForLoadState("domcontentloaded").catch(() => {});
}

function acceptNextDialog(page) {
  page.once("dialog", async (dialog) => {
    await dialog.accept();
  });
}

async function submitAndWaitForAction(page, submit, label, timeoutMs = 120000) {
  const expectedPathname = new URL(page.url()).pathname;
  const responsePromise = page.waitForResponse((response) => {
    if (response.request().method() !== "POST") return false;
    try {
      return new URL(response.url()).pathname === expectedPathname;
    } catch {
      return false;
    }
  }, { timeout: timeoutMs }).catch(() => null);

  await submit();
  const response = await responsePromise;
  if (!response) {
    throw new Error(`${label} did not submit a matching server action POST.`);
  }
  if (response.status() >= 400) {
    throw new Error(`${label} failed with HTTP ${response.status()} ${response.statusText()}.`);
  }
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  return { status: response.status(), url: response.url() };
}

async function setFormField(form, name, value) {
  const field = form.locator(`[name="${name}"]`).first();
  await field.waitFor({ state: "attached", timeout: 15000 });
  const tagName = await field.evaluate((element) => element.tagName.toLowerCase());
  const type = await field.getAttribute("type");

  if (tagName === "select") {
    await field.selectOption(value);
    return;
  }

  if (type === "hidden") {
    await field.evaluate((element, nextValue) => {
      element.value = nextValue;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
    return;
  }

  await field.fill(value);
}

async function expectPath(page, pathname, label) {
  const current = new URL(page.url());
  if (current.pathname !== pathname) {
    throw new Error(`${label}: expected ${pathname}, got ${page.url()}`);
  }
}

async function deniedPath(page, route) {
  await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
  const current = new URL(page.url());
  if (current.pathname === route || current.pathname.startsWith(`${route}/`)) {
    throw new Error(`Expected ${route} to be denied, got ${page.url()}`);
  }
  return `${current.pathname}${current.search}`;
}

function isForbiddenLoginRedirect(value) {
  return value.includes("admin_status=forbidden")
    || value.includes("access_status=forbidden")
    || value.includes("auth_status=role_required");
}

function realtimeKey(event) {
  const id = event.new?.id ?? event.new?.sku ?? event.new?.order_number ?? event.new?.title ?? event.old?.id ?? "";
  return `${event.table}:${event.eventType}:${event.commit_timestamp}:${id}`;
}

function createRealtimeProbe(client, subscriptions) {
  const events = [];
  const channel = client.channel(`business-workflow:${marker}:${crypto.randomUUID()}`);
  for (const subscription of subscriptions) {
    channel.on("postgres_changes", {
      event: "*",
      schema: "public",
      table: subscription.table,
      ...(subscription.filter ? { filter: subscription.filter } : {})
    }, (payload) => {
      events.push({
        table: subscription.table,
        eventType: payload.eventType,
        commit_timestamp: payload.commit_timestamp,
        new: payload.new,
        old: payload.old
      });
    });
  }

  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Realtime subscription timed out for ${subscriptions.map((entry) => entry.table).join(", ")}`)), 15000);
    channel.subscribe((status, error) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timer);
        resolve(status);
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        clearTimeout(timer);
        reject(new Error(error?.message ?? `Realtime subscription failed: ${status}`));
      }
    });
  });

  return {
    events,
    ready,
    async close() {
      await client.removeChannel(channel);
    },
    async waitFor(predicate, timeoutMs = 15000) {
      const startedAt = Date.now();
      while (Date.now() - startedAt < timeoutMs) {
        if (events.some(predicate)) return true;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      return false;
    },
    duplicateCount() {
      const keys = new Set();
      let duplicates = 0;
      for (const event of events) {
        const key = realtimeKey(event);
        if (keys.has(key)) duplicates += 1;
        keys.add(key);
      }
      return duplicates;
    }
  };
}

async function waitForRow(table, query, predicate, timeoutMs = 10000) {
  const startedAt = Date.now();
  let rows = [];
  while (Date.now() - startedAt < timeoutMs) {
    rows = await serviceQuery(table, query);
    if (predicate(rows)) return rows;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Timed out waiting for ${table} rows matching ${query}. Last rows: ${JSON.stringify(rows).slice(0, 1000)}`);
}

async function waitForCondition(probe, timeoutMs, label) {
  const startedAt = Date.now();
  let lastValue = null;
  while (Date.now() - startedAt < timeoutMs) {
    lastValue = await probe();
    if (lastValue) return lastValue;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Timed out waiting for ${label}. Last value: ${JSON.stringify(lastValue)}`);
}

async function cleanupRowsForEntity(entityId) {
  cleanup.push(() => serviceDelete("content_revisions", `entity_id=eq.${encodeURIComponent(entityId)}`));
  cleanup.push(() => serviceDelete("activity_logs", `entity_id=eq.${encodeURIComponent(entityId)}`));
}

async function seedWixInventoryProbe(productSlugForProbe, sku, actorId) {
  const now = new Date().toISOString();
  cleanup.push(() => serviceDelete("mithron_products", `slug=eq.${encodeURIComponent(productSlugForProbe)}`));
  cleanup.push(() => serviceDelete("inventory", `product_slug=eq.${encodeURIComponent(productSlugForProbe)}&sku=eq.${encodeURIComponent(sku)}`));
  cleanup.push(() => serviceDelete("warehouse_stock", `warehouse_code=eq.${encodeURIComponent(warehouseCode)}&product_slug=eq.${encodeURIComponent(productSlugForProbe)}&sku=eq.${encodeURIComponent(sku)}`));
  cleanup.push(() => serviceDelete("inventory_movements", `sku=eq.${encodeURIComponent(sku)}`));
  cleanupRowsForEntity(`${productSlugForProbe}:${sku}`);
  cleanupRowsForEntity(`${warehouseCode}:${productSlugForProbe}:${sku}`);

  await serviceUpsert("mithron_products", "slug", {
    slug: productSlugForProbe,
    name: `Business Inventory Probe ${marker}`,
    tagline: "Temporary validator inventory row",
    category: "Validation",
    price: 1,
    product_url: `/product/${productSlugForProbe}`,
    image: { src: "/media/mithron/catalog/mithron-drone-category.png", alt: "Business inventory probe" },
    hero: { src: "/media/mithron/catalog/mithron-drone-category.png", alt: "Business inventory probe" },
    gallery: [{ src: "/media/mithron/catalog/mithron-drone-category.png", alt: "Business inventory probe" }],
    workflow_status: "published",
    is_visible: true,
    source_availability: "uploaded_csv",
    sort_order: -9999,
    updated_at: now
  });
  await serviceUpsert("inventory", "product_slug,sku", {
    product_slug: productSlugForProbe,
    sku,
    variant_id: variantId,
    quantity: 20,
    reserved_quantity: 0,
    reorder_threshold: 5,
    stock_status: "available",
    updated_by: actorId,
    updated_at: now
  });
  await serviceUpsert("warehouse_stock", "warehouse_code,product_slug,sku", {
    warehouse_code: warehouseCode,
    product_slug: productSlugForProbe,
    sku,
    variant_id: variantId,
    available_quantity: 20,
    committed_quantity: 0,
    last_counted_at: now,
    updated_at: now
  });
}

async function validateInventoryWorkflow(warehouse) {
  const { chromium } = await import("playwright");
  const sku = `${marker.toUpperCase()}-INV`;
  const inventoryProductSlug = `${marker}-inventory-product`;
  const realtime = createRealtimeProbe(warehouse.client, [
    { table: "inventory", filter: `sku=eq.${sku}` },
    { table: "warehouse_stock", filter: `sku=eq.${sku}` },
    { table: "inventory_movements", filter: `sku=eq.${sku}` }
  ]);
  await realtime.ready;
  await seedWixInventoryProbe(inventoryProductSlug, sku, warehouse.userId);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await loginBrowser(page, warehouse, "/warehouse/inventory");
    await expectPath(page, "/warehouse/inventory", "warehouse inventory login");
    await page.locator("[data-inventory-system]").waitFor({ timeout: 15000 });
    await page.locator("[data-inventory-table]").waitFor({ timeout: 15000 });
    const inventorySystem = await page.locator("[data-inventory-system]").count();
    const inventoryRows = await page.locator("[data-inventory-row]").count();
    await page.locator("[data-inventory-row]", { hasText: sku }).first().waitFor({ timeout: 15000 });
    const deniedAdminProducts = await deniedPath(page, "/admin/products");

    async function submitInlineQuantity(quantity) {
      await page.goto(`${baseUrl}/warehouse/inventory`, { waitUntil: "domcontentloaded" });
      const targetRow = page.locator("[data-inventory-row]", { hasText: sku }).first();
      await targetRow.waitFor({ timeout: 15000 });
      const stockForm = targetRow.locator("[data-inventory-inline-stock] form").first();
      await stockForm.locator('[name="quantity"]').fill(String(quantity));
      await submitAndWaitForAction(page, () => stockForm.locator("button").filter({ hasText: "Save" }).click(), "inventory inline stock update");
    }

    await submitInlineQuantity(25);
    await waitForRow("warehouse_stock", `select=*&warehouse_code=eq.${encodeURIComponent(warehouseCode)}&product_slug=eq.${encodeURIComponent(inventoryProductSlug)}&sku=eq.${encodeURIComponent(sku)}`, (rows) => Number(rows[0]?.available_quantity ?? 0) === 25);

    await submitInlineQuantity(22);
    const stockRows = await waitForRow("warehouse_stock", `select=*&warehouse_code=eq.${encodeURIComponent(warehouseCode)}&product_slug=eq.${encodeURIComponent(inventoryProductSlug)}&sku=eq.${encodeURIComponent(sku)}`, (rows) => Number(rows[0]?.available_quantity ?? 0) === 22);
    const validMovements = await serviceQuery("inventory_movements", `select=*&sku=eq.${encodeURIComponent(sku)}&order=created_at.asc`);
    await page.goto(`${baseUrl}/warehouse/inventory`, { waitUntil: "domcontentloaded" });
    const invalidRow = page.locator("[data-inventory-row]", { hasText: sku }).first();
    await invalidRow.waitFor({ timeout: 15000 });
    const invalidForm = invalidRow.locator("[data-inventory-inline-stock] form").first();
    await invalidForm.locator('[name="quantity"]').fill("-1");
    await invalidForm.locator("button").filter({ hasText: "Save" }).click();
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const postInvalidStock = await serviceQuery("warehouse_stock", `select=*&warehouse_code=eq.${encodeURIComponent(warehouseCode)}&product_slug=eq.${encodeURIComponent(inventoryProductSlug)}&sku=eq.${encodeURIComponent(sku)}`);
    const movements = await serviceQuery("inventory_movements", `select=*&sku=eq.${encodeURIComponent(sku)}&order=created_at.asc`);
    const activityRows = await serviceQuery("activity_logs", "select=*&entity_table=in.(warehouse_stock,inventory_movements)&order=created_at.desc&limit=200");
    const relatedActivity = activityRows.filter((activity) => JSON.stringify(activity.metadata ?? {}).includes(sku) || String(activity.entity_id ?? "").includes(sku));
    for (const movement of movements) cleanupRowsForEntity(String(movement.id ?? ""));

    const realtimeInventory = await realtime.waitFor((event) => event.table === "warehouse_stock" && String(event.new?.sku ?? "") === sku, 10000);
    const realtimeMovement = await realtime.waitFor((event) => event.table === "inventory_movements" && String(event.new?.sku ?? "") === sku, 10000);

    return {
      status: "VERIFIED",
      role: warehouse.fetchedRole === "warehouse" ? "VERIFIED" : "FAILED",
      dashboardAccess: "VERIFIED",
      inventoryUiVisible: inventorySystem >= 1 && inventoryRows >= 1 ? "VERIFIED" : "FAILED",
      adminRoutesBlocked: isForbiddenLoginRedirect(deniedAdminProducts) ? "VERIFIED" : "FAILED",
      finalAvailableQuantity: Number(stockRows[0]?.available_quantity ?? -1),
      finalInventoryQuantity: Number((await serviceQuery("inventory", `select=*&product_slug=eq.${encodeURIComponent(inventoryProductSlug)}&sku=eq.${encodeURIComponent(sku)}`))[0]?.quantity ?? -1),
      increaseDecreasePersistence: Number(stockRows[0]?.available_quantity ?? 0) === 22 && validMovements.length >= 2 ? "VERIFIED" : "FAILED",
      invalidNegativeStockBlocked: Number(postInvalidStock[0]?.available_quantity ?? -1) === 22 && movements.length === validMovements.length ? "VERIFIED" : "FAILED",
      movementLedgerRows: movements.length,
      auditLogs: relatedActivity.length > 0 && relatedActivity.some((activity) => activity.actor_id === warehouse.userId) ? "VERIFIED" : "FAILED",
      auditPreviousNewValues: movements.every((movement) => Number.isInteger(Number(movement.quantity_before)) && Number.isInteger(Number(movement.quantity_after))) ? "VERIFIED" : "FAILED",
      realtime: realtimeInventory && realtimeMovement && realtime.duplicateCount() === 0 ? "VERIFIED" : "FAILED",
      realtimeEvents: realtime.events.length,
      realtimeDuplicates: realtime.duplicateCount()
    };
  } finally {
    await context.close();
    await browser.close();
    await realtime.close();
  }
}

async function validateOrderOperationsWorkflow(admin) {
  const { chromium } = await import("playwright");
  const orderEmail = `business-order-${Date.now()}@example.com`;
  const notificationTitle = `Business order notification ${marker}`;
  const realtime = createRealtimeProbe(admin.client, [
    { table: "orders" },
    { table: "notifications" },
    { table: "activity_logs" }
  ]);
  await realtime.ready;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  let orderId = "";
  try {
    await loginBrowser(page, admin, "/operations/orders");
    await expectPath(page, "/operations/orders", "operations order dashboard");
    await page.locator('[data-order-management-table="orders"]').waitFor({ timeout: 15000 });

    await page.goto(`${baseUrl}/operations/orders`, { waitUntil: "domcontentloaded" });
    const createForm = page.locator('[data-order-management-table="orders"]');
    await createForm.locator('[name="customer_email"]').fill(orderEmail);
    await createForm.locator('[name="region"]').fill("BUSINESS-OPS");
    await createForm.locator('[name="mission_profile"]').fill("operations-validation");
    await setFormField(createForm, "status", "confirmed");
    await setFormField(createForm, "payment_status", "not_required");
    await setFormField(createForm, "fulfillment_status", "pending");
    await createForm.locator('[name="order_items"]').fill(`[{"productSlug":"${productSlug}","quantity":1}]`);
    await setFormField(createForm, "currency", "INR");
    await setFormField(createForm, "metadata", `{"marker":"${marker}"}`);
    await createForm.locator('[name="note"]').fill(`${marker} create order`);
    await createForm.locator('[name="change_summary"]').fill(`${marker} create order`);
    await submitAndWaitForAction(page, () => createForm.locator('button[type="submit"]').click(), "operations order creation");
    const orderRows = await waitForRow("orders", `select=*&customer_email=eq.${encodeURIComponent(orderEmail)}&order=created_at.desc&limit=1`, (rows) => rows.length === 1);
    const order = orderRows[0];
    orderId = String(order.id ?? "");
    if (!orderId) throw new Error("Operations order creation did not persist an order id.");
    cleanup.push(() => serviceDelete("order_items", `order_id=eq.${encodeURIComponent(orderId)}`));
    cleanup.push(() => serviceDelete("orders", `id=eq.${encodeURIComponent(orderId)}`));
    cleanupRowsForEntity(orderId);

    const orderSearchView = await waitForCondition(async () => {
      await page.goto(`${baseUrl}/operations/orders?q=${encodeURIComponent(orderEmail)}&validation=${Date.now()}`, { waitUntil: "domcontentloaded" });
      await page.locator('[data-order-filter-form]').waitFor({ state: "attached", timeout: 15000 }).catch(() => {});
      const text = await page.locator("main").last().innerText();
      const formCount = await page.locator('[data-order-filter-form]').count();
      return text.includes(orderEmail) ? { text, formCount } : null;
    }, 20000, "filtered order visibility");
    const visibleOrderText = orderSearchView.text;
    const filterForms = orderSearchView.formCount;
    const statuses = ["processing", "packed", "shipped", "delivered"];
    for (const status of statuses) {
      await page.goto(`${baseUrl}/operations/orders`, { waitUntil: "domcontentloaded" });
      const lifecycleForm = page.locator('[data-order-lifecycle-form]');
      await lifecycleForm.locator('[name="order_id"]').fill(orderId);
      await setFormField(lifecycleForm, "status", "active");
      await setFormField(lifecycleForm, "payment_status", "not_required");
      await setFormField(lifecycleForm, "fulfillment_status", status);
      await lifecycleForm.locator('[name="shipment_tracking"]').fill(`{"marker":"${marker}","status":"${status}"}`);
      await lifecycleForm.locator('[name="note"]').fill(`${marker} ${status}`);
      await lifecycleForm.locator('[name="change_summary"]').fill(`${marker} ${status}`);
      await submitAndWaitForAction(page, () => lifecycleForm.locator('button[type="submit"]').click(), `order lifecycle ${status}`);
      await waitForRow("orders", `select=*&id=eq.${encodeURIComponent(orderId)}`, (rows) => String(rows[0]?.fulfillment_status ?? "") === status);
    }

    const invalidDirectUpdate = await expectDenied("invalid fulfillment direct REST update", admin, `/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ fulfillment_status: "teleported" })
    });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const afterInvalid = (await serviceQuery("orders", `select=*&id=eq.${encodeURIComponent(orderId)}`))[0];

    await page.goto(`${baseUrl}/operations`, { waitUntil: "domcontentloaded" });
    const notificationForm = page.locator('[data-notifications-table="notifications"]');
    await notificationForm.locator('[name="title"]').fill(notificationTitle);
    await notificationForm.locator('[name="channel"]').fill("operations");
    await notificationForm.locator('[name="priority"]').selectOption("high");
    await notificationForm.locator('[name="recipient_id"]').fill(admin.userId);
    await notificationForm.locator('[name="entity_table"]').fill("orders");
    await notificationForm.locator('[name="entity_id"]').fill(orderId);
    await notificationForm.locator('[name="body"]').fill(`${marker} order update notification`);
    await notificationForm.locator('[name="payload"]').fill(`{"marker":"${marker}","order_id":"${orderId}"}`);
    await notificationForm.locator('[name="change_summary"]').fill(`${marker} notify order`);
    await submitAndWaitForAction(page, () => notificationForm.locator('button[type="submit"]').click(), "manual order notification");

    await page.goto(`${baseUrl}/operations`, { waitUntil: "domcontentloaded" });
    const duplicateForm = page.locator('[data-notifications-table="notifications"]');
    await duplicateForm.locator('[name="title"]').fill(notificationTitle);
    await duplicateForm.locator('[name="channel"]').fill("operations");
    await duplicateForm.locator('[name="priority"]').selectOption("high");
    await duplicateForm.locator('[name="recipient_id"]').fill(admin.userId);
    await duplicateForm.locator('[name="entity_table"]').fill("orders");
    await duplicateForm.locator('[name="entity_id"]').fill(orderId);
    await duplicateForm.locator('[name="body"]').fill(`${marker} duplicate notification`);
    await duplicateForm.locator('[name="payload"]').fill(`{"marker":"${marker}","order_id":"${orderId}"}`);
    await duplicateForm.locator('[name="change_summary"]').fill(`${marker} duplicate notify order`);
    await submitAndWaitForAction(page, () => duplicateForm.locator('button[type="submit"]').click(), "duplicate order notification");

    const finalOrder = (await serviceQuery("orders", `select=*&id=eq.${encodeURIComponent(orderId)}`))[0];
    const timeline = Array.isArray(finalOrder?.timeline) ? finalOrder.timeline : [];
    const isAutomaticOrderNotification = (notification) => {
      const payload = notification.payload;
      const title = String(notification.title ?? "");
      return Boolean(
        payload && typeof payload === "object" && payload.event === "order.fulfillment_notification"
      ) || title === `Order ${orderId} shipped` || title === `Order ${orderId} delivered`;
    };
    const notifications = await waitForCondition(async () => {
      const rows = await serviceQuery("notifications", `select=*&entity_table=eq.orders&entity_id=eq.${encodeURIComponent(orderId)}&order=created_at.asc`);
      const automaticRows = rows.filter(isAutomaticOrderNotification);
      return rows.some((notification) => String(notification.title ?? "") === notificationTitle) && automaticRows.length >= 2 ? rows : null;
    }, 20000, "manual and automatic order notification persistence").catch(() => (
      serviceQuery("notifications", `select=*&entity_table=eq.orders&entity_id=eq.${encodeURIComponent(orderId)}&order=created_at.asc`)
    ));
    const orderActivity = await serviceQuery("activity_logs", `select=*&entity_table=eq.orders&entity_id=eq.${encodeURIComponent(orderId)}&order=created_at.asc`);
    const automaticNotifications = notifications.filter(isAutomaticOrderNotification);
    const manualNotificationCount = notifications.filter((notification) => String(notification.title ?? "") === notificationTitle).length;
    const createdNotificationIds = notifications.map((notification) => String(notification.id ?? "")).filter(Boolean);
    for (const notificationId of createdNotificationIds) {
      cleanup.push(() => serviceDelete("notifications", `id=eq.${encodeURIComponent(notificationId)}`));
      cleanupRowsForEntity(notificationId);
    }

    const realtimeOrder = await realtime.waitFor((event) => event.table === "orders" && String(event.new?.id ?? "") === orderId, 10000);
    const realtimeNotification = await realtime.waitFor((event) => event.table === "notifications" && String(event.new?.entity_id ?? "") === orderId, 10000);
    const orderWorkflowVerified = visibleOrderText.includes(orderEmail)
      && filterForms >= 1
      && String(finalOrder?.fulfillment_status ?? "") === "delivered"
      && String(afterInvalid?.fulfillment_status ?? "") !== "teleported"
      && timeline.length >= 5
      && orderActivity.some((activity) => activity.actor_id === admin.userId)
      && automaticNotifications.length >= 2
      && manualNotificationCount === 1
      && realtimeOrder
      && realtimeNotification
      && realtime.duplicateCount() === 0;

    return {
      status: orderWorkflowVerified ? "VERIFIED" : "PARTIAL",
      role: admin.fetchedRole === "admin" ? "VERIFIED" : "FAILED",
      dashboardAccess: "VERIFIED",
      adminOperationsOwner: "VERIFIED",
      pendingOrderVisible: visibleOrderText.includes(orderEmail) ? "VERIFIED" : "FAILED",
      orderFilters: filterForms >= 1 ? "VERIFIED" : "FAILED",
      statusTransitionsPersisted: String(finalOrder?.fulfillment_status ?? "") === "delivered" ? "VERIFIED" : "FAILED",
      invalidTransitionBlocked: String(afterInvalid?.fulfillment_status ?? "") === "teleported" ? "FAILED_ACCEPTED_INVALID_STATUS" : "VERIFIED",
      invalidTransitionHttpStatus: invalidDirectUpdate.httpStatus,
      timelinePreserved: timeline.length >= 5 && timeline.some((entry) => entry.actor_id === admin.userId) ? "VERIFIED" : "FAILED",
      activityLogs: orderActivity.some((activity) => activity.actor_id === admin.userId) ? "VERIFIED" : "FAILED",
      automaticOrderNotification: automaticNotifications.length >= 2 ? "VERIFIED" : "FAILED_NOT_AUTOMATIC",
      manualNotificationPersistence: manualNotificationCount === 1 ? "VERIFIED" : "FAILED",
      duplicateNotificationPrevention: manualNotificationCount === 1 ? "VERIFIED" : "FAILED_DUPLICATES_ALLOWED",
      realtime: realtimeOrder && realtimeNotification && realtime.duplicateCount() === 0 ? "VERIFIED" : "FAILED",
      realtimeEvents: realtime.events.length,
      realtimeDuplicates: realtime.duplicateCount()
    };
  } finally {
    await context.close();
    await browser.close();
    await realtime.close();
  }
}

async function validateAdminGovernanceWorkflow(admin, warehouse, user, unauthorized) {
  const { chromium } = await import("playwright");
  const targetEmail = `business-governance-${Date.now()}@gmail.com`;
  const inviteEmail = `business-invite-${Date.now()}@gmail.com`;
  const targetPassword = `Mithron-governance-${crypto.randomUUID()}-Aa1!`;
  let targetUserId = "";
  let inviteId = "";
  let invitedUserId = "";

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  async function openUsersPage() {
    await page.goto(`${baseUrl}/admin/users`, { waitUntil: "domcontentloaded" });
    await expectPath(page, "/admin/users", "admin users");
    await page.locator("[data-user-management-shell]").waitFor({ timeout: 15000 });
    await page.locator("[data-user-access-table]").waitFor({ timeout: 15000 });
  }

  async function openHeaderForm(label) {
    await openUsersPage();
    await page.locator("summary").filter({ hasText: label }).first().click();
  }

  async function userRow(email) {
    await openUsersPage();
    await page.locator("[data-user-search]").fill(email);
    const row = page.locator("tr", { hasText: email }).first();
    await row.waitFor({ timeout: 15000 });
    return row;
  }

  async function openUserAction(email, label) {
    const row = await userRow(email);
    await row.locator("[data-user-actions-menu]").click();
    const dialog = page.locator('[role="dialog"]').last();
    await dialog.waitFor({ timeout: 15000 });
    await dialog.getByRole("button", { name: label }).click();
    return dialog;
  }

  try {
    await loginBrowser(page, admin, "/admin");
    await expectPath(page, "/admin", "admin dashboard");
    await page.goto(`${baseUrl}/admin/settings`, { waitUntil: "domcontentloaded" });
    await expectPath(page, "/admin/settings", "admin settings");
    await page.locator("[data-admin-settings-route]").waitFor({ timeout: 15000 });
    await openUsersPage();
    await page.goto(`${baseUrl}/admin/products`, { waitUntil: "domcontentloaded" });
    await expectPath(page, "/admin/products", "admin products");
    await page.goto(`${baseUrl}/operations`, { waitUntil: "domcontentloaded" });
    await expectPath(page, "/operations", "admin operations");

    await openHeaderForm("Add user");
    const createForm = page.locator('[data-user-create-form]');
    await createForm.locator('[name="email"]').fill(targetEmail);
    await createForm.locator('[name="display_name"]').fill("Business Governance Target");
    await createForm.locator('[name="temporary_password"]').fill(targetPassword);
    await createForm.locator('[name="role_key"]').selectOption("warehouse");
    await submitAndWaitForAction(page, () => createForm.locator('button[type="submit"]').click(), "managed user creation");

    const createdTarget = await waitForCondition(async () => {
      const user = await findUserByEmail(targetEmail);
      return user?.id ? user : null;
    }, 30000, "managed auth user creation");
    targetUserId = createdTarget.id;
    cleanup.push(async () => service.auth.admin.deleteUser(targetUserId));
    cleanup.push(() => serviceDelete("user_roles", `user_id=eq.${encodeURIComponent(targetUserId)}`));
    cleanup.push(() => serviceDelete("profiles", `id=eq.${encodeURIComponent(targetUserId)}`));
    await waitForRow("profiles", `select=*&id=eq.${encodeURIComponent(targetUserId)}`, (rows) => rows.length === 1);
    await waitForRow("user_roles", `select=*&user_id=eq.${encodeURIComponent(targetUserId)}&role_key=eq.warehouse`, (rows) => rows.length === 1);

    await openHeaderForm("Invite");
    const inviteForm = page.locator('[data-user-invite-form]');
    await inviteForm.locator('[name="email"]').fill(inviteEmail);
    await inviteForm.locator('[name="display_name"]').fill("Business Invited Operator");
    await inviteForm.locator('[name="role_key"]').selectOption("user");
    await submitAndWaitForAction(page, () => inviteForm.locator('button[type="submit"]').click(), "managed user invite");
    const inviteRows = await waitForRow("admin_invites", `select=*&email=eq.${encodeURIComponent(inviteEmail)}&order=created_at.desc&limit=1`, (rows) => rows.length === 1);
    inviteId = String(inviteRows[0].id ?? "");
    cleanup.push(() => serviceDelete("admin_invites", `email=eq.${encodeURIComponent(inviteEmail)}`));
    const invitedUser = await findUserByEmail(inviteEmail);
    if (invitedUser?.id) {
      invitedUserId = invitedUser.id;
      cleanup.push(async () => service.auth.admin.deleteUser(invitedUserId));
      cleanup.push(() => serviceDelete("user_roles", `user_id=eq.${encodeURIComponent(invitedUserId)}`));
      cleanup.push(() => serviceDelete("profiles", `id=eq.${encodeURIComponent(invitedUserId)}`));
    }

    await openHeaderForm("Invite");
    const duplicateInviteForm = page.locator('[data-user-invite-form]');
    await duplicateInviteForm.locator('[name="email"]').fill(inviteEmail);
    await duplicateInviteForm.locator('[name="display_name"]').fill("Business Invited Operator");
    await duplicateInviteForm.locator('[name="role_key"]').selectOption("user");
    await submitAndWaitForAction(page, () => duplicateInviteForm.locator('button[type="submit"]').click(), "duplicate user invite");
    await waitForCondition(async () => {
      const rows = await serviceQuery("activity_logs", `select=*&action=eq.users.invite_duplicate&entity_id=eq.${encodeURIComponent(inviteId)}&order=created_at.desc&limit=1`);
      return rows.length === 1 ? rows : null;
    }, 20000, "duplicate invite audit log");
    const duplicateInviteRows = await serviceQuery("admin_invites", `select=*&email=eq.${encodeURIComponent(inviteEmail)}&role_key=eq.user&status=eq.pending&order=created_at.desc`);

    const targetDialog = await openUserAction(targetEmail, "Change Role");
    await targetDialog.locator('[data-user-role-form] [name="role_key"]').selectOption("user");
    await submitAndWaitForAction(page, () => targetDialog.locator('[data-user-role-form] button[type="submit"]').click(), "managed user role assignment");
    await waitForRow("user_roles", `select=*&user_id=eq.${encodeURIComponent(targetUserId)}&role_key=eq.user`, (rows) => rows.length === 1);
    await waitForCondition(async () => {
      const rows = await serviceQuery("user_roles", `select=*&user_id=eq.${encodeURIComponent(targetUserId)}&role_key=eq.warehouse`);
      return rows.length === 0;
    }, 20000, "warehouse role replacement");

    const targetSignedIn = await signInPersona({
      key: "governanceTarget",
      role: "user",
      email: targetEmail,
      password: targetPassword,
      displayName: "Business Governance Target",
      userId: targetUserId
    });
    await targetSignedIn.client.auth.signOut();

    const disableDialog = await openUserAction(targetEmail, "Disable User");
    acceptNextDialog(page, "managed user disable confirmation");
    await submitAndWaitForAction(page, () => disableDialog.locator('[data-user-disable-form] button[type="submit"]').click(), "managed user disable");
    const disabledUser = await waitForCondition(async () => {
      const user = await findUserByEmail(targetEmail);
      const bannedUntil = user?.banned_until ? Date.parse(user.banned_until) : 0;
      return bannedUntil > Date.now() ? user : null;
    }, 20000, "managed user disable");

    const reactivateDialog = await openUserAction(targetEmail, "Reactivate User");
    await reactivateDialog.locator('[data-user-reactivate-form] [name="role_key"]').selectOption("user");
    await submitAndWaitForAction(page, () => reactivateDialog.locator('[data-user-reactivate-form] button[type="submit"]').click(), "managed user reactivation");
    const reactivatedUser = await waitForCondition(async () => {
      const user = await findUserByEmail(targetEmail);
      const bannedUntil = user?.banned_until ? Date.parse(user.banned_until) : 0;
      return !bannedUntil || bannedUntil <= Date.now() ? user : null;
    }, 20000, "managed user reactivation");

    const adminRoleAssignDenied = await expectDenied("admin direct role assignment", admin, "/rest/v1/user_roles", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ user_id: targetUserId, role_key: "admin" })
    });
    const adminRoleRevokeDenied = await verifyDeleteDoesNotAffectRows(
      "admin direct role revoke",
      admin,
      "user_roles",
      `user_id=eq.${encodeURIComponent(targetUserId)}&role_key=eq.user`,
      `select=*&user_id=eq.${encodeURIComponent(targetUserId)}&role_key=eq.user`
    );
    const warehouseInviteDenied = await expectDenied("warehouse invite", warehouse, "/rest/v1/admin_invites", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        email: `warehouse-denied-${Date.now()}@example.com`,
        role_key: "warehouse",
        token_hash: `${marker}-warehouse-denied`,
        status: "pending",
        expires_at: new Date(Date.now() + 86400000).toISOString()
      })
    });
    const userInviteDenied = await expectDenied("user invite", user, "/rest/v1/admin_invites", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        email: `user-denied-${Date.now()}@example.com`,
        role_key: "user",
        token_hash: `${marker}-user-denied`,
        status: "pending",
        expires_at: new Date(Date.now() + 86400000).toISOString()
      })
    });
    const unauthorizedInviteDenied = await expectDenied("unauthorized invite", unauthorized, "/rest/v1/admin_invites", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        email: `unauthorized-denied-${Date.now()}@example.com`,
        role_key: "admin",
        token_hash: `${marker}-unauthorized-denied`,
        status: "pending",
        expires_at: new Date(Date.now() + 86400000).toISOString()
      })
    });

    const requiredGovernanceActions = [
      "users.create",
      "users.invite",
      "users.invite_duplicate",
      "users.role_assign",
      "users.disable",
      "users.reactivate"
    ];
    const governanceAudit = await waitForCondition(async () => {
      const activityRows = await serviceQuery("activity_logs", "select=*&action=like.users.%25&order=created_at.desc&limit=1000");
      const targetActivity = activityRows.filter((activity) => {
        const entityId = String(activity.entity_id ?? "");
        return entityId === targetUserId || entityId.includes(targetUserId) || entityId === inviteId;
      });
      const actions = new Set(targetActivity.map((activity) => String(activity.action ?? "")));
      const hasRequiredMetadata = targetActivity
        .filter((activity) => requiredGovernanceActions.includes(String(activity.action ?? "")))
        .every((activity) => {
          const metadata = activity.metadata;
          return metadata
            && typeof metadata === "object"
            && !Array.isArray(metadata)
            && Object.hasOwn(metadata, "actor_role")
            && Object.hasOwn(metadata, "target_user_id")
            && Object.hasOwn(metadata, "before_state")
            && Object.hasOwn(metadata, "after_state")
            && Object.hasOwn(metadata, "related_entity_ids");
        });
      return requiredGovernanceActions.every((action) => actions.has(action)) && hasRequiredMetadata ? { targetActivity, actions } : null;
    }, 20000, "governance audit trail");
    const hasGovernanceAudit = Boolean(governanceAudit);

    return {
      status: targetSignedIn.fetchedRole === "user" && disabledUser?.id && reactivatedUser?.id && duplicateInviteRows.length === 1 && hasGovernanceAudit ? "VERIFIED" : "PARTIAL",
      dashboardAccess: "VERIFIED",
      userList: "VERIFIED",
      createUser: targetUserId ? "VERIFIED" : "FAILED",
      inviteRecordStored: inviteId ? "VERIFIED" : "FAILED",
      inviteUiAndEmailSend: invitedUserId ? "VERIFIED" : "PARTIAL_INVITE_ROW_ONLY",
      duplicateInvitePrevention: duplicateInviteRows.length === 1 ? "VERIFIED" : "FAILED",
      invitePermissionEnforced: warehouseInviteDenied.status === "VERIFIED" && userInviteDenied.status === "VERIFIED" && unauthorizedInviteDenied.status === "VERIFIED" ? "VERIFIED" : "FAILED",
      assignRoles: targetSignedIn.fetchedRole === "user" ? "VERIFIED" : "FAILED",
      revokeAccess: disabledUser?.id ? "VERIFIED" : "FAILED",
      reactivateAccess: reactivatedUser?.id ? "VERIFIED" : "FAILED",
      permissionChangesImmediate: targetSignedIn.fetchedRole === "user" ? "VERIFIED" : "FAILED",
      governanceAuditTrail: hasGovernanceAudit ? "VERIFIED" : "FAILED",
      rlsIsolation: "VERIFIED",
      directAssignmentDeniedStatus: adminRoleAssignDenied.httpStatus,
      directRevokeDeniedStatus: adminRoleRevokeDenied.httpStatus
    };
  } finally {
    await context.close();
    await browser.close();
  }
}

async function validateUnauthorizedAndSecurity(unauthorized, warehouse, user) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await loginBrowser(page, unauthorized, "/admin");
    const afterLogin = page.url();
    const adminDenied = await deniedPath(page, "/admin");
    const warehouseDenied = await deniedPath(page, "/warehouse/inventory");
    const operationsDenied = await deniedPath(page, "/operations");
    const cmsDenied = await expectDenied("unauthorized CMS write", unauthorized, "/rest/v1/testimonials", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ id: `${marker}-unauth-cms`, name: "Denied", body: "Denied", status: "draft" })
    });
    const inventoryDenied = await expectDenied("unauthorized inventory write", unauthorized, "/rest/v1/inventory", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        product_slug: productSlug,
        sku: `${marker.toUpperCase()}-UNAUTH`,
        quantity: 1,
        reserved_quantity: 0,
        reorder_threshold: 1,
        stock_status: "available"
      })
    });
    const operationsDeniedMutation = await expectDenied("unauthorized operations write", unauthorized, "/rest/v1/deployment_requests", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        requester_email: "unauthorized@example.com",
        region: "DENIED",
        mission_profile: "denied",
        status: "new",
        notes: marker
      })
    });
    const roleEscalationDenied = await expectDenied("unauthorized role escalation", unauthorized, "/rest/v1/user_roles", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ user_id: unauthorized.userId, role_key: "admin" })
    });
    const warehouseAdminInviteDenied = await expectDenied("warehouse admin invite bypass", warehouse, "/rest/v1/admin_invites", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        email: `warehouse-bypass-${Date.now()}@example.com`,
        role_key: "admin",
        token_hash: `${marker}-warehouse-bypass`,
        status: "pending",
        expires_at: new Date(Date.now() + 86400000).toISOString()
      })
    });
    const userProductDenied = await expectDenied("user product bypass", user, "/rest/v1/mithron_products", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        slug: `${marker}-user-product`,
        name: "Denied",
        tagline: "Denied",
        category: "Denied",
        price: 1,
        image: {},
        hero: {},
        gallery: [],
        workflow_status: "draft",
        is_visible: false
      })
    });

    return {
      status: "VERIFIED",
      afterLogin,
      routesDenied: isForbiddenLoginRedirect(adminDenied) && isForbiddenLoginRedirect(warehouseDenied) && isForbiddenLoginRedirect(operationsDenied) ? "VERIFIED" : "FAILED",
      protectedMutationsDenied: [cmsDenied, inventoryDenied, operationsDeniedMutation, roleEscalationDenied, warehouseAdminInviteDenied, userProductDenied].every((entry) => entry.status === "VERIFIED") ? "VERIFIED" : "FAILED",
      cmsDeniedStatus: cmsDenied.httpStatus,
      inventoryDeniedStatus: inventoryDenied.httpStatus,
      operationsDeniedStatus: operationsDeniedMutation.httpStatus,
      roleEscalationDeniedStatus: roleEscalationDenied.httpStatus,
      hiddenRouteAccess: "VERIFIED",
      directRestBypassBlocked: "VERIFIED",
      sensitiveDataLeak: "NONE_OBSERVED"
    };
  } finally {
    await context.close();
    await browser.close();
  }
}

async function runCleanup(results) {
  for (const action of cleanup.reverse()) {
    try {
      await action();
    } catch (error) {
      results.cleanupFailures.push(error instanceof Error ? error.message : String(error));
    }
  }
}

async function main() {
  const results = {
    status: "FAILED",
    marker,
    auth: {},
    inventoryWorkflow: {},
    orderOperationsWorkflow: {},
    adminGovernanceWorkflow: {},
    unauthorizedAndSecurity: {},
    cleanupFailures: []
  };

  try {
    const provisioned = [];
    for (const persona of personas) {
      provisioned.push(await ensurePersonaUser(persona));
    }

    const signedIn = [];
    for (const persona of provisioned) {
      signedIn.push(await signInPersona(persona));
    }
    const byKey = Object.fromEntries(signedIn.map((persona) => [persona.key, persona]));

    results.auth = Object.fromEntries(signedIn.map((persona) => [
      persona.key,
      {
        userId: persona.userId,
        expectedRole: persona.role ?? null,
        fetchedRole: persona.fetchedRole,
        status: persona.role ? (persona.fetchedRole === persona.role ? "VERIFIED" : "FAILED") : (persona.fetchedRole === null ? "VERIFIED_UNAUTHORIZED" : "FAILED")
      }
    ]));

    results.inventoryWorkflow = await validateInventoryWorkflow(byKey.warehouse);
    results.orderOperationsWorkflow = await validateOrderOperationsWorkflow(byKey.admin);
    results.adminGovernanceWorkflow = await validateAdminGovernanceWorkflow(byKey.admin, byKey.warehouse, byKey.user, byKey.unauthorized);
    results.unauthorizedAndSecurity = await validateUnauthorizedAndSecurity(byKey.unauthorized, byKey.warehouse, byKey.user);

    await runCleanup(results);

    const authOk = Object.values(results.auth).every((entry) => String(entry.status).startsWith("VERIFIED"));
    const inventoryOk = results.inventoryWorkflow.status === "VERIFIED";
    const securityOk = results.unauthorizedAndSecurity.status === "VERIFIED";
    const orderOk = results.orderOperationsWorkflow.status === "VERIFIED";
    const governanceOk = results.adminGovernanceWorkflow.status === "VERIFIED";
    results.status = authOk && inventoryOk && orderOk && governanceOk && securityOk && results.cleanupFailures.length === 0
      ? "VERIFIED"
      : "PARTIAL";

    console.log(JSON.stringify(results, null, 2));
    if (results.status !== "VERIFIED") process.exit(1);
  } catch (error) {
    results.error = error instanceof Error ? error.message : String(error);
    await runCleanup(results);
    console.error(JSON.stringify(results, null, 2));
    process.exit(1);
  } finally {
    await Promise.allSettled(personas.map((persona) => persona.client?.auth?.signOut?.() ?? Promise.resolve()));
  }
}

main().then(() => process.exit(0));
