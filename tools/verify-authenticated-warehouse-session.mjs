import crypto from "node:crypto";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const baseUrl = process.env.WAREHOUSE_HARDENING_BASE_URL ?? process.argv.find((arg) => arg.startsWith("--base-url="))?.slice("--base-url=".length);

const runId = process.env.WAREHOUSE_HARDENING_RUN_ID ?? `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const retainRows = ["1", "true", "yes"].includes(String(process.env.WAREHOUSE_HARDENING_RETAIN_ROWS ?? "").toLowerCase());
const generatedSku = `HARDENING-${runId}`.toUpperCase().replace(/[^A-Z0-9-]/g, "-").slice(0, 64);
const productSlug = process.env.WAREHOUSE_HARDENING_PRODUCT_SLUG ?? "source-agri-kisan-drone-small-8-liter";
const sku = process.env.WAREHOUSE_HARDENING_SKU ?? generatedSku;
const variantId = process.env.WAREHOUSE_HARDENING_VARIANT_ID ?? `hardening-${runId}`.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 64);
const warehouseCode = process.env.WAREHOUSE_HARDENING_WAREHOUSE ?? "VERIFY-WH";
const ownsGeneratedWarehouseRows = !process.env.WAREHOUSE_HARDENING_SKU && !process.env.WAREHOUSE_HARDENING_WAREHOUSE && !retainRows;
const marker = `${ownsGeneratedWarehouseRows ? "verified_reversible" : "verified_durable"}:${new Date().toISOString()}:${runId}`;

if (!url || !publishableKey || !serviceRoleKey) {
  console.error(JSON.stringify({
    status: "FAILED",
    reason: "Missing NEXT_PUBLIC_SUPABASE_URL, publishable key, or SUPABASE_SERVICE_ROLE_KEY."
  }, null, 2));
  process.exit(1);
}

const admin = createClient(url, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const publicAuthClient = createClient(url, publishableKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const serviceHeaders = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  "Content-Type": "application/json"
};

function authHeaders(accessToken) {
  return {
    apikey: publishableKey,
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json"
  };
}

function passwordForRun() {
  return process.env.WAREHOUSE_HARDENING_PASSWORD ?? `Mithron-${crypto.randomUUID()}-Aa1!`;
}

async function rest(path, options = {}, headers = serviceHeaders) {
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

async function serviceDelete(table, query) {
  const { response } = await rest(`/rest/v1/${table}?${query}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" }
  });
  return response.status;
}

async function findUserByEmail(email) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase());
    if (user) return user;
    if (data.users.length < 100) break;
  }
  return null;
}

async function upsertService(table, conflict, payload) {
  const { body } = await rest(`/rest/v1/${table}?on_conflict=${encodeURIComponent(conflict)}`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(payload)
  });
  return Array.isArray(body) ? body[0] : body;
}

async function createWarehouseVerificationUser() {
  const email = process.env.WAREHOUSE_HARDENING_EMAIL ?? "warehouse.hardening@example.com";
  const password = passwordForRun();

  let user = null;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: "warehouse" },
    user_metadata: {
      role: "warehouse",
      display_name: "Warehouse Hardening Verifier"
    }
  });

  if (created.error) {
    if (!/already|registered|exists/i.test(created.error.message)) {
      throw created.error;
    }
    user = await findUserByEmail(email);
    if (!user) throw created.error;
    const updated = await admin.auth.admin.updateUserById(user.id, {
      password,
      app_metadata: { ...(user.app_metadata ?? {}), role: "warehouse" },
      user_metadata: {
        ...(user.user_metadata ?? {}),
        role: "warehouse",
        display_name: "Warehouse Hardening Verifier"
      }
    });
    if (updated.error) throw updated.error;
    user = updated.data.user;
  } else {
    user = created.data.user;
  }

  if (!user?.id) throw new Error("Warehouse verification user creation did not return a user id.");

  await upsertService("profiles", "id", {
    id: user.id,
    email,
    display_name: "Warehouse Hardening Verifier",
    default_role: "warehouse",
    updated_at: new Date().toISOString()
  });

  await upsertService("user_roles", "user_id,role_key", {
    user_id: user.id,
    role_key: "warehouse"
  });

  return { email, password, userId: user.id };
}

