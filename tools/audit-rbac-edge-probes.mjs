import crypto from "node:crypto";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const baseUrlArg = process.argv.find((arg) => arg.startsWith("--base-url="))?.slice("--base-url=".length);
const baseUrl = process.env.RBAC_AUDIT_BASE_URL ?? baseUrlArg ?? "http://127.0.0.1:3000";
const marker = `rbac-edge-${Date.now()}`;
const productSlug = process.env.AUTH_VALIDATION_PRODUCT_SLUG ?? "source-agri-kisan-drone-small-8-liter";
const variantId = "rbac-edge-base";
const cleanup = [];

if (!url || !publishableKey || !serviceRoleKey) {
  console.error(JSON.stringify({
    status: "FAILED",
    reason: "Missing Supabase URL, publishable key, or service role key."
  }, null, 2));
  process.exit(1);
}

const service = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const personas = [
  { key: "admin", role: "admin", email: "admin.validation@example.com", name: "RBAC Audit Admin" },
  { key: "warehouse", role: "warehouse", email: "warehouse.hardening@example.com", name: "RBAC Audit Warehouse" },
  { key: "supplier", role: "supplier", email: "supplier.validation@example.com", name: "RBAC Audit Supplier" },
  { key: "user", role: "user", email: "user.validation@example.com", name: "RBAC Audit User" },
  { key: "unauthorized", role: null, authMetadataRole: "unauthorized", email: "unauthorized.validation@example.com", name: "RBAC Audit Unauthorized" }
].map((persona) => ({
  ...persona,
  password: process.env.RBAC_AUDIT_PASSWORD ?? `Mithron-${persona.key}-${crypto.randomUUID()}-Aa1!`
}));

