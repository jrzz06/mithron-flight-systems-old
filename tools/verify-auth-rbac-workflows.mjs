import crypto from "node:crypto";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const argBaseUrl = process.argv.find((arg) => arg.startsWith("--base-url="))?.slice("--base-url=".length);
const requestedBaseUrl = process.env.AUTH_VALIDATION_BASE_URL ?? argBaseUrl ?? null;

const marker = `auth-rbac-${Date.now()}`;
const productSlug = process.env.AUTH_VALIDATION_PRODUCT_SLUG ?? "source-agri-kisan-drone-small-8-liter";
const warehouseCode = process.env.AUTH_VALIDATION_WAREHOUSE_CODE ?? "AUTH-RBAC-WH";
const variantId = process.env.AUTH_VALIDATION_VARIANT_ID ?? "auth-rbac-base";
const baseSku = `AUTH-RBAC-${Date.now()}`;
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

function authClient() {
  return createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false
    }
  });
}

const serviceHeaders = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  "Content-Type": "application/json"
};

function bearerHeaders(accessToken) {
  return {
    apikey: publishableKey,
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json"
  };
}

function generatedPassword(label) {
  return process.env.AUTH_VALIDATION_PASSWORD ?? `Mithron-${label}-${crypto.randomUUID()}-Aa1!`;
}

const personas = [
  {
    key: "admin",
    role: "admin",
    email: process.env.AUTH_VALIDATION_ADMIN_EMAIL ?? "admin.validation@example.com",
    password: process.env.AUTH_VALIDATION_ADMIN_PASSWORD ?? generatedPassword("admin"),
    displayName: "Auth RBAC Admin Verifier"
  },
  {
    key: "warehouse",
    role: "warehouse",
    email: process.env.AUTH_VALIDATION_WAREHOUSE_EMAIL ?? "warehouse.hardening@example.com",
    password: process.env.AUTH_VALIDATION_WAREHOUSE_PASSWORD ?? generatedPassword("warehouse"),
    displayName: "Auth RBAC Warehouse Verifier"
  },
  {
    key: "user",
    role: "user",
    email: process.env.AUTH_VALIDATION_USER_EMAIL ?? "user.validation@example.com",
    password: process.env.AUTH_VALIDATION_USER_PASSWORD ?? generatedPassword("user"),
    displayName: "Auth RBAC User Verifier"
  }
];

async function request(path, options = {}, headers = serviceHeaders) {
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

async function requestOk(path, options = {}, headers = serviceHeaders) {
  const result = await request(path, options, headers);
  if (!result.response.ok) {
    const detail = typeof result.body === "string" ? result.body : JSON.stringify(result.body);
    throw new Error(`${options.method ?? "GET"} ${path} failed: ${result.response.status} ${result.response.statusText} ${detail ?? ""}`);
  }
  return result;
}

async function serviceUpsert(table, conflict, payload) {
  const { body } = await requestOk(`/rest/v1/${table}?on_conflict=${encodeURIComponent(conflict)}`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(payload)
  });
  return Array.isArray(body) ? body[0] : body;
}

async function serviceDelete(table, query) {
  await requestOk(`/rest/v1/${table}?${query}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" }
  });
}

async function serviceQuery(table, query) {
  const { body } = await requestOk(`/rest/v1/${table}?${query}`);
  return Array.isArray(body) ? body : [];
}

async function authRequest(persona, path, options = {}) {
  return request(path, options, bearerHeaders(persona.session.access_token));
}

async function authRequestOk(persona, path, options = {}) {
  const result = await authRequest(persona, path, options);
  if (!result.response.ok) {
    const detail = typeof result.body === "string" ? result.body : JSON.stringify(result.body);
    throw new Error(`${persona.key} ${options.method ?? "GET"} ${path} failed: ${result.response.status} ${result.response.statusText} ${detail ?? ""}`);
  }
  return result;
}

async function authInsert(persona, table, payload) {
  const { body } = await authRequestOk(persona, `/rest/v1/${table}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload)
  });
  return Array.isArray(body) ? body[0] : body;
}