async function signInWarehouseUser(credentials) {
  const { data, error } = await publicAuthClient.auth.signInWithPassword({
    email: credentials.email,
    password: credentials.password
  });
  if (error) throw error;
  if (!data.session?.access_token) throw new Error("Warehouse sign-in succeeded without an access token.");
  return data.session;
}

async function authRest(session, path, options = {}) {
  return rest(path, options, authHeaders(session.access_token));
}

async function authUpsert(session, table, conflict, payload) {
  const { body } = await authRest(session, `/rest/v1/${table}?on_conflict=${encodeURIComponent(conflict)}`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(payload)
  });
  return Array.isArray(body) ? body[0] : body;
}

async function authPatch(session, table, query, payload) {
  const { body } = await authRest(session, `/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload)
  });
  return Array.isArray(body) ? body[0] : body;
}

async function authInsert(session, table, payload) {
  const { body } = await authRest(session, `/rest/v1/${table}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload)
  });
  return Array.isArray(body) ? body[0] : body;
}

function statusForQuantity(quantity, threshold) {
  if (quantity <= 0) return "out_of_stock";
  if (quantity <= threshold) return "low_stock";
  return "available";
}

async function persistMovement(session, credentials, stock, movementType, before, after, reasonCode, notes) {
  return authInsert(session, "inventory_movements", {
    product_id: productSlug,
    sku,
    variant_id: variantId,
    warehouse_code: warehouseCode,
    warehouse_stock_id: stock.id,
    movement_type: movementType,
    quantity_delta: after - before,
    quantity_before: before,
    quantity_after: after,
    reason_code: reasonCode,
    notes: `${notes} | ${marker}`,
    actor_user_id: credentials.userId
  });
}