function authClient() {
  return createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false
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

async function waitForRows(table, query, predicate, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let lastRows = [];
  while (Date.now() < deadline) {
    const { body } = await restOk(`/rest/v1/${table}?${query}`);
    lastRows = Array.isArray(body) ? body : [];
    if (predicate(lastRows)) return lastRows;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return lastRows;
}

async function serviceDelete(table, query) {
  await restOk(`/rest/v1/${table}?${query}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" }
  });
}

async function servicePatch(table, query, payload) {
  await restOk(`/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(payload)
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

async function authRest(persona, path, options = {}) {
  return rest(path, options, authHeaders(persona));
}

async function authRestOk(persona, path, options = {}) {
  const result = await authRest(persona, path, options);
  if (!result.response.ok) {
    const detail = typeof result.body === "string" ? result.body : JSON.stringify(result.body);
    throw new Error(`${persona.key} ${options.method ?? "GET"} ${path} failed: ${result.response.status} ${result.response.statusText} ${detail ?? ""}`);
  }
  return result;
}

async function authInsert(persona, table, payload) {
  const { body } = await authRestOk(persona, `/rest/v1/${table}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload)
  });
  return Array.isArray(body) ? body[0] : body;
}

async function authPatch(persona, table, query, payload) {
  const { body } = await authRestOk(persona, `/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload)
  });
  return Array.isArray(body) ? body[0] : body;
}

async function authDelete(persona, table, query) {
  const result = await authRestOk(persona, `/rest/v1/${table}?${query}`, {
    method: "DELETE",
    headers: { Prefer: "return=representation" }
  });
  return Array.isArray(result.body) ? result.body : [];
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

async function expectZeroOrDenied(label, persona, path) {
  const result = await authRest(persona, path);
  if (!result.response.ok) {
    return {
      status: "VERIFIED_DENIED",
      httpStatus: result.response.status,
      statusText: result.response.statusText
    };
  }
  const rows = Array.isArray(result.body) ? result.body : [];
  if (rows.length) {
    throw new Error(`${label} leaked ${rows.length} row(s).`);
  }
  return {
    status: "VERIFIED_ZERO_ROWS",
    httpStatus: result.response.status
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
      display_name: plan.name
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
        display_name: plan.name
      }
    });
    if (updated.error) throw updated.error;
    user = updated.data.user;
  }

  if (!user?.id) throw new Error(`Failed to provision ${plan.key}.`);

  if (plan.role) {
    await serviceUpsert("profiles", "id", {
      id: user.id,
      email: plan.email,
      display_name: plan.name,
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

async function signIn(persona) {
  const client = authClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: persona.email,
    password: persona.password
  });
  if (error) throw new Error(`${persona.key} sign in failed: ${error.message}`);
  if (!data.session?.access_token) throw new Error(`${persona.key} did not receive a session.`);
  const signedIn = { ...persona, client, session: data.session };
  const { data: role, error: roleError } = await client.rpc("current_enterprise_role");
  if (roleError) throw new Error(`${persona.key} role RPC failed: ${roleError.message}`);
  return { ...signedIn, fetchedRole: role ?? null };
}

function statusForQuantity(quantity, threshold) {
  if (quantity <= 0) return "out_of_stock";
  if (quantity <= threshold) return "low_stock";
  return "available";
}

async function validateCrudAndEscalation(byKey) {
  const now = new Date().toISOString();
  const adminTestimonialId = `${marker}-admin-testimonial`;
  const adminTestimonial = await authInsert(byKey.admin, "testimonials", {
    id: adminTestimonialId,
    name: "RBAC Edge Admin",
    body: "Created by edge audit.",
    status: "draft",
    is_visible: false,
    sort_order: 9998
  });
  await authPatch(byKey.admin, "testimonials", `id=eq.${encodeURIComponent(adminTestimonialId)}`, {
    status: "published",
    is_visible: true,
    updated_at: now
  });
  const adminDeleted = await authDelete(byKey.admin, "testimonials", `id=eq.${encodeURIComponent(adminTestimonialId)}`);

  const adminOrder = await authInsert(byKey.admin, "orders", {
    order_number: `${marker.toUpperCase()}-ADMIN-CRUD`,
    customer_email: "rbac-edge-admin@example.com",
    status: "confirmed",
    payment_status: "not_required",
    fulfillment_status: "queued",
    channel: "rbac-edge-admin-validation",
    subtotal: 77,
    total: 77,
    currency: "INR",
    items: [],
    timeline: [{ at: now, event: "order.created", status: "confirmed", actor_id: byKey.admin.userId, metadata: { marker } }],
    metadata: { marker },
    created_by: byKey.admin.userId,
    updated_at: now
  });
  await authPatch(byKey.admin, "orders", `id=eq.${encodeURIComponent(adminOrder.id)}`, {
    fulfillment_status: "processing",
    updated_at: new Date().toISOString()
  });
  await authPatch(byKey.admin, "orders", `id=eq.${encodeURIComponent(adminOrder.id)}`, {
    fulfillment_status: "packed",
    updated_at: new Date().toISOString()
  });
  const adminOrderDeleted = await authDelete(byKey.admin, "orders", `id=eq.${encodeURIComponent(adminOrder.id)}`);

  const warehouseSku = `${marker.toUpperCase()}-WH`;
  const warehouseInventory = await authInsert(byKey.warehouse, "inventory", {
    product_slug: productSlug,
    sku: warehouseSku,
    variant_id: variantId,
    quantity: 7,
    reserved_quantity: 1,
    reorder_threshold: 2,
    stock_status: statusForQuantity(7, 2),
    updated_by: byKey.warehouse.userId,
    updated_at: now
  });
  await authPatch(
    byKey.warehouse,
    "inventory",
    `product_slug=eq.${encodeURIComponent(productSlug)}&sku=eq.${encodeURIComponent(warehouseSku)}`,
    { quantity: 8, stock_status: "available", updated_at: new Date().toISOString() }
  );
  const warehouseDeleted = await authDelete(
    byKey.warehouse,
    "inventory",
    `product_slug=eq.${encodeURIComponent(productSlug)}&sku=eq.${encodeURIComponent(warehouseSku)}`
  );

  const warehouseOrder = await authInsert(byKey.warehouse, "orders", {
    order_number: `${marker.toUpperCase()}-WH-CRUD`,
    customer_email: "rbac-edge-warehouse@example.com",
    status: "confirmed",
    payment_status: "not_required",
    fulfillment_status: "queued",
    channel: "rbac-edge-warehouse-validation",
    subtotal: 88,
    total: 88,
    currency: "INR",
    items: [],
    timeline: [{ at: now, event: "order.created", status: "confirmed", actor_id: byKey.warehouse.userId, metadata: { marker } }],
    metadata: { marker },
    created_by: byKey.warehouse.userId,
    updated_at: now
  });
  await authPatch(byKey.warehouse, "orders", `id=eq.${encodeURIComponent(warehouseOrder.id)}`, {
    fulfillment_status: "processing",
    updated_at: new Date().toISOString()
  });
  await authPatch(byKey.warehouse, "orders", `id=eq.${encodeURIComponent(warehouseOrder.id)}`, {
    fulfillment_status: "packed",
    updated_at: new Date().toISOString()
  });
  const warehouseOrderDeleted = await authDelete(byKey.warehouse, "orders", `id=eq.${encodeURIComponent(warehouseOrder.id)}`);

  return {
    adminTestimonialsCrud: adminTestimonial?.id === adminTestimonialId && adminDeleted.length === 1 ? "VERIFIED" : "FAILED",
    adminOrderCrud: adminOrder?.id && adminOrderDeleted.length === 1 ? "VERIFIED" : "FAILED",
    warehouseInventoryCrud: warehouseInventory?.sku === warehouseSku && warehouseDeleted.length === 1 ? "VERIFIED" : "FAILED",
    warehouseOrderCrud: warehouseOrder?.id && warehouseOrderDeleted.length === 1 ? "VERIFIED" : "FAILED",
    userOrderWriteDenied: await expectDenied("user order insert", byKey.user, "/rest/v1/orders", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        order_number: `${marker.toUpperCase()}-USER-DENIED`,
        customer_email: "rbac-edge-user-denied@example.com",
        status: "confirmed",
        payment_status: "not_required",
        fulfillment_status: "queued",
        channel: "rbac-edge-user-validation",
        subtotal: 99,
        total: 99,
        currency: "INR",
        items: [],
        timeline: [{ at: now, event: "order.created", status: "confirmed", actor_id: byKey.user.userId, metadata: { marker } }],
        metadata: { marker },
        created_by: byKey.user.userId,
        updated_at: now
      })
    }),
    directProductWriteDeniedForAdmin: await expectDenied("admin direct product REST write", byKey.admin, "/rest/v1/mithron_products", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        slug: `${marker}-direct-product`,
        name: "RBAC Edge Direct Product",
        tagline: "Denied direct product write",
        category: "Validation",
        price: 1,
        image: { src: "/media/rbac-edge.webp", alt: "RBAC edge" },
        hero: { src: "/media/rbac-edge.webp", alt: "RBAC edge" },
        gallery: [{ src: "/media/rbac-edge.webp", alt: "RBAC edge" }],
        workflow_status: "draft",
        is_visible: false
      })
    }),
    warehouseProductWriteDenied: await expectDenied("warehouse direct product REST write", byKey.warehouse, "/rest/v1/mithron_products", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        slug: `${marker}-warehouse-product`,
        name: "Denied Warehouse Product",
        tagline: "Denied",
        category: "Validation",
        price: 1,
        image: {},
        hero: {},
        gallery: [],
        workflow_status: "draft",
        is_visible: false
      })
    }),
    userInventoryDenied: await expectDenied("user inventory insert", byKey.user, "/rest/v1/inventory", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        product_slug: productSlug,
        sku: `${marker.toUpperCase()}-USER-DENIED`,
        variant_id: variantId,
        quantity: 1,
        reserved_quantity: 0,
        reorder_threshold: 1,
        stock_status: "available",
        updated_by: byKey.user.userId,
        updated_at: new Date().toISOString()
      })
    }),
    unauthorizedRoleEscalationDenied: await expectDenied("unauthorized role escalation", byKey.unauthorized, "/rest/v1/user_roles", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ user_id: byKey.unauthorized.userId, role_key: "admin" })
    }),
    warehouseRoleEscalationDenied: await expectDenied("warehouse role escalation", byKey.warehouse, "/rest/v1/user_roles", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ user_id: byKey.warehouse.userId, role_key: "admin" })
    }),
    userRoleEscalationDenied: await expectDenied("user role escalation", byKey.user, "/rest/v1/user_roles", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ user_id: byKey.user.userId, role_key: "admin" })
    }),
    warehouseSensitiveRoleRead: await expectZeroOrDenied("warehouse cross-user role read", byKey.warehouse, `/rest/v1/user_roles?select=user_id,role_key&user_id=neq.${encodeURIComponent(byKey.warehouse.userId)}&limit=1`),
    unauthorizedSensitiveRoleRead: await expectZeroOrDenied("unauthorized role read", byKey.unauthorized, "/rest/v1/user_roles?select=user_id,role_key&limit=1")
  };
}

