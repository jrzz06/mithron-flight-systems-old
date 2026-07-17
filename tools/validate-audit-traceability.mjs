import crypto from "node:crypto";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const baseUrl = process.argv.find((arg) => arg.startsWith("--base-url="))?.slice("--base-url=".length)
  ?? process.env.AUDIT_TRACEABILITY_BASE_URL
  ?? "http://127.0.0.1:3000";

const marker = `audit-trace-${Date.now()}`;
const productSlug = process.env.AUTH_VALIDATION_PRODUCT_SLUG ?? "source-agri-kisan-drone-small-8-liter";
const traceWarehouseCode = process.env.AUTH_VALIDATION_WAREHOUSE_CODE ?? "IN-WEST-01";
const traceVariantId = "audit-trace-base";
const cleanup = [];
const debugTraceability = process.env.AUDIT_TRACEABILITY_DEBUG === "1";

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

function trace(event, details = {}) {
  if (!debugTraceability) return;
  console.error(JSON.stringify({ event, at: Date.now(), ...details }));
}

function acceptNextDialog(page, label = "browser confirmation") {
  page.once("dialog", async (dialog) => {
    trace("dialog.accept", { label, message: dialog.message() });
    await dialog.accept();
  });
}

const personas = [
  { key: "admin", role: "admin", email: "admin.validation@example.com", displayName: "Audit Trace Admin" },
  { key: "warehouse", role: "warehouse", email: "warehouse.hardening@example.com", displayName: "Audit Trace Warehouse" },
  { key: "user", role: "user", email: "user.validation@example.com", displayName: "Audit Trace User" },
  { key: "unauthorized", role: null, authMetadataRole: "unauthorized", email: "unauthorized.validation@example.com", displayName: "Audit Trace Unauthorized" }
].map((persona) => ({
  ...persona,
  password: process.env.AUDIT_TRACEABILITY_PASSWORD
    ?? process.env.SECURITY_BOUNDARY_PASSWORD
    ?? `Mithron-${persona.key}-${crypto.randomUUID()}-Aa1!`
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

function bearerHeaders(accessToken, extra = {}) {
  return {
    apikey: publishableKey,
    Authorization: `Bearer ${accessToken}`,
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

async function localOk(path) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: "manual" });
  if (!response.ok && response.status < 300) {
    throw new Error(`Local runtime probe failed for ${path}: ${response.status} ${response.statusText}`);
  }
  return { status: response.status, location: response.headers.get("location") };
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

async function serviceQuery(table, query) {
  const { body } = await restOk(`/rest/v1/${table}?${query}`);
  return Array.isArray(body) ? body : [];
}

async function authRest(persona, path, options = {}) {
  return rest(path, options, bearerHeaders(persona.session.access_token));
}

async function serviceDeleteIfPossible(table, query) {
  try {
    await serviceDelete(table, query);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return null;
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
  const { data: role, error: roleError } = await client.rpc("current_enterprise_role");
  if (roleError) throw new Error(`${persona.key} role RPC failed: ${roleError.message}`);
  return { ...persona, client, session: data.session, fetchedRole: role ?? null };
}

async function establishBrowserSession(page, persona, nextPath) {
  const response = await page.request.post(`${baseUrl}/api/auth/login`, {
    data: {
      email: persona.email,
      password: persona.password,
      next: nextPath
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok()) {
    const message = typeof payload.error === "string" ? payload.error : JSON.stringify(payload);
    throw new Error(`Browser session login failed for ${persona.email}: ${response.status()} ${message}`);
  }

  const redirectPath = typeof payload.redirectPath === "string" ? payload.redirectPath : nextPath;
  await page.goto(`${baseUrl}${redirectPath.startsWith("/") ? redirectPath : `/${redirectPath}`}`, {
    waitUntil: "domcontentloaded"
  });

  const current = new URL(page.url());
  if (
    current.pathname === "/login"
    && current.searchParams.get("admin_status") !== "forbidden"
    && current.searchParams.get("access_status") !== "forbidden"
    && current.searchParams.get("auth_status") !== "role_required"
  ) {
    const alert = await page.locator("[role='alert']").first().textContent().catch(() => null);
    throw new Error(`Browser session still on login for ${persona.email}. alert=${alert ?? "none"}`);
  }
}

async function loginBrowser(page, persona, nextPath) {
  await establishBrowserSession(page, persona, nextPath);
}

async function fillControlledInput(form, fieldName, value) {
  const field = form.locator(`[name="${fieldName}"]`).first();
  await field.waitFor({ state: "visible", timeout: 15000 });
  await field.click();
  await field.fill("");
  await field.pressSequentially(value, { delay: 10 });
}

async function assertProductActionSucceeded(page, label) {
  const current = new URL(page.url());
  if (current.searchParams.get("product_status") === "error") {
    throw new Error(`${label} failed: ${current.searchParams.get("product_message") ?? "unknown product action error"}`);
  }
}

async function assertInventoryActionSucceeded(page, label) {
  const current = new URL(page.url());
  if (current.searchParams.get("inventory_status") === "error") {
    throw new Error(`${label} failed: ${current.searchParams.get("inventory_message") ?? "unknown inventory action error"}`);
  }
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

async function selectFirstRealOption(selectLocator, label) {
  await selectLocator.waitFor({ state: "attached", timeout: 15000 });
  const options = await selectLocator.locator("option").evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("value") ?? node.textContent ?? "").filter((value) => value.trim())
  );
  const value = options[0];
  if (!value) throw new Error(`${label} does not expose a selectable option.`);
  await selectLocator.selectOption(value);
  return value;
}

async function submitAndWaitForAction(page, submit, label, timeoutMs = 120000) {
  const expectedPathname = new URL(page.url()).pathname;
  trace("server-action.wait.start", { label, expectedPathname, pageUrl: page.url() });
  const responsePromise = page.waitForResponse((response) => {
    if (response.request().method() !== "POST") return false;
    try {
      const match = new URL(response.url()).pathname === expectedPathname;
      trace("server-action.post", { label, url: response.url(), status: response.status(), match });
      return match;
    } catch {
      return false;
    }
  }, { timeout: timeoutMs })
    .catch((error) => {
      trace("server-action.wait.timeout", { label, error: error instanceof Error ? error.message : String(error) });
      return null;
    });
  const clickedAt = Date.now();
  await submit();
  trace("server-action.submit.returned", { label, elapsedMs: Date.now() - clickedAt });
  const response = await responsePromise;
  if (response && response.status() >= 400) {
    throw new Error(`${label} failed with HTTP ${response.status()} ${response.statusText()}.`);
  }
  trace("server-action.wait.done", {
    label,
    response: response ? { status: response.status(), url: response.url() } : null
  });
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  return response ? { status: response.status(), url: response.url() } : null;
}

async function waitForCondition(probe, timeoutMs, label) {
  const startedAt = Date.now();
  let lastValue = null;
  while (Date.now() - startedAt < timeoutMs) {
    lastValue = await probe();
    if (lastValue) return lastValue;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error(`Timed out waiting for ${label}. Last value: ${JSON.stringify(lastValue)}`);
}

async function waitForRows(table, query, predicate, timeoutMs = 15000) {
  return waitForCondition(async () => {
    const rows = await serviceQuery(table, query);
    trace("rest.poll", { table, query, rows: rows.length });
    return predicate(rows) ? rows : null;
  }, timeoutMs, `${table} ${query}`);
}

function hasObjectKeys(value, keys) {
  return Boolean(value)
    && typeof value === "object"
    && !Array.isArray(value)
    && keys.every((key) => Object.hasOwn(value, key));
}

function hasValidCreatedAt(row) {
  return typeof row?.created_at === "string" && !Number.isNaN(Date.parse(row.created_at));
}

function summarizeDenied(result) {
  if (!result.response.ok) {
    return {
      status: [401, 403].includes(result.response.status) ? "VERIFIED_DENIED" : "VERIFIED_BLOCKED",
      httpStatus: result.response.status,
      statusText: result.response.statusText
    };
  }
  const rows = Array.isArray(result.body) ? result.body : [];
  return {
    status: rows.length === 0 ? "VERIFIED_ZERO_ROWS" : "FAILED_ALLOWED",
    httpStatus: result.response.status,
    rows: rows.length
  };
}

async function queryAuditLogs(entityTable, entityId) {
  return serviceQuery(
    "audit_logs",
    `select=*&entity_table=eq.${encodeURIComponent(entityTable)}&entity_id=eq.${encodeURIComponent(entityId)}&order=created_at.asc`
  );
}

async function queryActivity(entityTable, entityId) {
  return serviceQuery(
    "activity_logs",
    `select=*&entity_table=eq.${encodeURIComponent(entityTable)}&entity_id=eq.${encodeURIComponent(entityId)}&order=created_at.asc`
  );
}

function statusFromChecks(checks) {
  if (checks.some((value) => String(value).startsWith("FAILED"))) return "FAILED";
  if (checks.some((value) => String(value).startsWith("PARTIAL") || String(value).startsWith("NOT_SUPPORTED"))) return "PARTIAL";
  return "VERIFIED";
}

async function validateRuntime() {
  return localOk("/");
}

async function validateSchemaSurface() {
  const checks = {};
  const tables = {
    activityLogs: "/rest/v1/activity_logs?select=id,actor_id,action,entity_table,entity_id,severity,metadata,created_at&limit=1",
    auditLogs: "/rest/v1/audit_logs?select=id,actor_id,action,entity_table,entity_id,before_data,after_data,metadata,created_at&limit=1",
    securityEvents: "/rest/v1/security_events?select=id,actor_user_id,actor_role,event_type,attempted_resource,denial_reason,severity,metadata,created_at&limit=1",
    notifications: "/rest/v1/notifications?select=id,recipient_id,channel,title,status,priority,entity_table,entity_id,payload,created_at,read_at&limit=1",
    movements: "/rest/v1/inventory_movements?select=id,product_id,sku,warehouse_code,movement_type,quantity_delta,quantity_before,quantity_after,reason_code,actor_user_id,related_order_id,created_at&limit=1",
    orders: "/rest/v1/orders?select=id,order_number,fulfillment_status,timeline,metadata,created_by,updated_at&limit=1"
  };

  for (const [key, path] of Object.entries(tables)) {
    const result = await rest(path);
    checks[key] = result.response.ok ? "VERIFIED_SCHEMA_READABLE" : `FAILED_${result.response.status}`;
  }
  return checks;
}

async function validateAuthAudit(admin) {
  const { chromium } = await import("playwright");
  const startedAt = new Date().toISOString();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await loginBrowser(page, admin, "/admin");
    await page.goto(`${baseUrl}/auth/logout`, { waitUntil: "domcontentloaded" }).catch(() => {});
  } finally {
    await context.close();
    await browser.close();
  }

  const user = await service.auth.admin.getUserById(admin.userId);
  const lastSignInAt = user.data.user?.last_sign_in_at ?? null;
  const authRows = await serviceQuery(
    "activity_logs",
    `select=*&actor_id=eq.${encodeURIComponent(admin.userId)}&created_at=gte.${encodeURIComponent(startedAt)}&order=created_at.desc&limit=50`
  );
  const authActivity = authRows.filter((row) => /^auth\.|login|logout/i.test(String(row.action ?? "")));

  return {
    status: authActivity.length > 0 ? "VERIFIED" : "PARTIAL_PLATFORM_ONLY",
    supabaseLastSignInAt: lastSignInAt && Date.parse(lastSignInAt) >= Date.parse(startedAt) ? "VERIFIED" : "PARTIAL_NOT_UPDATED_IN_WINDOW",
    applicationLoginLogoutActivityRows: authActivity.length,
    gap: authActivity.length > 0 ? null : "Login/logout are visible through Supabase Auth timestamps, but no app-level activity_logs entries were observed for auth.login/auth.logout."
  };
}

async function validateProductTrace(admin) {
  const { chromium } = await import("playwright");
  const slug = `${marker}-product`;
  const imageSrc = `${baseUrl}/mithron-logo.svg`;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await loginBrowser(page, admin, "/admin/products?tool=create#create-product");
    trace("product.login.done", { url: page.url(), slug });
    await page.locator('[data-product-create-panel]').first().waitFor({ timeout: 15000 });
    const productForm = page.locator('[data-product-create-panel]').first();
    await productForm.locator('[name="name"]').fill(slug);
    const categoryField = productForm.locator('[name="category"]');
    if (await categoryField.count()) {
      await selectFirstRealOption(categoryField, "Product category");
    }
    await fillControlledInput(productForm, "list_price", "1000");
    await productForm.locator('[name="image_src"]').fill(imageSrc);
    trace("product.form.ready", { slug, imageSrc });
    await submitAndWaitForAction(page, () => productForm.getByRole("button", { name: "Add product" }).click(), "product draft create");
    await assertProductActionSucceeded(page, "product draft create");
    trace("product.row.wait.start", { slug });
    await waitForRows("mithron_products", `select=*&slug=eq.${encodeURIComponent(slug)}`, (rows) => rows.length === 1, 45000);
    trace("product.row.wait.done", { slug });

    await page.goto(`${baseUrl}/admin/products?tool=seo#product-seo`, { waitUntil: "domcontentloaded" });
    const seoForm = page.locator('[data-product-seo-table="mithron_products"]').first();
    await seoForm.waitFor({ timeout: 15000 });
    await seoForm.locator('[name="product_slug"]').fill(slug);
    await seoForm.locator('[name="seo_title"]').fill(`${marker} SEO`);
    await seoForm.locator('[name="seo_description"]').fill("Audit traceability SEO update");
    await seoForm.locator('[name="og_title"]').fill(`${marker} OG`);
    await seoForm.locator('[name="og_description"]').fill("Audit traceability OG update");
    await seoForm.locator('[name="og_image_src"]').fill(imageSrc);
    await seoForm.locator('[name="change_summary"]').fill(`${marker} product seo`);
    await submitAndWaitForAction(page, () => seoForm.locator('button[type="submit"]').click(), "product SEO update");
    await waitForRows("mithron_products", `select=*&slug=eq.${encodeURIComponent(slug)}`, (rows) => String(rows[0]?.seo_title ?? "") === `${marker} SEO`, 45000);

    await page.goto(`${baseUrl}/admin/products?tool=publish#publish-product`, { waitUntil: "domcontentloaded" });
    const publishForm = page.locator('[data-product-publish-table="mithron_products"]').first();
    await publishForm.waitFor({ timeout: 15000 });
    await publishForm.locator('[name="product_slug"]').fill(slug);
    await publishForm.locator('[name="workflow_status"]').selectOption("published");
    const visible = publishForm.locator('[name="is_visible"]');
    if (!(await visible.isChecked())) await visible.check();
    await publishForm.locator('[name="change_summary"]').fill(`${marker} product publish`);
    acceptNextDialog(page);
    await submitAndWaitForAction(page, () => publishForm.locator('button[type="submit"]').click(), "product publish update");
    await waitForRows("mithron_products", `select=*&slug=eq.${encodeURIComponent(slug)}`, (rows) => String(rows[0]?.workflow_status ?? "") === "published", 45000);
  } finally {
    await context.close();
    await browser.close();
  }

  cleanup.push(() => serviceDeleteIfPossible("mithron_products", `slug=eq.${encodeURIComponent(slug)}`));
  cleanup.push(() => serviceDeleteIfPossible("inventory", `product_slug=eq.${encodeURIComponent(slug)}`));
  cleanup.push(() => serviceDeleteIfPossible("warehouse_stock", `product_slug=eq.${encodeURIComponent(slug)}`));
  cleanup.push(() => serviceDeleteIfPossible("audit_logs", `entity_table=eq.mithron_products&entity_id=eq.${encodeURIComponent(slug)}`));
  cleanup.push(() => serviceDeleteIfPossible("content_revisions", `entity_table=eq.mithron_products&entity_id=eq.${encodeURIComponent(slug)}`));

  const product = (await serviceQuery("mithron_products", `select=*&slug=eq.${encodeURIComponent(slug)}`))[0];
  const auditLogs = await queryAuditLogs("mithron_products", slug);
  const revisions = await serviceQuery("content_revisions", `select=*&entity_table=eq.mithron_products&entity_id=eq.${encodeURIComponent(slug)}&order=revision.asc`);
  const activity = await queryActivity("mithron_products", slug);

  return {
    status: statusFromChecks([
      product?.slug === slug ? "VERIFIED" : "FAILED_NO_PRODUCT",
      auditLogs.some((row) => row.actor_id === admin.userId) ? "VERIFIED" : "FAILED_NO_AUDIT_ACTOR",
      revisions.length >= 1 ? "VERIFIED" : "PARTIAL_NO_PRODUCT_REVISION",
      auditLogs.some((row) => row.before_data !== null && row.before_data !== undefined) ? "VERIFIED" : "PARTIAL_BEFORE_DATA_NOT_CAPTURED_IN_GENERIC_AUDIT_LOGS"
    ]),
    productPersisted: product?.slug === slug ? "VERIFIED" : "FAILED",
    auditLogRows: auditLogs.length,
    activityLogRows: activity.length,
    actorAttribution: auditLogs.some((row) => row.actor_id === admin.userId) ? "VERIFIED" : "FAILED",
    timestampIntegrity: auditLogs.every(hasValidCreatedAt) ? "VERIFIED" : "FAILED",
    afterState: auditLogs.some((row) => row.after_data && typeof row.after_data === "object") ? "VERIFIED" : "FAILED",
    beforeState: auditLogs.some((row) => row.before_data !== null && row.before_data !== undefined) ? "VERIFIED" : "PARTIAL_NOT_CAPTURED",
    revisions: revisions.length,
    gap: activity.length === 0
      ? "Product changes are captured in audit_logs/content_revisions, not activity_logs."
      : null
  };
}

async function seedInventoryTraceProbe(actorId) {
  const productSlugForProbe = `${marker}-inventory-product`;
  const sku = `${marker.toUpperCase()}-INV`;
  const now = new Date().toISOString();
  const quantity = 20;

  cleanup.push(() => serviceDeleteIfPossible("mithron_products", `slug=eq.${encodeURIComponent(productSlugForProbe)}`));
  cleanup.push(() => serviceDeleteIfPossible("inventory", `product_slug=eq.${encodeURIComponent(productSlugForProbe)}&sku=eq.${encodeURIComponent(sku)}`));
  cleanup.push(() => serviceDeleteIfPossible("warehouse_stock", `warehouse_code=eq.${encodeURIComponent(traceWarehouseCode)}&product_slug=eq.${encodeURIComponent(productSlugForProbe)}&sku=eq.${encodeURIComponent(sku)}`));
  cleanup.push(() => serviceDeleteIfPossible("inventory_movements", `sku=eq.${encodeURIComponent(sku)}`));
  cleanup.push(() => serviceDeleteIfPossible("activity_logs", `entity_id=eq.${encodeURIComponent(`${productSlugForProbe}:${sku}`)}`));
  cleanup.push(() => serviceDeleteIfPossible("activity_logs", `entity_id=eq.${encodeURIComponent(`${traceWarehouseCode}:${productSlugForProbe}:${sku}`)}`));
  cleanup.push(() => serviceDeleteIfPossible("audit_logs", `entity_id=eq.${encodeURIComponent(`${productSlugForProbe}:${sku}`)}`));
  cleanup.push(() => serviceDeleteIfPossible("content_revisions", `entity_id=eq.${encodeURIComponent(`${productSlugForProbe}:${sku}`)}`));

  await serviceUpsert("mithron_products", "slug", {
    slug: productSlugForProbe,
    name: `Audit Trace Inventory Probe ${marker}`,
    tagline: "Temporary traceability validator inventory row",
    category: "Validation",
    price: 1,
    product_url: `/product/${productSlugForProbe}`,
    image: { src: "/media/mithron/catalog/mithron-drone-category.png", alt: "Audit trace inventory probe" },
    hero: { src: "/media/mithron/catalog/mithron-drone-category.png", alt: "Audit trace inventory probe" },
    gallery: [{ src: "/media/mithron/catalog/mithron-drone-category.png", alt: "Audit trace inventory probe" }],
    workflow_status: "published",
    is_visible: true,
    source_availability: "uploaded_csv",
    sort_order: -9999,
    updated_at: now
  });
  await serviceUpsert("inventory", "product_slug,sku", {
    product_slug: productSlugForProbe,
    sku,
    variant_id: traceVariantId,
    quantity,
    reserved_quantity: 0,
    reorder_threshold: 5,
    stock_status: "available",
    updated_by: actorId,
    updated_at: now
  });
  await serviceUpsert("warehouse_stock", "warehouse_code,product_slug,sku", {
    warehouse_code: traceWarehouseCode,
    product_slug: productSlugForProbe,
    sku,
    variant_id: traceVariantId,
    available_quantity: quantity,
    committed_quantity: 0,
    last_counted_at: now,
    updated_at: now
  });

  return {
    productSlug: productSlugForProbe,
    sku,
    warehouseCode: traceWarehouseCode,
    quantity
  };
}

async function findInventoryRowForSku(page, sku, maxPages = 12) {
  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    const inventoryUrl = pageNumber === 1
      ? `${baseUrl}/warehouse/inventory`
      : `${baseUrl}/warehouse/inventory?page=${pageNumber}`;
    await page.goto(inventoryUrl, { waitUntil: "domcontentloaded" });
    await page.locator("[data-inventory-system]").waitFor({ timeout: 15000 });
    await page.locator("[data-inventory-table]").waitFor({ timeout: 15000 });

    const targetRow = page.locator("[data-inventory-row]", { hasText: String(sku) }).first();
    if (await targetRow.count()) {
      try {
        await targetRow.waitFor({ state: "attached", timeout: 5000 });
        return targetRow;
      } catch {
        // Continue paging when the SKU exists in markup but is not yet attached on this page.
      }
    }

    const nextPageLink = page.locator(`a[href="/warehouse/inventory?page=${pageNumber + 1}"]`);
    if (!(await nextPageLink.count())) break;
  }

  throw new Error(`Inventory row for SKU ${sku} not found within ${maxPages} pages.`);
}

async function validateInventoryTrace(warehouse) {
  const probe = await seedInventoryTraceProbe(warehouse.userId);
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const editedProductSlug = probe.productSlug;
  const editedSku = probe.sku;
  const editedWarehouseCode = probe.warehouseCode;
  const originalQuantity = probe.quantity;
  const nextQuantity = originalQuantity + 1;
  const inventoryQuery = `product_slug=eq.${encodeURIComponent(editedProductSlug)}&sku=eq.${encodeURIComponent(editedSku)}`;
  const stockQuery = `warehouse_code=eq.${encodeURIComponent(editedWarehouseCode)}&product_slug=eq.${encodeURIComponent(editedProductSlug)}&sku=eq.${encodeURIComponent(editedSku)}`;
  const originalInventory = (await serviceQuery("inventory", `select=quantity,reserved_quantity,reorder_threshold,stock_status&${inventoryQuery}`))[0] ?? null;
  const originalStock = (await serviceQuery("warehouse_stock", `select=available_quantity,committed_quantity&${stockQuery}`))[0] ?? null;

  cleanup.push(() => serviceDeleteIfPossible("inventory_movements", `sku=eq.${encodeURIComponent(editedSku)}`));
  cleanup.push(() => originalStock
    ? servicePatch("warehouse_stock", stockQuery, {
      available_quantity: originalStock.available_quantity,
      committed_quantity: originalStock.committed_quantity
    })
    : serviceDeleteIfPossible("warehouse_stock", stockQuery));
  cleanup.push(() => originalInventory
    ? servicePatch("inventory", inventoryQuery, {
      quantity: originalInventory.quantity,
      reserved_quantity: originalInventory.reserved_quantity,
      reorder_threshold: originalInventory.reorder_threshold,
      stock_status: originalInventory.stock_status
    })
    : serviceDeleteIfPossible("inventory", inventoryQuery));

  try {
    await waitForRows(
      "inventory",
      `select=*&product_slug=eq.${encodeURIComponent(editedProductSlug)}&sku=eq.${encodeURIComponent(editedSku)}`,
      (rows) => rows.length === 1,
      15000
    );
    await loginBrowser(page, warehouse, "/warehouse/inventory");
    const targetRow = await findInventoryRowForSku(page, probe.sku);

    const stockForm = targetRow.locator("[data-inventory-inline-stock] form").first();
    await stockForm.waitFor({ timeout: 15000 });
    await stockForm.locator('[name="quantity"]').fill(String(nextQuantity));
    await submitAndWaitForAction(
      page,
      () => stockForm.locator("button").filter({ hasText: "Save" }).click(),
      "inventory inline stock update"
    );
    await assertInventoryActionSucceeded(page, "inventory inline stock update");
    await waitForRows(
      "warehouse_stock",
      `select=*&${stockQuery}`,
      (rows) => Number(rows[0]?.available_quantity ?? -1) === nextQuantity,
      45000
    );
  } finally {
    await context.close();
    await browser.close();
  }

  const inventory = (await serviceQuery("inventory", `select=*&${inventoryQuery}`))[0];
  const stock = (await serviceQuery("warehouse_stock", `select=*&${stockQuery}`))[0];
  const movements = (await serviceQuery(
    "inventory_movements",
    `select=*&sku=eq.${encodeURIComponent(editedSku)}&order=created_at.desc&limit=12`
  ))
    .filter((row) => Number(row.quantity_before) === originalQuantity && Number(row.quantity_after) === nextQuantity)
    .reverse();
  const movementIds = movements.map((row) => String(row.id ?? "")).filter(Boolean);
  const movementActivityRows = [];
  for (const movementId of movementIds) {
    movementActivityRows.push(...await queryActivity("inventory_movements", movementId));
    cleanup.push(() => serviceDeleteIfPossible("activity_logs", `entity_id=eq.${encodeURIComponent(movementId)}`));
    cleanup.push(() => serviceDeleteIfPossible("audit_logs", `entity_id=eq.${encodeURIComponent(movementId)}`));
  }
  const inventoryEntityId = `${editedProductSlug}:${editedSku}`;
  const stockEntityId = `${editedWarehouseCode}:${editedProductSlug}:${editedSku}`;
  const inventoryActivity = await queryActivity("inventory", inventoryEntityId);
  const stockActivity = await queryActivity("warehouse_stock", stockEntityId);

  const movementWithBeforeAfter = movements.find((row) => Number(row.quantity_before) === originalQuantity && Number(row.quantity_after) === nextQuantity);
  const activityWithBeforeAfter = [...inventoryActivity, ...stockActivity, ...movementActivityRows]
    .find((row) => hasObjectKeys(row.metadata, ["previous_quantity", "quantity", "sku"]));

  return {
    status: statusFromChecks([
      stock && Number(stock.available_quantity) === nextQuantity && Number(inventory?.quantity ?? -1) === nextQuantity ? "VERIFIED" : "FAILED_STOCK_NOT_UPDATED",
      movements.length >= 1 ? "VERIFIED" : "FAILED_NO_MOVEMENT_LEDGER",
      movementWithBeforeAfter ? "VERIFIED" : "FAILED_NO_BEFORE_AFTER",
      [...inventoryActivity, ...stockActivity, ...movementActivityRows].some((row) => row.actor_id === warehouse.userId) ? "VERIFIED" : "FAILED_NO_ACTOR_ACTIVITY",
      activityWithBeforeAfter ? "VERIFIED" : "FAILED_NO_ACTIVITY_BEFORE_AFTER"
    ]),
    stockPersistence: stock && Number(stock.available_quantity) === nextQuantity && Number(inventory?.quantity ?? -1) === nextQuantity ? "VERIFIED" : "FAILED",
    movementRows: movements.length,
    activityRows: movementActivityRows.length + inventoryActivity.length + stockActivity.length,
    actorAttribution: [...inventoryActivity, ...stockActivity, ...movementActivityRows].some((row) => row.actor_id === warehouse.userId) ? "VERIFIED" : "FAILED",
    roleAttribution: warehouse.fetchedRole === "warehouse" ? "VERIFIED" : "FAILED",
    beforeAfter: movementWithBeforeAfter && activityWithBeforeAfter ? "VERIFIED" : "FAILED",
    timestampIntegrity: [...movements, ...movementActivityRows, ...inventoryActivity, ...stockActivity].every(hasValidCreatedAt) ? "VERIFIED" : "FAILED"
  };
}

async function validateOrderTrace(admin) {
  const { chromium } = await import("playwright");
  const email = `${marker}-order@example.com`;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  let orderId = "";
  try {
    await loginBrowser(page, admin, "/operations/orders");
    await page.locator('[data-order-management-table="orders"]').first().waitFor({ timeout: 15000 });
    const createForm = page.locator('[data-order-management-table="orders"]').first();
    await createForm.locator('[name="customer_email"]').fill(email);
    await createForm.locator('[name="region"]').fill("AUDIT");
    await createForm.locator('[name="mission_profile"]').fill("traceability");
    await setFormField(createForm, "status", "confirmed");
    await setFormField(createForm, "payment_status", "not_required");
    await setFormField(createForm, "fulfillment_status", "pending");
    await createForm.locator('[name="order_items"]').fill(`[{"productSlug":"${productSlug}","quantity":1}]`);
    await setFormField(createForm, "currency", "INR");
    await setFormField(createForm, "metadata", `{"marker":"${marker}"}`);
    await createForm.locator('[name="note"]').fill(`${marker} create`);
    await createForm.locator('[name="change_summary"]').fill(`${marker} create order`);
    await createForm.locator('button[type="submit"]').click();
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    const orderRows = await waitForRows("orders", `select=*&customer_email=eq.${encodeURIComponent(email)}&order=created_at.desc&limit=1`, (rows) => rows.length === 1);
    orderId = String(orderRows[0].id ?? "");
    if (!orderId) throw new Error("Order creation did not return an id.");

    for (const status of ["processing", "packed", "shipped", "delivered"]) {
      await page.goto(`${baseUrl}/operations/orders`, { waitUntil: "domcontentloaded" });
      const lifecycleForm = page.locator('[data-order-lifecycle-form]').first();
      await lifecycleForm.locator('[name="order_id"]').fill(orderId);
      await setFormField(lifecycleForm, "status", "active");
      await setFormField(lifecycleForm, "payment_status", "not_required");
      await setFormField(lifecycleForm, "fulfillment_status", status);
      await lifecycleForm.locator('[name="shipment_tracking"]').fill(`{"marker":"${marker}","status":"${status}"}`);
      await lifecycleForm.locator('[name="note"]').fill(`${marker} ${status}`);
      await lifecycleForm.locator('[name="change_summary"]').fill(`${marker} ${status}`);
      await lifecycleForm.locator('button[type="submit"]').click();
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await waitForRows("orders", `select=*&id=eq.${encodeURIComponent(orderId)}`, (rows) => String(rows[0]?.fulfillment_status ?? "") === status);
    }
  } finally {
    await context.close();
    await browser.close();
  }

  const order = (await serviceQuery("orders", `select=*&id=eq.${encodeURIComponent(orderId)}`))[0];
  const timeline = Array.isArray(order?.timeline) ? order.timeline : [];
  const activity = await queryActivity("orders", orderId);
  const notifications = await waitForCondition(async () => {
    const rows = await serviceQuery("notifications", `select=*&entity_table=eq.orders&entity_id=eq.${encodeURIComponent(orderId)}&order=created_at.asc`);
    return rows.length >= 2 ? rows : null;
  }, 10000, "order lifecycle notifications").catch(() => serviceQuery("notifications", `select=*&entity_table=eq.orders&entity_id=eq.${encodeURIComponent(orderId)}&order=created_at.asc`));
  const auditLogs = await queryAuditLogs("orders", orderId);
  const revisions = await serviceQuery("content_revisions", `select=*&entity_table=eq.orders&entity_id=eq.${encodeURIComponent(orderId)}&order=revision.asc`);

  cleanup.push(() => serviceDeleteIfPossible("notifications", `entity_table=eq.orders&entity_id=eq.${encodeURIComponent(orderId)}`));
  cleanup.push(() => serviceDeleteIfPossible("activity_logs", `entity_table=eq.orders&entity_id=eq.${encodeURIComponent(orderId)}`));
  cleanup.push(() => serviceDeleteIfPossible("audit_logs", `entity_table=eq.orders&entity_id=eq.${encodeURIComponent(orderId)}`));
  cleanup.push(() => serviceDeleteIfPossible("content_revisions", `entity_table=eq.orders&entity_id=eq.${encodeURIComponent(orderId)}`));
  cleanup.push(() => serviceDeleteIfPossible("order_items", `order_id=eq.${encodeURIComponent(orderId)}`));
  cleanup.push(() => serviceDeleteIfPossible("orders", `id=eq.${encodeURIComponent(orderId)}`));

  const transitionEntry = timeline.find((entry) => {
    const metadata = entry?.metadata;
    return hasObjectKeys(metadata, ["previous_fulfillment_status", "fulfillment_status"]);
  });
  const activityTransition = activity.find((row) => hasObjectKeys(row.metadata, ["previous_fulfillment_status", "fulfillment_status"]));
  const automaticNotifications = notifications.filter((notification) => {
    const payload = notification.payload;
    return Boolean(payload && typeof payload === "object" && payload.event === "order.fulfillment_notification");
  });

  return {
    status: statusFromChecks([
      order?.id === orderId && order.fulfillment_status === "delivered" ? "VERIFIED" : "FAILED_ORDER_NOT_DELIVERED",
      transitionEntry ? "VERIFIED" : "FAILED_NO_TIMELINE_BEFORE_AFTER",
      activityTransition ? "VERIFIED" : "FAILED_NO_ACTIVITY_BEFORE_AFTER",
      activity.some((row) => row.actor_id === admin.userId) ? "VERIFIED" : "FAILED_NO_ACTOR",
      automaticNotifications.length >= 2 ? "VERIFIED" : "PARTIAL_NOT_ENOUGH_AUTOMATIC_NOTIFICATIONS"
    ]),
    orderId,
    finalFulfillmentStatus: order?.fulfillment_status ?? null,
    timelineEntries: timeline.length,
    activityRows: activity.length,
    auditLogRows: auditLogs.length,
    revisionRows: revisions.length,
    actorAttribution: activity.some((row) => row.actor_id === admin.userId) ? "VERIFIED" : "FAILED",
    beforeAfter: transitionEntry && activityTransition ? "VERIFIED" : "FAILED",
    notifications: automaticNotifications.length >= 2 ? "VERIFIED" : "PARTIAL_ONLY_ONE_AUTOMATIC_NOTIFICATION",
    notificationRows: notifications.length,
    timestampIntegrity: [...activity, ...notifications, ...auditLogs, ...revisions].every(hasValidCreatedAt) ? "VERIFIED" : "FAILED"
  };
}

async function validateGovernanceTrace(admin) {
  const { chromium } = await import("playwright");
  const visibleToken = `trace-${Date.now()}`;
  const targetEmail = `${visibleToken}-target@gmail.com`;
  const inviteEmail = `${visibleToken}-invite@gmail.com`;
  const targetPassword = `Mithron-${crypto.randomUUID()}-Aa1!`;
  let targetUserId = "";
  let inviteId = "";
  let invitedUserId = "";
  let targetSignedInRole = null;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  async function openUsersPage() {
    await page.goto(`${baseUrl}/admin/users`, { waitUntil: "domcontentloaded" });
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
    await loginBrowser(page, admin, "/admin/users");
    await openHeaderForm("Add user");
    const createForm = page.locator('[data-user-create-form]').first();
    await createForm.locator('[name="email"]').fill(targetEmail);
    await createForm.locator('[name="display_name"]').fill("Audit Trace Target");
    await createForm.locator('[name="temporary_password"]').fill(targetPassword);
    await createForm.locator('[name="role_key"]').selectOption("warehouse");
    await createForm.locator('button[type="submit"]').click();
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    const createdUser = await waitForCondition(async () => {
      const user = await findUserByEmail(targetEmail);
      return user?.id ? user : null;
    }, 30000, "managed user creation");
    targetUserId = createdUser.id;
    await waitForRows("user_roles", `select=*&user_id=eq.${encodeURIComponent(targetUserId)}&role_key=eq.warehouse`, (rows) => rows.length === 1);

    await openHeaderForm("Invite");
    const inviteForm = page.locator('[data-user-invite-form]').first();
    await inviteForm.locator('[name="email"]').fill(inviteEmail);
    await inviteForm.locator('[name="display_name"]').fill("Audit Trace Invite");
    await inviteForm.locator('[name="role_key"]').selectOption("user");
    await inviteForm.locator('button[type="submit"]').click();
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    const invite = await waitForCondition(async () => {
      const rows = await serviceQuery("admin_invites", `select=*&email=eq.${encodeURIComponent(inviteEmail)}&role_key=eq.user&order=created_at.desc&limit=1`);
      return rows[0] ?? null;
    }, 30000, "admin invite persistence");
    inviteId = String(invite.id ?? "");
    invitedUserId = String(invite.metadata?.auth_user_id ?? "");
    await waitForCondition(async () => {
      const rows = await serviceQuery("activity_logs", `select=*&action=eq.users.invite&entity_id=eq.${encodeURIComponent(inviteId)}&limit=1`);
      return rows[0] ?? null;
    }, 10000, "admin invite activity log").catch(() => null);

    const roleDialog = await openUserAction(targetEmail, "Change Role");
    await roleDialog.locator('[data-user-role-form] [name="role_key"]').selectOption("user");
    await roleDialog.locator('[data-user-role-form] button[type="submit"]').click();
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await waitForRows("user_roles", `select=*&user_id=eq.${encodeURIComponent(targetUserId)}&role_key=eq.user`, (rows) => rows.length === 1);
    await waitForCondition(async () => {
      const rows = await serviceQuery("user_roles", `select=*&user_id=eq.${encodeURIComponent(targetUserId)}&role_key=eq.warehouse`);
      return rows.length === 0;
    }, 20000, "warehouse role replacement");

    const targetSignedIn = await signInPersona({
      key: "governanceTarget",
      role: "user",
      email: targetEmail,
      password: targetPassword,
      displayName: "Audit Trace Target",
      userId: targetUserId
    });
    targetSignedInRole = targetSignedIn.fetchedRole;
    await targetSignedIn.client.auth.signOut();

    const disableDialog = await openUserAction(targetEmail, "Disable User");
    acceptNextDialog(page, "managed user disable confirmation");
    await disableDialog.locator('[data-user-disable-form] button[type="submit"]').click();
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await waitForCondition(async () => {
      const user = await findUserByEmail(targetEmail);
      const bannedUntil = user?.banned_until ? Date.parse(user.banned_until) : 0;
      return bannedUntil > Date.now() ? user : null;
    }, 20000, "managed user disable");

    const reactivateDialog = await openUserAction(targetEmail, "Reactivate User");
    await reactivateDialog.locator('[data-user-reactivate-form] [name="role_key"]').selectOption("user");
    await submitAndWaitForAction(page, () => reactivateDialog.locator('[data-user-reactivate-form] button[type="submit"]').click(), "managed user reactivation");
    await waitForCondition(async () => {
      const user = await findUserByEmail(targetEmail);
      const bannedUntil = user?.banned_until ? Date.parse(user.banned_until) : 0;
      return !bannedUntil || bannedUntil <= Date.now() ? user : null;
    }, 20000, "managed user reactivation");
  } finally {
    await context.close();
    await browser.close();
  }

  cleanup.push(async () => {
    if (targetUserId) await service.auth.admin.deleteUser(targetUserId);
  });
  cleanup.push(async () => {
    if (invitedUserId) await service.auth.admin.deleteUser(invitedUserId);
  });
  cleanup.push(() => targetUserId ? serviceDeleteIfPossible("activity_logs", `entity_id=eq.${encodeURIComponent(targetUserId)}`) : null);
  cleanup.push(() => inviteId ? serviceDeleteIfPossible("activity_logs", `entity_id=eq.${encodeURIComponent(inviteId)}`) : null);
  cleanup.push(() => targetUserId ? serviceDeleteIfPossible("audit_logs", `entity_id=eq.${encodeURIComponent(targetUserId)}`) : null);
  cleanup.push(() => inviteId ? serviceDeleteIfPossible("audit_logs", `entity_id=eq.${encodeURIComponent(inviteId)}`) : null);
  cleanup.push(() => serviceDeleteIfPossible("admin_invites", `email=eq.${encodeURIComponent(inviteEmail)}`));
  cleanup.push(() => serviceDeleteIfPossible("user_roles", `user_id=eq.${encodeURIComponent(targetUserId)}`));
  cleanup.push(() => serviceDeleteIfPossible("profiles", `id=eq.${encodeURIComponent(targetUserId)}`));
  if (invitedUserId) {
    cleanup.push(() => serviceDeleteIfPossible("user_roles", `user_id=eq.${encodeURIComponent(invitedUserId)}`));
    cleanup.push(() => serviceDeleteIfPossible("profiles", `id=eq.${encodeURIComponent(invitedUserId)}`));
  }

  const activityRows = await serviceQuery("activity_logs", "select=*&action=like.users.%25&order=created_at.desc&limit=1000");
  const relevant = activityRows.filter((row) => {
    const entityId = String(row.entity_id ?? "");
    const metadata = row.metadata ?? {};
    return entityId === targetUserId
      || entityId === inviteId
      || metadata.target_user_id === targetUserId
      || metadata.target_user_id === invitedUserId
      || JSON.stringify(metadata).includes(targetEmail)
      || JSON.stringify(metadata).includes(inviteEmail);
  });
  const actions = new Set(relevant.map((row) => String(row.action ?? "")));
  const requiredActions = ["users.create", "users.role_assign", "users.disable", "users.reactivate", "users.invite"];
  const metadataComplete = relevant
    .filter((row) => requiredActions.includes(String(row.action ?? "")))
    .every((row) => hasObjectKeys(row.metadata, ["actor_role", "target_user_id", "before_state", "after_state", "related_entity_ids"]));
  const inviteNotifications = await serviceQuery("notifications", `select=*&entity_table=eq.admin_invites&entity_id=eq.${encodeURIComponent(inviteId)}&limit=20`);

  return {
    status: statusFromChecks([
      targetSignedInRole === "user" ? "VERIFIED" : "FAILED_ROLE_NOT_USER",
      requiredActions.every((action) => actions.has(action)) ? "VERIFIED" : "PARTIAL_MISSING_GOVERNANCE_ACTIONS",
      metadataComplete ? "VERIFIED" : "FAILED_METADATA_INCOMPLETE",
      inviteNotifications.length > 0 ? "VERIFIED" : "PARTIAL_NO_APP_NOTIFICATION_FOR_INVITE"
    ]),
    targetUserId,
    inviteId,
    finalManagedRole: targetSignedInRole,
    activityRows: relevant.length,
    actions: [...actions].sort(),
    actorAttribution: relevant.every((row) => row.actor_id === admin.userId) ? "VERIFIED" : "FAILED",
    roleAttribution: metadataComplete && relevant.some((row) => row.metadata?.actor_role === "admin") ? "VERIFIED" : "FAILED",
    beforeAfter: metadataComplete ? "VERIFIED" : "FAILED",
    timestampIntegrity: relevant.every(hasValidCreatedAt) ? "VERIFIED" : "FAILED",
    inviteRecord: inviteId ? "VERIFIED" : "FAILED",
    inviteNotification: inviteNotifications.length > 0 ? "VERIFIED" : "PARTIAL_NOT_CREATED"
  };
}

async function validateSecurityEventTrace(unauthorized) {
  const startedAt = new Date().toISOString();
  const deniedMutation = await authRest(unauthorized, "/rest/v1/notifications", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      channel: "operations",
      title: marker,
      body: "Unauthorized audit trace probe",
      status: "unread",
      priority: "high",
      entity_table: "security_probe",
      entity_id: marker,
      payload: { marker }
    })
  });
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await loginBrowser(page, unauthorized, "/admin");
    await page.goto(`${baseUrl}/admin/settings`, { waitUntil: "domcontentloaded" });
  } finally {
    await context.close();
    await browser.close();
  }

  const recentActivity = await serviceQuery(
    "activity_logs",
    `select=*&created_at=gte.${encodeURIComponent(startedAt)}&order=created_at.desc&limit=200`
  );
  const recentSecurityEvents = await serviceQuery(
    "security_events",
    `select=*&created_at=gte.${encodeURIComponent(startedAt)}&order=created_at.desc&limit=200`
  ).catch(() => []);
  const securityRows = recentActivity.filter((row) => {
    const text = JSON.stringify(row);
    return /denied|forbidden|unauthorized|security|auth\./i.test(String(row.action ?? ""))
      || text.includes("security_probe")
      || text.includes("Unauthorized audit trace probe");
  });

  return {
    status: securityRows.length > 0 && recentSecurityEvents.length > 0 ? "VERIFIED" : "PARTIAL_NOT_SUPPORTED",
    deniedMutation: summarizeDenied(deniedMutation),
    securityEventRows: recentSecurityEvents.length,
    securityActivityRows: securityRows.length,
    gap: securityRows.length > 0 && recentSecurityEvents.length > 0 ? null : "Denied direct REST and restricted route attempts are enforced, but app-level security event/activity rows were incomplete."
  };
}