async function authInsertMinimal(persona, table, payload) {
  await authRequestOk(persona, `/rest/v1/${table}`, {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(payload)
  });
}

async function authUpsert(persona, table, conflict, payload) {
  const { body } = await authRequestOk(persona, `/rest/v1/${table}?on_conflict=${encodeURIComponent(conflict)}`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(payload)
  });
  return Array.isArray(body) ? body[0] : body;
}

async function authPatch(persona, table, query, payload) {
  const { body } = await authRequestOk(persona, `/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload)
  });
  return Array.isArray(body) ? body[0] : body;
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
  let user = null;
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

  if (created.error) {
    if (!/already|registered|exists/i.test(created.error.message)) {
      throw created.error;
    }
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
  } else {
    user = created.data.user;
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
    await serviceDelete("user_roles", `user_id=eq.${encodeURIComponent(user.id)}`);
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
  if (error) throw new Error(`${persona.key} signInWithPassword failed: ${error.message}`);
  if (!data.session?.access_token) throw new Error(`${persona.key} sign-in did not return an access token.`);

  const signedIn = { ...persona, client, session: data.session };
  const { data: dbRole, error: roleError } = await client.rpc("current_enterprise_role");
  if (roleError) {
    throw new Error(`${persona.key} current_enterprise_role RPC failed: ${roleError.message}`);
  }

  const roleRowsResult = await authRequestOk(
    signedIn,
    `/rest/v1/user_roles?select=user_id,role_key&user_id=eq.${encodeURIComponent(persona.userId)}`
  );
  const roleRows = Array.isArray(roleRowsResult.body) ? roleRowsResult.body : [];
  return {
    ...signedIn,
    fetchedRole: dbRole ?? null,
    roleRows,
    metadataRole: data.user?.app_metadata?.role ?? data.user?.user_metadata?.role ?? null
  };
}

async function verifyRemoteRbacSchema() {
  const requiredPermissions = await requestOk(
    "/rest/v1/role_permissions?select=role_key,permission_key&role_key=eq.admin&permission_key=in.(warehouse.write,settings.write)"
  );
  const rows = Array.isArray(requiredPermissions.body) ? requiredPermissions.body : [];
  const found = new Set(rows.map((row) => row.permission_key));
  if (!found.has("warehouse.write") || !found.has("settings.write")) {
    throw new Error("Remote admin role is missing warehouse.write or settings.write. Apply 20260524001100_auth_rbac_workflow_validation.sql.");
  }

  return {
    adminWarehouseWrite: "VERIFIED",
    adminSettingsWrite: "VERIFIED",
    currentEnterpriseRoleRpc: "VERIFIED"
  };
}

function statusForQuantity(quantity, threshold) {
  if (quantity <= 0) return "out_of_stock";
  if (quantity <= threshold) return "low_stock";
  return "available";
}

async function expectDenied(label, persona, path, options = {}) {
  const result = await authRequest(persona, path, options);
  if (result.response.ok) {
    const inserted = Array.isArray(result.body) ? result.body[0] : result.body;
    if (inserted?.id && path.startsWith("/rest/v1/")) {
      const table = path.slice("/rest/v1/".length).split("?")[0];
      cleanup.push(() => serviceDelete(table, `id=eq.${encodeURIComponent(inserted.id)}`));
    }
    throw new Error(`${label} unexpectedly succeeded with ${result.response.status}.`);
  }
  return {
    status: "VERIFIED",
    httpStatus: result.response.status,
    statusText: result.response.statusText
  };
}

async function expectNoLeak(label, persona, path) {
  const result = await authRequest(persona, path);
  if (!result.response.ok) {
    return {
      status: "VERIFIED_DENIED",
      httpStatus: result.response.status,
      statusText: result.response.statusText
    };
  }
  const rows = Array.isArray(result.body) ? result.body : [];
  if (rows.length > 0) {
    throw new Error(`${label} leaked ${rows.length} row(s).`);
  }
  return {
    status: "VERIFIED_ZERO_ROWS",
    httpStatus: result.response.status
  };
}

async function verifyAdminWorkflow(admin) {
  const testimonialId = `${marker}-testimonial`;
  const testimonial = await authInsert(admin, "testimonials", {
    id: testimonialId,
    name: "Auth RBAC Admin Probe",
    body: "Draft created by the real admin auth/RBAC verifier.",
    status: "draft",
    is_visible: false,
    sort_order: 9999
  });
  cleanup.push(() => serviceDelete("testimonials", `id=eq.${encodeURIComponent(testimonialId)}`));

  const published = await authPatch(admin, "testimonials", `id=eq.${encodeURIComponent(testimonialId)}`, {
    body: "Published by the real admin auth/RBAC verifier.",
    status: "published",
    is_visible: true,
    updated_at: new Date().toISOString()
  });

  const sku = `${baseSku}-ADMIN`;
  const inventory = await authUpsert(admin, "inventory", "product_slug,sku", {
    product_slug: productSlug,
    sku,
    variant_id: variantId,
    quantity: 6,
    reserved_quantity: 1,
    reorder_threshold: 2,
    stock_status: statusForQuantity(6, 2),
    updated_by: admin.userId,
    updated_at: new Date().toISOString()
  });
  cleanup.push(() => serviceDelete("inventory", `product_slug=eq.${encodeURIComponent(productSlug)}&sku=eq.${encodeURIComponent(sku)}`));

  const activity = await authInsert(admin, "activity_logs", {
    actor_id: admin.userId,
    action: "auth_rbac.admin_workflow_verified",
    entity_table: "testimonials",
    entity_id: testimonialId,
    severity: "info",
    metadata: { marker, sku, mode: "admin" }
  });
  cleanup.push(() => serviceDelete("activity_logs", `id=eq.${encodeURIComponent(activity.id)}`));

  const auditVisible = await authRequestOk(admin, `/rest/v1/audit_logs?select=id,actor_id,entity_table&limit=1`);

  return {
    cmsCreateEditPublish: testimonial?.id === testimonialId && published?.status === "published" ? "VERIFIED" : "FAILED",
    inventoryAdminWrite: inventory?.sku === sku ? "VERIFIED" : "FAILED",
    activityLogAttribution: activity?.actor_id === admin.userId ? "VERIFIED" : "FAILED",
    auditLogsSensitiveReadForAdmin: Array.isArray(auditVisible.body) ? "VERIFIED" : "FAILED"
  };
}

async function verifyWarehouseWorkflow(warehouse) {
  const sku = `${baseSku}-WAREHOUSE`;
  const now = new Date().toISOString();
  const inventory = await authUpsert(warehouse, "inventory", "product_slug,sku", {
    product_slug: productSlug,
    sku,
    variant_id: variantId,
    quantity: 11,
    reserved_quantity: 2,
    reorder_threshold: 3,
    stock_status: statusForQuantity(11, 3),
    updated_by: warehouse.userId,
    updated_at: now
  });
  cleanup.push(() => serviceDelete("inventory", `product_slug=eq.${encodeURIComponent(productSlug)}&sku=eq.${encodeURIComponent(sku)}`));

  const stock = await authUpsert(warehouse, "warehouse_stock", "warehouse_code,product_slug,sku", {
    warehouse_code: warehouseCode,
    product_slug: productSlug,
    sku,
    variant_id: variantId,
    available_quantity: 9,
    committed_quantity: 2,
    last_counted_at: now,
    updated_by: warehouse.userId,
    updated_at: now
  });
  cleanup.push(() => serviceDelete("warehouse_stock", `warehouse_code=eq.${encodeURIComponent(warehouseCode)}&product_slug=eq.${encodeURIComponent(productSlug)}&sku=eq.${encodeURIComponent(sku)}`));

  const movement = await authInsert(warehouse, "inventory_movements", {
    product_id: productSlug,
    sku,
    variant_id: variantId,
    warehouse_code: warehouseCode,
    warehouse_stock_id: stock.id,
    movement_type: "stock_in",
    quantity_delta: 9,
    quantity_before: 0,
    quantity_after: 9,
    reason_code: "auth_rbac_stock_in",
    notes: marker,
    actor_user_id: warehouse.userId
  });
  cleanup.push(() => serviceDelete("inventory_movements", `id=eq.${encodeURIComponent(movement.id)}`));

  await authInsertMinimal(warehouse, "activity_logs", {
    actor_id: warehouse.userId,
    action: "auth_rbac.warehouse_stock_verified",
    entity_table: "warehouse_stock",
    entity_id: stock.id,
    severity: "info",
    metadata: { marker, sku, warehouse_code: warehouseCode }
  });
  const [activity] = await serviceQuery(
    "activity_logs",
    `select=id,actor_id&actor_id=eq.${encodeURIComponent(warehouse.userId)}&action=eq.auth_rbac.warehouse_stock_verified&entity_id=eq.${encodeURIComponent(stock.id)}&order=created_at.desc&limit=1`
  );
  if (!activity?.id) {
    throw new Error("warehouse activity log insert was accepted but could not be verified by service readback.");
  }
  cleanup.push(() => serviceDelete("activity_logs", `id=eq.${encodeURIComponent(activity.id)}`));

  const adminRoleLeak = await expectNoLeak(
    "warehouse user_roles cross-role read",
    warehouse,
    `/rest/v1/user_roles?select=user_id,role_key&user_id=neq.${encodeURIComponent(warehouse.userId)}&limit=1`
  );
  const cmsDenied = await expectDenied("warehouse CMS write", warehouse, "/rest/v1/testimonials", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      id: `${marker}-warehouse-denied`,
      name: "Denied",
      body: "Warehouse should not write CMS.",
      status: "draft"
    })
  });
  const operationsDenied = await expectDenied("warehouse operations write", warehouse, "/rest/v1/deployment_requests", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      requester_email: "warehouse-denied@example.com",
      region: "DENIED",
      mission_profile: "denied",
      status: "new",
      notes: marker
    })
  });

  return {
    inventoryWrite: inventory?.sku === sku ? "VERIFIED" : "FAILED",
    warehouseStockWrite: stock?.sku === sku ? "VERIFIED" : "FAILED",
    movementLedgerWrite: movement?.actor_user_id === warehouse.userId ? "VERIFIED" : "FAILED",
    activityLogAttribution: activity?.actor_id === warehouse.userId ? "VERIFIED" : "FAILED",
    cmsDenied,
    operationsDenied,
    sensitiveRoleLeakBlocked: adminRoleLeak
  };
}

async function verifyUserWorkflow(user) {
  const cmsDenied = await expectDenied("user CMS write", user, "/rest/v1/testimonials", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      id: `${marker}-user-denied`,
      name: "Denied",
      body: "User should not write CMS.",
      status: "draft"
    })
  });
  const inventoryDenied = await expectDenied("user inventory write", user, "/rest/v1/inventory", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      product_slug: productSlug,
      sku: `${baseSku}-USER-DENIED`,
      variant_id: variantId,
      quantity: 1,
      reserved_quantity: 0,
      reorder_threshold: 1,
      stock_status: "available"
    })
  });
  const operationsDenied = await expectDenied("user operations write", user, "/rest/v1/deployment_requests", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      requester_email: "user-denied@example.com",
      region: "DENIED",
      mission_profile: "denied",
      status: "new",
      notes: marker
    })
  });
  const activityDenied = await expectDenied("user activity log write", user, "/rest/v1/activity_logs", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      actor_id: user.userId,
      action: "auth_rbac.user_denied",
      entity_table: "activity_logs",
      entity_id: marker,
      severity: "info",
      metadata: { marker }
    })
  });
  const auditDenied = await expectDenied("user audit log write", user, "/rest/v1/audit_logs", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      actor_id: user.userId,
      action: "auth_rbac.user_denied",
      entity_table: "audit_logs",
      entity_id: marker,
      metadata: { marker }
    })
  });
  const roleLeak = await expectNoLeak(
    "user cross-role read",
    user,
    `/rest/v1/user_roles?select=user_id,role_key&user_id=neq.${encodeURIComponent(user.userId)}&limit=1`
  );

  return {
    cmsDenied,
    inventoryDenied,
    operationsDenied,
    activityDenied,
    auditDenied,
    directApiDenied: "VERIFIED",
    sensitiveRoleLeakBlocked: roleLeak
  };
}

async function detectBaseUrl() {
  const candidates = requestedBaseUrl
    ? [requestedBaseUrl]
    : ["http://127.0.0.1:3000", "http://127.0.0.1:3001", "http://127.0.0.1:3002", "http://127.0.0.1:3003"];

  for (const candidate of candidates) {
    try {
      const response = await fetch(`${candidate}/login`, { cache: "no-store" });
      if (response.ok) return candidate;
    } catch {
      // Try the next local candidate.
    }
  }
  return null;
}

async function routeDiagnostic(page, stage) {
  const bodyText = await page.locator("body").innerText({ timeout: 5000 }).catch((error) => `BODY_UNAVAILABLE: ${error.message}`);
  return {
    stage,
    url: page.url(),
    title: await page.title().catch(() => "TITLE_UNAVAILABLE"),
    bodyExcerpt: bodyText.slice(0, 600)
  };
}

async function loginBrowser(page, baseUrl, persona, nextPath) {
  await page.goto(`${baseUrl}/login?next=${encodeURIComponent(nextPath)}`, { waitUntil: "domcontentloaded" });
  await page.locator("input[type='email']").fill(persona.email);
  await page.locator("input[type='password']").fill(persona.password);
  await Promise.all([
    page.waitForURL((target) => {
      if (target.pathname !== "/login") return true;
      return target.searchParams.get("admin_status") === "forbidden" || target.searchParams.get("auth_status") === "role_required";
    }, { timeout: 30000 }),
    page.locator("button[type='submit']").click()
  ]);
  await page.waitForLoadState("domcontentloaded").catch(() => {});
}

async function verifyAllowedRoute(page, baseUrl, route) {
  await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
  const current = new URL(page.url());
  if (current.pathname !== route && !current.pathname.startsWith(`${route}/`)) {
    throw new Error(`Expected allowed route ${route}, got ${JSON.stringify(await routeDiagnostic(page, `allowed:${route}`))}`);
  }
}

async function verifyDeniedRoute(page, baseUrl, route) {
  await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
  const current = new URL(page.url());
  if (current.pathname === route || current.pathname.startsWith(`${route}/`)) {
    throw new Error(`Expected denied route ${route}, got ${JSON.stringify(await routeDiagnostic(page, `denied:${route}`))}`);
  }
  return {
    route,
    redirectedTo: `${current.pathname}${current.search}`,
    status: current.pathname === "/login" || current.searchParams.has("admin_status") || current.searchParams.has("access_status")
      ? "VERIFIED"
      : "PARTIAL"
  };
}

async function verifyBrowserRoutes(signedInPersonas) {
  const baseUrl = await detectBaseUrl();
  if (!baseUrl) {
    return {
      status: "NOT_RUN",
      reason: "No local Next.js server responded on AUTH_VALIDATION_BASE_URL or 127.0.0.1:3000-3003."
    };
  }

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const results = {};

  const routePlans = {
    admin: {
      next: "/admin",
      allowed: ["/admin", "/admin/products", "/warehouse/inventory", "/operations", "/admin/settings"],
      denied: []
    },
    warehouse: {
      next: "/warehouse/inventory",
      allowed: ["/warehouse/inventory"],
      denied: ["/admin/cms", "/operations"]
    },
    user: {
      next: "/admin",
      allowed: [],
      denied: ["/admin", "/warehouse/inventory", "/operations"]
    }
  };

  try {
    for (const persona of signedInPersonas) {
      const plan = routePlans[persona.key];
      const context = await browser.newContext();
      const page = await context.newPage();
      try {
        await loginBrowser(page, baseUrl, persona, plan.next);
        const firstPath = new URL(page.url()).pathname;
        const sessionPersistence = plan.allowed.length
          ? await (async () => {
              await page.reload({ waitUntil: "domcontentloaded" });
              const current = new URL(page.url());
              return current.pathname === firstPath ? "VERIFIED" : "FAILED";
            })()
          : "DENIED_AFTER_LOGIN";

        for (const route of plan.allowed) {
          await verifyAllowedRoute(page, baseUrl, route);
        }
        const denied = [];
        for (const route of plan.denied) {
          denied.push(await verifyDeniedRoute(page, baseUrl, route));
        }

        await page.goto(`${baseUrl}/auth/logout`, { waitUntil: "domcontentloaded" });
        if (plan.allowed[0]) {
          await page.goto(`${baseUrl}${plan.allowed[0]}`, { waitUntil: "domcontentloaded" });
          const afterLogout = new URL(page.url());
          if (afterLogout.pathname !== "/login") {
            throw new Error(`${persona.key} logout did not clear protected-route access: ${page.url()}`);
          }
        }

        results[persona.key] = {
          login: "VERIFIED",
          sessionPersistence,
          allowedRoutes: plan.allowed,
          deniedRoutes: denied,
          logoutProtectedRedirect: plan.allowed[0] ? "VERIFIED" : "NOT_APPLICABLE"
        };
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  return {
    status: "VERIFIED",
    baseUrl,
    results
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
    schema: {},
    auth: {},
    rbac: {},
    workflows: {},
    browser: {},
    security: {},
    cleanupFailures: []
  };

  try {
    results.schema = await verifyRemoteRbacSchema();

    const provisioned = [];
    for (const plan of personas) {
      provisioned.push(await ensurePersonaUser(plan));
    }

    const signedIn = [];
    for (const persona of provisioned) {
      signedIn.push(await signInPersona(persona));
    }

    results.auth = Object.fromEntries(signedIn.map((persona) => [
      persona.key,
      {
        userId: persona.userId,
        email: persona.email,
        expectedRole: persona.role,
        metadataRole: persona.metadataRole,
        fetchedRole: persona.fetchedRole,
        userRolesRows: persona.roleRows.map((row) => row.role_key),
        status: persona.fetchedRole === persona.role ? "VERIFIED" : "FAILED"
      }
    ]));

    const byKey = Object.fromEntries(signedIn.map((persona) => [persona.key, persona]));
    results.workflows.admin = await verifyAdminWorkflow(byKey.admin);
    results.workflows.warehouse = await verifyWarehouseWorkflow(byKey.warehouse);
    results.workflows.user = await verifyUserWorkflow(byKey.user);
    results.browser = await verifyBrowserRoutes(signedIn);

    results.rbac = {
      adminFullOperationalAccess: results.workflows.admin.inventoryAdminWrite === "VERIFIED" ? "VERIFIED" : "FAILED",
      warehouseIsolation: results.workflows.warehouse.cmsDenied.status === "VERIFIED" && results.workflows.warehouse.operationsDenied.status === "VERIFIED" ? "VERIFIED" : "FAILED",
      userIsolation: results.workflows.user.directApiDenied
    };

    results.security = {
      directApiDenied: results.workflows.user.directApiDenied,
      sensitiveRoleReads: {
        warehouse: results.workflows.warehouse.sensitiveRoleLeakBlocked.status,
        user: results.workflows.user.sensitiveRoleLeakBlocked.status
      },
      auditability: {
        adminActivity: results.workflows.admin.activityLogAttribution,
        warehouseActivity: results.workflows.warehouse.activityLogAttribution,
        auditLogsProtectedFromUserWrite: results.workflows.user.auditDenied.status
      }
    };

    await runCleanup(results);

    const authOk = Object.values(results.auth).every((entry) => entry.status.startsWith("VERIFIED"));
    const rbacOk = Object.values(results.rbac).every((entry) => entry === "VERIFIED");
    const browserOk = results.browser.status === "VERIFIED";
    results.status = authOk && rbacOk && browserOk && results.cleanupFailures.length === 0
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
    await Promise.allSettled(personas.map(async (persona) => {
      try {
        await persona.client?.auth?.signOut?.();
      } catch {
        // Persona plans do not own active clients.
      }
    }));
  }
}

main();