async function persistAuthenticatedWarehouseRows(session, credentials) {
  const reorderThreshold = 3;
  const stockQuery = `warehouse_code=eq.${encodeURIComponent(warehouseCode)}&product_slug=eq.${encodeURIComponent(productSlug)}&sku=eq.${encodeURIComponent(sku)}&select=*&limit=1`;
  const { body: existingRows } = await authRest(session, `/rest/v1/warehouse_stock?${stockQuery}`);
  const existing = Array.isArray(existingRows) ? existingRows[0] : null;
  const before = Number(existing?.available_quantity ?? 0);
  const received = before + 5;
  const corrected = received + 1;
  const damaged = Math.max(corrected - 1, 0);
  const returned = damaged + 1;
  const now = new Date().toISOString();

  await authUpsert(session, "inventory", "product_slug,sku", {
    product_slug: productSlug,
    sku,
    variant_id: variantId,
    quantity: received,
    reserved_quantity: 1,
    reorder_threshold: reorderThreshold,
    stock_status: statusForQuantity(received, reorderThreshold),
    updated_by: credentials.userId,
    updated_at: now
  });

  let stock = await authUpsert(session, "warehouse_stock", "warehouse_code,product_slug,sku", {
    warehouse_code: warehouseCode,
    product_slug: productSlug,
    sku,
    variant_id: variantId,
    available_quantity: received,
    committed_quantity: 1,
    last_counted_at: now,
    updated_by: credentials.userId,
    updated_at: now
  });

  const movements = [];
  movements.push(await persistMovement(session, credentials, stock, "stock_in", before, received, "authenticated_warehouse_stock_in", "Authenticated warehouse-user stock increase"));

  stock = await authPatch(session, "warehouse_stock", `id=eq.${encodeURIComponent(stock.id)}`, {
    available_quantity: corrected,
    updated_by: credentials.userId,
    updated_at: now
  });
  await authUpsert(session, "inventory", "product_slug,sku", {
    product_slug: productSlug,
    sku,
    variant_id: variantId,
    quantity: corrected,
    reserved_quantity: 1,
    reorder_threshold: reorderThreshold,
    stock_status: statusForQuantity(corrected, reorderThreshold),
    updated_by: credentials.userId,
    updated_at: now
  });
  movements.push(await persistMovement(session, credentials, stock, "correction", received, corrected, "authenticated_cycle_correction", "Authenticated warehouse-user inventory correction"));

  stock = await authPatch(session, "warehouse_stock", `id=eq.${encodeURIComponent(stock.id)}`, {
    available_quantity: damaged,
    updated_by: credentials.userId,
    updated_at: now
  });
  await authUpsert(session, "inventory", "product_slug,sku", {
    product_slug: productSlug,
    sku,
    variant_id: variantId,
    quantity: damaged,
    reserved_quantity: 1,
    reorder_threshold: reorderThreshold,
    stock_status: statusForQuantity(damaged, reorderThreshold),
    updated_by: credentials.userId,
    updated_at: now
  });
  movements.push(await persistMovement(session, credentials, stock, "damaged", corrected, damaged, "authenticated_damage_report", "Authenticated warehouse-user damage report"));

  stock = await authPatch(session, "warehouse_stock", `id=eq.${encodeURIComponent(stock.id)}`, {
    available_quantity: returned,
    updated_by: credentials.userId,
    updated_at: now
  });
  const inventory = await authUpsert(session, "inventory", "product_slug,sku", {
    product_slug: productSlug,
    sku,
    variant_id: variantId,
    quantity: returned,
    reserved_quantity: 1,
    reorder_threshold: reorderThreshold,
    stock_status: statusForQuantity(returned, reorderThreshold),
    updated_by: credentials.userId,
    updated_at: now
  });
  movements.push(await persistMovement(session, credentials, stock, "return", damaged, returned, "authenticated_return_received", "Authenticated warehouse-user return workflow"));

  const activity = await authInsert(session, "activity_logs", {
    actor_id: credentials.userId,
    action: "warehouse.authenticated_session_verified",
    entity_table: "warehouse_stock",
    entity_id: stock.id,
    severity: "info",
    metadata: {
      marker,
      product_slug: productSlug,
      sku,
      warehouse_code: warehouseCode,
      verification_mode: ownsGeneratedWarehouseRows ? "verified_reversible" : "verified_durable"
    }
  });

  return {
    status: "VERIFIED",
    marker,
    verificationMode: ownsGeneratedWarehouseRows ? "verified_reversible" : "verified_durable",
    runId,
    inventoryId: inventory.id,
    warehouseStockId: stock.id,
    movementCount: movements.length,
    movementIds: movements.map((movement) => movement.id).filter(Boolean),
    movementTypes: movements.map((movement) => movement.movement_type),
    activityLogId: activity.id,
    finalAvailableQuantity: returned
  };
}

async function cleanupAuthenticatedWarehouseRows(rows) {
  if (!ownsGeneratedWarehouseRows) {
    return {
      status: "RETAINED",
      reason: "WAREHOUSE_HARDENING_RETAIN_ROWS or explicit warehouse keys requested durable verifier rows."
    };
  }

  const filters = [
    ["inventory_movements", `sku=eq.${encodeURIComponent(sku)}&warehouse_code=eq.${encodeURIComponent(warehouseCode)}`],
    ["activity_logs", `id=eq.${encodeURIComponent(rows.activityLogId)}`],
    ["warehouse_stock", `warehouse_code=eq.${encodeURIComponent(warehouseCode)}&product_slug=eq.${encodeURIComponent(productSlug)}&sku=eq.${encodeURIComponent(sku)}`],
    ["inventory", `product_slug=eq.${encodeURIComponent(productSlug)}&sku=eq.${encodeURIComponent(sku)}`]
  ];

  const deleted = [];
  for (const [table, filter] of filters) {
    const status = await serviceDelete(table, filter);
    deleted.push({ table, status });
  }

  return {
    status: "VERIFIED",
    mode: "verified_reversible",
    sku,
    warehouseCode,
    deleted
  };
}