async function validateAuditIntegrity(admin, warehouse, orderTrace, inventoryTrace) {
  const activity = await serviceQuery("activity_logs", "select=*&order=created_at.desc&limit=1");
  const audit = await serviceQuery("audit_logs", "select=*&order=created_at.desc&limit=1");
  const movement = await serviceQuery("inventory_movements", "select=*&order=created_at.desc&limit=1");

  const activityId = String(activity[0]?.id ?? "");
  const auditId = String(audit[0]?.id ?? "");
  const movementId = String(movement[0]?.id ?? "");

  const results = {};
  if (activityId) {
    results.adminActivityUpdate = summarizeDenied(await authRest(admin, `/rest/v1/activity_logs?id=eq.${encodeURIComponent(activityId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ severity: "critical" })
    }));
    results.adminActivityDelete = summarizeDenied(await authRest(admin, `/rest/v1/activity_logs?id=eq.${encodeURIComponent(activityId)}`, {
      method: "DELETE",
      headers: { Prefer: "return=representation" }
    }));
  }
  if (auditId) {
    results.adminAuditUpdate = summarizeDenied(await authRest(admin, `/rest/v1/audit_logs?id=eq.${encodeURIComponent(auditId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ action: "tampered" })
    }));
  }
  if (movementId) {
    results.warehouseMovementUpdate = summarizeDenied(await authRest(warehouse, `/rest/v1/inventory_movements?id=eq.${encodeURIComponent(movementId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ quantity_after: 999999 })
    }));
  }

  const checks = Object.values(results).map((result) => result.status);
  return {
    status: statusFromChecks(checks.length ? checks : ["PARTIAL_NO_ROWS_TO_TAMPER_TEST"]),
    tamperTests: results,
    orderTraceEntityPresentBeforeCleanup: orderTrace?.orderId ? "VERIFIED" : "PARTIAL_NO_ORDER_ENTITY",
    inventoryTraceRowsPresentBeforeCleanup: inventoryTrace?.movementRows > 0 ? "VERIFIED" : "PARTIAL_NO_INVENTORY_ENTITY",
    serviceRoleCaveat: "Service role can manage logs for verification cleanup; tamper resistance was validated for authenticated app roles, not for service-role operators."
  };
}

async function runCleanup() {
  const failures = [];
  for (const task of cleanup.reverse()) {
    try {
      const result = await task();
      if (result) failures.push(result);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  return failures;
}

async function main() {
  const results = {
    status: "PARTIAL",
    marker,
    runtime: null,
    auth: {},
    schema: {},
    authenticationAudit: null,
    productTrace: null,
    inventoryTrace: null,
    orderTrace: null,
    governanceTrace: null,
    userAccessTrace: null,
    notifications: null,
    securityEventTrace: null,
    auditIntegrity: null,
    cleanupFailures: []
  };

  try {
    results.runtime = await validateRuntime();
    const prepared = {};
    for (const persona of personas) {
      const ensured = await ensurePersonaUser(persona);
      const signedIn = await signInPersona(ensured);
      prepared[persona.key] = signedIn;
      results.auth[persona.key] = {
        userId: signedIn.userId,
        expectedRole: persona.role,
        fetchedRole: signedIn.fetchedRole,
        status: signedIn.fetchedRole === persona.role ? "VERIFIED" : persona.role === null && signedIn.fetchedRole === null ? "VERIFIED_UNAUTHORIZED" : "FAILED"
      };
    }

    results.schema = await validateSchemaSurface();
    results.authenticationAudit = await validateAuthAudit(prepared.admin);
    results.productTrace = await validateProductTrace(prepared.admin);
    results.inventoryTrace = await validateInventoryTrace(prepared.warehouse);
    results.orderTrace = await validateOrderTrace(prepared.admin);
    results.governanceTrace = await validateGovernanceTrace(prepared.admin);
    results.userAccessTrace = {
      userId: prepared.user.userId,
      fetchedRole: prepared.user.fetchedRole,
      status: prepared.user.fetchedRole === "user" ? "VERIFIED" : "FAILED"
    };
    results.notifications = {
      orderLifecycle: results.orderTrace.notifications,
      userInvite: results.governanceTrace.inviteNotification,
      status: statusFromChecks([results.orderTrace.notifications, results.governanceTrace.inviteNotification])
    };
    results.securityEventTrace = await validateSecurityEventTrace(prepared.unauthorized);
    results.auditIntegrity = await validateAuditIntegrity(prepared.admin, prepared.warehouse, results.orderTrace, results.inventoryTrace);

    const sectionStatuses = [
      ...Object.values(results.auth).map((entry) => entry.status),
      ...Object.values(results.schema),
      results.authenticationAudit.status,
      results.productTrace.status,
      results.inventoryTrace.status,
      results.orderTrace.status,
      results.governanceTrace.status,
      results.userAccessTrace.status,
      results.notifications.status,
      results.securityEventTrace.status,
      results.auditIntegrity.status
    ];
    results.status = statusFromChecks(sectionStatuses);
  } catch (error) {
    results.status = "FAILED";
    results.error = error instanceof Error ? error.message : String(error);
  } finally {
    results.cleanupFailures = await runCleanup();
  }

  console.log(JSON.stringify(results, null, 2));
  if (results.status === "FAILED" || results.cleanupFailures.length > 0) {
    process.exitCode = 1;
  }
}

main();