async function loginBrowser(page, persona, nextPath) {
  await page.goto(`${baseUrl}/login?next=${encodeURIComponent(nextPath)}`, { waitUntil: "domcontentloaded" });
  await page.locator("input[type='email']").fill(persona.email);
  await page.locator("input[type='password']").fill(persona.password);
  await Promise.all([
    page.waitForURL(
      (target) =>
        target.pathname !== "/login" ||
        target.searchParams.get("admin_status") === "forbidden" ||
        target.searchParams.get("access_status") === "forbidden" ||
        target.searchParams.get("auth_status") === "role_required",
      { timeout: 30000 }
    ),
    page.locator("button[type='submit']").click()
  ]);
  await page.waitForLoadState("domcontentloaded").catch(() => {});
}

async function count(page, selector) {
  return page.locator(selector).count();
}

async function fillOrderItemFields(orderForm, itemProductSlug, itemSku) {
  const orderItemsField = orderForm.locator('[name="order_items"]');
  if (await orderItemsField.count()) {
    await orderItemsField.fill(`[{"productSlug":"${itemProductSlug}","quantity":1}]`);
    return;
  }

  const productPicker = orderForm.locator('[name="order_item_product_slug"]');
  await productPicker.waitFor({ timeout: 15000 });
  const pickerTag = await productPicker.evaluate((node) => node.tagName.toLowerCase());
  if (pickerTag === "select") {
    const options = await productPicker.locator("option").evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("value") ?? "").filter(Boolean)
    );
    const selectedSlug = options.includes(itemProductSlug) ? itemProductSlug : options[0];
    if (!selectedSlug) throw new Error("Order form has no selectable product rows.");
    await productPicker.selectOption(selectedSlug);
  } else {
    await productPicker.fill(itemProductSlug);
  }
  await orderForm.locator('[name="order_item_quantity"]').fill("1");
  const skuField = orderForm.locator('[name="order_item_sku"]');
  if (await skuField.count()) await skuField.fill(itemSku);
}