async function verifyRouteAccessWithBrowser(credentials) {
  if (!baseUrl) {
    return {
      status: "NOT_RUN",
      reason: "Set WAREHOUSE_HARDENING_BASE_URL or pass --base-url=http://127.0.0.1:PORT to verify browser middleware and session persistence."
    };
  }

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  async function routeDiagnostic(stage) {
    const bodyText = await page.locator("body").innerText({ timeout: 5000 }).catch((error) => `BODY_UNAVAILABLE: ${error.message}`);
    return {
      stage,
      url: page.url(),
      title: await page.title().catch(() => "TITLE_UNAVAILABLE"),
      bodyExcerpt: bodyText.slice(0, 800)
    };
  }
  try {
    await page.goto(`${baseUrl}/login?next=/warehouse/fulfillment`, { waitUntil: "networkidle" });
    await page.locator("input[type='email']").fill(credentials.email);
    await page.locator("input[type='password']").fill(credentials.password);
    await Promise.all([
      page.waitForURL((target) => target.pathname === "/warehouse/fulfillment", { timeout: 30000 }),
      page.locator("button[type='submit']").click()
    ]);
    await page.reload({ waitUntil: "networkidle" });
    try {
      await page.locator("[data-warehouse-fulfillment-route]").waitFor({ timeout: 15000 });
    } catch (error) {
      throw new Error(`Warehouse fulfillment controls did not render after login: ${JSON.stringify(await routeDiagnostic("warehouse_fulfillment"))}; ${error instanceof Error ? error.message : String(error)}`);
    }
    const warehouseUrl = page.url();

    await page.goto(`${baseUrl}/warehouse/orders`, { waitUntil: "networkidle" });
    try {
      await page.locator("[data-warehouse-orders-route]").waitFor({ timeout: 15000 });
    } catch (error) {
      throw new Error(`Warehouse orders controls did not render: ${JSON.stringify(await routeDiagnostic("warehouse_orders"))}; ${error instanceof Error ? error.message : String(error)}`);
    }

    await page.goto(`${baseUrl}/admin/cms`, { waitUntil: "networkidle" });
    const adminCmsBlocked = !page.url().includes("/admin/cms");

    return {
      status: adminCmsBlocked ? "VERIFIED" : "FAILED",
      loginPath: "/login?next=/warehouse/fulfillment",
      warehouseFulfillmentUrl: warehouseUrl,
      warehouseForms: "VERIFIED",
      ordersQueue: "VERIFIED",
      adminCmsIsolation: adminCmsBlocked ? "VERIFIED" : "FAILED",
      finalUrl: page.url()
    };
  } finally {
    await browser.close();
  }
}

async function main() {
  let authenticatedRows = null;
  let cleanup = { status: "NOT_RUN" };

  try {
    const credentials = await createWarehouseVerificationUser();
    const session = await signInWarehouseUser(credentials);
    authenticatedRows = await persistAuthenticatedWarehouseRows(session, credentials);
    const browser = await verifyRouteAccessWithBrowser(credentials);
    cleanup = await cleanupAuthenticatedWarehouseRows(authenticatedRows);

    const result = {
      status: browser.status === "FAILED" || cleanup.status === "FAILED" ? "FAILED" : "VERIFIED",
      user: {
        id: credentials.userId,
        email: credentials.email,
        role: "warehouse"
      },
      auth: {
        signInWithPassword: "VERIFIED",
        sessionPersistence: browser.status === "VERIFIED" ? "VERIFIED" : "NOT_VERIFIED_BROWSER_NOT_RUN",
        profiles: "VERIFIED",
        user_roles: "VERIFIED"
      },
      rbac: {
        warehouseRole: "warehouse",
        stockMutationPermissions: "VERIFIED",
        adminCmsIsolation: browser.adminCmsIsolation ?? "NOT_VERIFIED_BROWSER_NOT_RUN"
      },
      warehouse: authenticatedRows,
      cleanup,
      browser
    };

    console.log(JSON.stringify(result, null, 2));
    if (result.status !== "VERIFIED") process.exit(1);
  } catch (error) {
    if (authenticatedRows) {
      try {
        cleanup = await cleanupAuthenticatedWarehouseRows(authenticatedRows);
      } catch (cleanupError) {
        cleanup = {
          status: "FAILED",
          reason: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
        };
      }
    }

    console.error(JSON.stringify({
      status: "FAILED",
      reason: error instanceof Error ? error.message : String(error),
      cleanup
    }, null, 2));
    process.exit(1);
  }
}

main();