async function assertCurrentPath(page, expected, label) {
  const current = new URL(page.url());
  if (current.pathname !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${page.url()}`);
  }
}

async function submitServerActionForms(byKey) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const results = {};

  try {
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    const productProbeSlug = `${marker}-product`;
    try {
      await loginBrowser(adminPage, byKey.admin, "/admin/products?tool=create#create-product");
      await assertCurrentPath(adminPage, "/admin/products", "admin product form");
      const productForm = adminPage.locator('[data-product-table="mithron_products"]');
      await productForm.waitFor({ timeout: 15000 });
      await productForm.locator('[name="name"]').fill(productProbeSlug);
      const category = productForm.locator('[name="category"]');
      if (await category.count()) {
        const options = await category.locator("option").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("value") ?? "").filter(Boolean));
        if (options[0]) await category.selectOption(options[0]);
      }
      await productForm.locator('[name="price"]').fill("1");
      await productForm.locator('[name="image_src"]').fill("/media/rbac-edge.webp");
      await productForm.getByRole("button", { name: "Add product" }).click();
      await adminPage.waitForLoadState("domcontentloaded").catch(() => {});
      await adminPage.waitForTimeout(2000);
      const productResult = await restOk(`/rest/v1/mithron_products?select=slug,workflow_status,is_visible&slug=eq.${encodeURIComponent(productProbeSlug)}`);
      const rows = Array.isArray(productResult.body) ? productResult.body : [];
      cleanup.push(() => serviceDelete("mithron_products", `slug=eq.${encodeURIComponent(productProbeSlug)}`));
      results.adminProductServerAction = rows.length === 1 && rows[0].workflow_status === "draft" ? "VERIFIED" : "FAILED";

      await adminPage.goto(`${baseUrl}/operations/orders`, { waitUntil: "domcontentloaded" });
      await adminPage.locator('[data-order-management-table="orders"]').waitFor({ timeout: 15000 });
      const orderEmail = `rbac-edge-admin-order-${Date.now()}@example.com`;
      const orderForm = adminPage.locator('[data-order-management-table="orders"]');
      await orderForm.locator('[name="customer_email"]').fill(orderEmail);
      await orderForm.locator('[name="region"]').fill("RBAC-ADMIN");
      await orderForm.locator('[name="mission_profile"]').fill("validation");
      await fillOrderItemFields(orderForm, productSlug, `${marker.toUpperCase()}-ADMIN-SKU`);
      await orderForm.locator('[name="note"]').fill(marker);
      await orderForm.locator('[name="change_summary"]').fill(marker);
      await orderForm.locator('button[type="submit"]').click();
      await adminPage.waitForLoadState("domcontentloaded").catch(() => {});
      await adminPage.waitForTimeout(2000);
      const orderRows = (await restOk(`/rest/v1/orders?select=id,customer_email,fulfillment_status&customer_email=eq.${encodeURIComponent(orderEmail)}`)).body ?? [];
      const createdOrder = Array.isArray(orderRows) ? orderRows[0] : null;
      if (createdOrder?.id) {
        cleanup.push(() => serviceDelete("order_items", `order_id=eq.${encodeURIComponent(createdOrder.id)}`));
        cleanup.push(() => serviceDelete("orders", `id=eq.${encodeURIComponent(createdOrder.id)}`));
      }
      results.adminOrderServerAction = createdOrder?.customer_email === orderEmail ? "VERIFIED" : "FAILED";
    } finally {
      await adminContext.close();
    }

    const warehouseContext = await browser.newContext();
    const warehousePage = await warehouseContext.newPage();
    try {
      await loginBrowser(warehousePage, byKey.warehouse, "/warehouse/inventory");
      await assertCurrentPath(warehousePage, "/warehouse/inventory", "warehouse stock form");
      const inlineStockForm = warehousePage.locator("[data-inventory-inline-stock] form").first();
      await inlineStockForm.waitFor({ timeout: 15000 });
      const actionMenuButton = warehousePage.locator("[data-inventory-action-menu] > button").first();
      if (await actionMenuButton.count()) {
        await actionMenuButton.scrollIntoViewIfNeeded();
        await actionMenuButton.click();
      }
      const quickEditButton = warehousePage.locator("[data-inventory-quick-edit]:visible").first();
      if (await quickEditButton.count()) {
        await quickEditButton.click();
      }
      const stockForm = warehousePage.locator("[data-inventory-quick-edit-form]");
      await stockForm.waitFor({ timeout: 15000 });
      const editedProductSlug = await stockForm.locator('[name="product_slug"]').inputValue();
      const editedSku = await stockForm.locator('[name="sku"]').inputValue();
      const editedWarehouseCode = await stockForm.locator('[name="warehouse_code"]').inputValue();
      const originalQuantity = Number(await stockForm.locator('[name="quantity"]').inputValue());
      const nextQuantity = Number.isFinite(originalQuantity) ? originalQuantity + 1 : 1;
      const inventoryQuery = `product_slug=eq.${encodeURIComponent(editedProductSlug)}&sku=eq.${encodeURIComponent(editedSku)}`;
      const stockQuery = `warehouse_code=eq.${encodeURIComponent(editedWarehouseCode)}&product_slug=eq.${encodeURIComponent(editedProductSlug)}&sku=eq.${encodeURIComponent(editedSku)}`;
      const originalInventoryRows = (await restOk(`/rest/v1/inventory?select=quantity,reserved_quantity,reorder_threshold,stock_status&${inventoryQuery}`)).body ?? [];
      const originalStockRows = (await restOk(`/rest/v1/warehouse_stock?select=available_quantity,committed_quantity&${stockQuery}`)).body ?? [];
      const originalInventory = Array.isArray(originalInventoryRows) ? originalInventoryRows[0] : null;
      const originalStock = Array.isArray(originalStockRows) ? originalStockRows[0] : null;
      cleanup.push(() => serviceDelete("inventory_movements", `sku=eq.${encodeURIComponent(editedSku)}&notes=eq.${encodeURIComponent(marker)}`));
      cleanup.push(() => originalStock
        ? servicePatch("warehouse_stock", stockQuery, {
          available_quantity: originalStock.available_quantity,
          committed_quantity: originalStock.committed_quantity
        })
        : serviceDelete("warehouse_stock", stockQuery));
      cleanup.push(() => originalInventory
        ? servicePatch("inventory", inventoryQuery, {
          quantity: originalInventory.quantity,
          reserved_quantity: originalInventory.reserved_quantity,
          reorder_threshold: originalInventory.reorder_threshold,
          stock_status: originalInventory.stock_status
        })
        : serviceDelete("inventory", inventoryQuery));
      await stockForm.locator('[name="quantity"]').fill(String(nextQuantity));
      const noteField = stockForm.locator('[name="note"]');
      if (await noteField.count()) await noteField.fill(marker);
      await stockForm.locator('button[type="submit"]').click();
      await warehousePage.waitForLoadState("domcontentloaded").catch(() => {});
      const inventoryRows = await waitForRows(
        "inventory",
        `select=sku,quantity&${inventoryQuery}`,
        (rows) => rows.length === 1 && Number(rows[0]?.quantity ?? 0) === nextQuantity
      );
      const stockRows = await waitForRows(
        "warehouse_stock",
        `select=sku,available_quantity&${stockQuery}`,
        (rows) => rows.length === 1 && Number(rows[0]?.available_quantity ?? 0) === nextQuantity
      );
      const movementRows = await waitForRows(
        "inventory_movements",
        `select=id,notes,actor_user_id&sku=eq.${encodeURIComponent(editedSku)}&notes=eq.${encodeURIComponent(marker)}`,
        (rows) => rows.some((row) => String(row.notes ?? "") === marker)
      );
      results.warehouseInventoryServerAction = Array.isArray(inventoryRows) && inventoryRows.length === 1 && Array.isArray(stockRows) && stockRows.length === 1 && Array.isArray(movementRows) && movementRows.length >= 1
        ? "VERIFIED"
        : "FAILED";

      await warehousePage.goto(`${baseUrl}/warehouse/orders`, { waitUntil: "domcontentloaded" });
      await warehousePage.locator('[data-order-management-table="orders"]').waitFor({ timeout: 15000 });
      const orderEmail = `rbac-edge-order-${Date.now()}@example.com`;
      const orderForm = warehousePage.locator('[data-order-management-table="orders"]');
      await orderForm.locator('[name="customer_email"]').fill(orderEmail);
      await orderForm.locator('[name="region"]').fill("RBAC-EDGE");
      await orderForm.locator('[name="mission_profile"]').fill("validation");
      await fillOrderItemFields(orderForm, productSlug, `${marker.toUpperCase()}-WH-SKU`);
      await orderForm.locator('[name="note"]').fill(marker);
      await orderForm.locator('[name="change_summary"]').fill(marker);
      await orderForm.locator('button[type="submit"]').click();
      await warehousePage.waitForLoadState("domcontentloaded").catch(() => {});
      await warehousePage.waitForTimeout(2000);
      const orderRows = (await restOk(`/rest/v1/orders?select=id,customer_email,fulfillment_status&customer_email=eq.${encodeURIComponent(orderEmail)}`)).body ?? [];
      const createdOrder = Array.isArray(orderRows) ? orderRows[0] : null;
      if (createdOrder?.id) {
        cleanup.push(() => serviceDelete("order_items", `order_id=eq.${encodeURIComponent(createdOrder.id)}`));
        cleanup.push(() => serviceDelete("orders", `id=eq.${encodeURIComponent(createdOrder.id)}`));
      }
      results.warehouseOrderServerAction = createdOrder?.customer_email === orderEmail ? "VERIFIED" : "FAILED";
    } finally {
      await warehouseContext.close();
    }

  } finally {
    await browser.close();
  }

  return results;
}

async function validateUiBoundaries(byKey) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const results = {};

  try {
    const plans = [
      {
        key: "admin",
        persona: byKey.admin,
        next: "/admin/products?tool=create#create-product",
        checks: async (page) => {
          await assertCurrentPath(page, "/admin/products", "admin product UI");
          await page.locator('[data-product-table="mithron_products"]').waitFor({ timeout: 15000 });
          await page.goto(`${baseUrl}/admin/orders`, { waitUntil: "domcontentloaded" });
          await page.locator('[data-order-detail-panel]').waitFor({ timeout: 15000 });
          const orderFilterForm = await count(page, "[data-order-filter-form]");
          const orderStatusBoard = await count(page, "[data-order-status-board]");
          const orderDetailPanel = await count(page, "[data-order-detail-panel]");
          await page.goto(`${baseUrl}/admin/products?tool=inventory#product-inventory`, { waitUntil: "domcontentloaded" });
          await page.locator('[data-product-inventory-table="inventory"]').waitFor({ timeout: 15000 });
          const inventoryForm = await count(page, '[data-product-inventory-table="inventory"]');
          await page.goto(`${baseUrl}/admin/products?tool=publish#publish-product`, { waitUntil: "domcontentloaded" });
          await page.locator('[data-product-publish-table="mithron_products"]').waitFor({ timeout: 15000 });
          const publishForm = await count(page, '[data-product-publish-table="mithron_products"]');
          await page.goto(`${baseUrl}/admin/products?tool=create#create-product`, { waitUntil: "domcontentloaded" });
          await page.locator('[data-product-table="mithron_products"]').waitFor({ timeout: 15000 });
          return {
            productDraftForm: await count(page, '[data-product-table="mithron_products"]'),
            inventoryForm,
            publishForm,
            orderFilterForm,
            orderStatusBoard,
            orderDetailPanel
          };
        }
      },
      {
        key: "warehouse",
        persona: byKey.warehouse,
        next: "/warehouse/inventory",
        checks: async (page) => {
          await assertCurrentPath(page, "/warehouse/inventory", "warehouse inventory UI");
          await page.locator("[data-inventory-system]").waitFor({ timeout: 15000 });
          await page.locator("[data-inventory-table]").waitFor({ timeout: 15000 });
          const inventorySystem = await count(page, "[data-inventory-system]");
          const inventoryTable = await count(page, "[data-inventory-table]");
          let quickEditButtons = await count(page, "[data-inventory-quick-edit]:visible");
          if (quickEditButtons === 0 && await count(page, "[data-inventory-action-menu] > button")) {
            await page.locator("[data-inventory-action-menu] > button").first().scrollIntoViewIfNeeded();
            await page.locator("[data-inventory-action-menu] > button").first().click();
            await page.locator("[data-inventory-quick-edit]:visible").waitFor({ timeout: 15000 });
            quickEditButtons = await count(page, "[data-inventory-quick-edit]:visible");
          }
          if (quickEditButtons > 0) {
            await page.locator("[data-inventory-quick-edit]:visible").first().click();
            await page.locator("[data-inventory-quick-edit-form]").waitFor({ timeout: 15000 });
          }
          const quickEditForm = quickEditButtons > 0 ? await count(page, "[data-inventory-quick-edit-form]") : 0;
          await page.goto(`${baseUrl}/warehouse/orders`, { waitUntil: "domcontentloaded" });
          await page.locator('[data-order-management-table="orders"]').waitFor({ timeout: 15000 });
          const orderForms = await count(page, '[data-order-management-table="orders"]');
          await page.goto(`${baseUrl}/admin/products`, { waitUntil: "domcontentloaded" });
          const deniedPath = new URL(page.url()).pathname;
          return {
            inventorySystem,
            inventoryTable,
            quickEditButtons,
            quickEditForm,
            orderForms,
            deniedAdminProductsPath: page.url(),
            hiddenProductDraftForm: deniedPath !== "/admin/products" && await count(page, '[data-product-table="mithron_products"]') === 0
          };
        }
      },
      {
        key: "edgeUser",
        persona: byKey.user,
        next: "/account",
        checks: async (page) => {
          await assertCurrentPath(page, "/account", "user account UI");
          await page.goto(`${baseUrl}/warehouse/inventory`, { waitUntil: "domcontentloaded" });
          const deniedWarehousePath = page.url();
          const hiddenWarehouseInventory = await count(page, "[data-inventory-system]") === 0;
          await page.goto(`${baseUrl}/admin/products`, { waitUntil: "domcontentloaded" });
          const deniedAdminProductsPath = page.url();
          const hiddenProductDraftForm = await count(page, '[data-product-table="mithron_products"]') === 0;
          await page.goto(`${baseUrl}/operations`, { waitUntil: "domcontentloaded" });
          const deniedOperationsPath = page.url();
          const hiddenOperationsForms = await count(page, '[data-notifications-table="notifications"]') === 0;
          return {
            deniedWarehousePath,
            deniedAdminProductsPath,
            deniedOperationsPath,
            hiddenWarehouseInventory,
            hiddenProductDraftForm,
            hiddenOperationsForms
          };
        }
      },
      {
        key: "unauthorized",
        persona: byKey.unauthorized,
        next: "/admin",
        checks: async (page) => {
          const afterLoginPath = page.url();
          await page.goto(`${baseUrl}/admin/products`, { waitUntil: "domcontentloaded" });
          const adminPath = page.url();
          await page.goto(`${baseUrl}/warehouse/inventory`, { waitUntil: "domcontentloaded" });
          const warehousePath = page.url();
          await page.goto(`${baseUrl}/operations`, { waitUntil: "domcontentloaded" });
          const operationsPath = page.url();
          return {
            afterLoginPath,
            adminPath,
            warehousePath,
            operationsPath,
            hiddenProductDraftForm: await count(page, '[data-product-table="mithron_products"]') === 0,
            hiddenWarehouseInventory: await count(page, "[data-inventory-system]") === 0,
            hiddenOperationsForms: await count(page, '[data-notifications-table="notifications"]') === 0
          };
        }
      }
    ];

    for (const plan of plans) {
      const context = await browser.newContext();
      const page = await context.newPage();
      try {
        await loginBrowser(page, plan.persona, plan.next);
        results[plan.key] = await plan.checks(page);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  return results;
}

async function validateUploadApi() {
  const response = await fetch(`${baseUrl}/api/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ marker })
  });
  return {
    status: response.ok ? "FAILED" : "VERIFIED_FAIL_CLOSED",
    httpStatus: response.status,
    statusText: response.statusText
  };
}

async function validatePolicyInventory() {
  const { body } = await restOk(
    "/rest/v1/rpc/current_enterprise_role",
    {
      method: "POST",
      body: JSON.stringify({})
    },
    serviceHeaders()
  ).catch(() => ({ body: null }));

  const policies = await restOk(
    "/rest/v1/role_permissions?select=role_key,permission_key&role_key=in.(admin,warehouse,supplier,user)&permission_key=in.(products.write,warehouse.write,orders.write,operations.write,settings.write,audit.read)"
  );
  return {
    currentEnterpriseRoleRpcCallableWithService: body !== null ? "VERIFIED" : "NOT_REQUIRED",
    rolePermissionRows: Array.isArray(policies.body) ? policies.body.length : 0
  };
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
    rlsCrud: {},
    uiBoundaries: {},
    serverActions: {},
    api: {},
    policyInventory: {},
    cleanupFailures: []
  };

  try {
    const provisioned = [];
    for (const persona of personas) {
      provisioned.push(await ensurePersonaUser(persona));
    }

    const signedIn = [];
    for (const persona of provisioned) {
      signedIn.push(await signIn(persona));
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

    results.rlsCrud = await validateCrudAndEscalation(byKey);
    results.uiBoundaries = await validateUiBoundaries(byKey);
    results.serverActions = await submitServerActionForms(byKey);
    results.api.uploadNoToken = await validateUploadApi();
    results.policyInventory = await validatePolicyInventory();

    await runCleanup(results);

    const authOk = Object.values(results.auth).every((entry) => String(entry.status).startsWith("VERIFIED"));
    const rlsOk = Object.values(results.rlsCrud).every((entry) => typeof entry === "string" ? entry === "VERIFIED" : String(entry.status).startsWith("VERIFIED"));
    const serverActionsOk = Object.values(results.serverActions).every((entry) => entry === "VERIFIED");
    const apiOk = results.api.uploadNoToken.status === "VERIFIED_FAIL_CLOSED";
    const uiOk =
      results.uiBoundaries.admin.productDraftForm === 1 &&
      results.uiBoundaries.admin.inventoryForm === 1 &&
      results.uiBoundaries.admin.orderFilterForm === 1 &&
      results.uiBoundaries.admin.orderStatusBoard === 1 &&
      results.uiBoundaries.admin.orderDetailPanel === 1 &&
      results.uiBoundaries.warehouse.inventorySystem >= 1 &&
      results.uiBoundaries.warehouse.inventoryTable >= 1 &&
      (results.uiBoundaries.warehouse.quickEditButtons === 0 || results.uiBoundaries.warehouse.quickEditForm >= 1) &&
      results.uiBoundaries.warehouse.orderForms === 1 &&
      results.uiBoundaries.warehouse.hiddenProductDraftForm === true &&
      results.uiBoundaries.edgeUser.hiddenWarehouseInventory === true &&
      results.uiBoundaries.edgeUser.hiddenProductDraftForm === true &&
      results.uiBoundaries.edgeUser.hiddenOperationsForms === true &&
      results.uiBoundaries.unauthorized.hiddenProductDraftForm === true &&
      results.uiBoundaries.unauthorized.hiddenWarehouseInventory === true &&
      results.uiBoundaries.unauthorized.hiddenOperationsForms === true;

    results.status = authOk && rlsOk && serverActionsOk && apiOk && uiOk && results.cleanupFailures.length === 0
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

main();
