import crypto from "node:crypto";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const baseUrl = process.argv.find((arg) => arg.startsWith("--base-url="))?.slice("--base-url=".length)
  ?? process.env.SECURITY_BOUNDARY_BASE_URL
  ?? "http://127.0.0.1:3000";

const marker = `security-boundary-${Date.now()}`;
const cleanup = [];

function expectedUploadDeniedStatuses() {
  const statuses = [401, 403];
  if (process.env.MITHRON_UPLOAD_API_RETIRED === "true") {
    statuses.push(410);
  }
  return statuses;
}

function assertUploadDenied(status, context) {
  const allowed = expectedUploadDeniedStatuses();
  if (!allowed.includes(status)) {
    throw new Error(`${context} expected ${allowed.join("/")}, got ${status}.`);
  }
}

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
  { key: "admin", role: "admin", email: "admin.validation@example.com", displayName: "Security Boundary Admin" },
  { key: "warehouse", role: "warehouse", email: "warehouse.hardening@example.com", displayName: "Security Boundary Warehouse" },
  { key: "user", role: "user", email: "user.validation@example.com", displayName: "Security Boundary User" },
  { key: "unauthorized", role: null, authMetadataRole: "unauthorized", email: "unauthorized.validation@example.com", displayName: "Security Boundary Unauthorized" }
].map((persona) => ({
  ...persona,
  password: process.env.SECURITY_BOUNDARY_PASSWORD ?? `Mithron-${persona.key}-${crypto.randomUUID()}-Aa1!`
}));

function authClient() {
  return createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false
    },
    realtime: {
      params: { eventsPerSecond: 10 }
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

function anonHeaders(extra = {}) {
  return {
    apikey: publishableKey,
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

async function localFetch(path, options = {}, headers = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    redirect: "manual",
    ...options,
    headers: {
      ...headers,
      ...(options.headers ?? {})
    }
  });
  const text = await response.text();
  return { response, text };
}

async function serviceDelete(table, query) {
  await restOk(`/rest/v1/${table}?${query}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" }
  });
}

async function serviceInsert(table, payload) {
  const { body } = await restOk(`/rest/v1/${table}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(payload)
  });
  return Array.isArray(body) ? body[0] : body;
}

async function serviceUpsert(table, conflict, payload) {
  const { body } = await restOk(`/rest/v1/${table}?on_conflict=${encodeURIComponent(conflict)}`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(payload)
  });
  return Array.isArray(body) ? body[0] : body;
}

function deniedResult(result) {
  return !result.response.ok || (Array.isArray(result.body) && result.body.length === 0);
}

function explicitDenied(result) {
  return !result.response.ok && [401, 403].includes(result.response.status);
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
  if (rows.length === 0) {
    return {
      status: "VERIFIED_ZERO_ROWS",
      httpStatus: result.response.status
    };
  }

  throw new Error(`Expected denied or zero rows, received HTTP ${result.response.status} with ${rows.length} row(s).`);
}

async function expectDenied(label, resultPromise) {
  const result = await resultPromise;
  if (!deniedResult(result)) {
    throw new Error(`${label} unexpectedly succeeded with data.`);
  }
  return summarizeDenied(result);
}

async function expectExplicitDenied(label, resultPromise) {
  const result = await resultPromise;
  if (!explicitDenied(result)) {
    throw new Error(`${label} expected 401/403, got HTTP ${result.response.status}.`);
  }
  return summarizeDenied(result);
}

async function reportDeniedAttempt(persona, input) {
  const attemptedResource = `${input.attemptedResource}${input.attemptedResource.includes("?") ? "&" : "?"}marker=${encodeURIComponent(marker)}`;
  const result = await localFetch("/api/security/denials", {
    method: "POST",
    body: JSON.stringify({
      eventType: input.eventType ?? "security.rest_denied",
      attemptedResource,
      denialReason: input.denialReason,
      httpStatus: input.httpStatus ?? 403,
      method: input.method ?? "REQUEST",
      source: "security-boundary-validator",
      metadata: {
        marker,
        persona: persona.key,
        original_resource: input.attemptedResource
      }
    })
  }, bearerHeaders(persona.session.access_token));

  const canReportDenials = persona.role === "admin" || persona.role === "warehouse" || persona.role === "supplier";
  if (!result.response.ok) {
    if (!canReportDenials && result.response.status === 403) {
      return {
        status: "VERIFIED_TELEMETRY_FORBIDDEN",
        httpStatus: result.response.status,
        attemptedResource
      };
    }
    throw new Error(`security denial telemetry failed for ${input.attemptedResource}: ${result.response.status} ${result.response.statusText} ${result.text}`);
  }

  if (!canReportDenials) {
    throw new Error(`security denial telemetry unexpectedly accepted for ${persona.key}.`);
  }

  cleanup.push(() => serviceDelete("security_events", `attempted_resource=eq.${encodeURIComponent(attemptedResource)}`));
  return { status: "VERIFIED_REPORTED", httpStatus: result.response.status, attemptedResource };
}

function b64urlDecode(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
}

function b64urlEncodeJson(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function tamperJwt(accessToken, patch) {
  const [header, payload, signature] = accessToken.split(".");
  const decodedPayload = b64urlDecode(payload);
  return `${header}.${b64urlEncodeJson({ ...decodedPayload, ...patch })}.${signature}`;
}

function unsignedAdminJwt(subject) {
  return `${b64urlEncodeJson({ alg: "none", typ: "JWT" })}.${b64urlEncodeJson({
    aud: "authenticated",
    sub: subject,
    role: "authenticated",
    app_metadata: { role: "admin" },
    exp: Math.floor(Date.now() / 1000) + 3600
  })}.`;
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
  if (error) throw new Error(`${persona.key} signInWithPassword failed: ${error.message}`);
  if (!data.session?.access_token) throw new Error(`${persona.key} sign-in did not return a session.`);

  const signedIn = { ...persona, client, session: data.session };
  const { data: role, error: roleError } = await client.rpc("current_enterprise_role");
  if (roleError) throw new Error(`${persona.key} current_enterprise_role failed: ${roleError.message}`);
  return { ...signedIn, fetchedRole: role ?? null };
}

async function setupPersonas() {
  const provisioned = [];
  for (const persona of personas) {
    provisioned.push(await ensurePersonaUser(persona));
  }

  const signedIn = [];
  for (const persona of provisioned) {
    signedIn.push(await signInPersona(persona));
  }

  return Object.fromEntries(signedIn.map((persona) => [persona.key, persona]));
}

function productPayload(slug) {
  return {
    slug,
    name: "Denied Security Product",
    tagline: "Blocked direct product write",
    category: "Validation",
    price: 1,
    image: { src: "/media/security.webp", alt: "security" },
    hero: { src: "/media/security.webp", alt: "security" },
    gallery: [{ src: "/media/security.webp", alt: "security" }],
    workflow_status: "draft",
    is_visible: false
  };
}

function inventoryPayload(sku) {
  return {
    product_slug: "source-agri-kisan-drone-small-8-liter",
    sku,
    variant_id: "security-boundary",
    quantity: 1,
    reserved_quantity: 0,
    reorder_threshold: 1,
    stock_status: "in_stock",
    updated_at: new Date().toISOString()
  };
}

function orderPayload(orderNumber, actorId = null) {
  return {
    order_number: orderNumber,
    customer_email: `${orderNumber.toLowerCase()}@example.com`,
    status: "confirmed",
    payment_status: "not_required",
    fulfillment_status: "pending",
    channel: "security-boundary-validation",
    subtotal: 1,
    total: 1,
    currency: "INR",
    items: [],
    timeline: [{
      at: new Date().toISOString(),
      event: "order.created",
      status: "confirmed",
      actor_id: actorId,
      metadata: { marker }
    }],
    metadata: { marker },
    created_by: actorId,
    updated_at: new Date().toISOString()
  };
}

function invitePayload(email, role = "admin") {
  return {
    email,
    role_key: role,
    token_hash: `${marker}-${crypto.randomUUID()}`,
    status: "pending",
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    metadata: { marker }
  };
}

async function validateDirectApiAccess(byKey) {
  const invalidToken = `invalid.${crypto.randomUUID()}.token`;
  const missingAuth = anonHeaders();
  const invalidAuth = bearerHeaders(invalidToken);
  const tamperedWarehouseToken = tamperJwt(byKey.warehouse.session.access_token, {
    app_metadata: { role: "admin" },
    user_metadata: { role: "admin" }
  });

  const checks = {
    missingTokenAdminInviteInsert: await expectExplicitDenied("missing token admin_invites insert", rest("/rest/v1/admin_invites", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(invitePayload(`${marker}-missing@example.com`))
    }, missingAuth)),
    invalidTokenRoleRead: await expectExplicitDenied("invalid token user_roles read", rest("/rest/v1/user_roles?select=*&limit=1", {}, invalidAuth)),
    tamperedJwtAdminInviteInsert: await expectExplicitDenied("tampered JWT admin_invites insert", rest("/rest/v1/admin_invites", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(invitePayload(`${marker}-tampered@example.com`))
    }, bearerHeaders(tamperedWarehouseToken))),
    unauthorizedProductWrite: await expectExplicitDenied("unauthorized product write", rest("/rest/v1/mithron_products", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(productPayload(`${marker}-unauthorized-product`))
    }, bearerHeaders(byKey.unauthorized.session.access_token))),
    warehouseAdminInviteWrite: await expectExplicitDenied("warehouse admin invite write", rest("/rest/v1/admin_invites", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(invitePayload(`${marker}-warehouse@example.com`, "warehouse"))
    }, bearerHeaders(byKey.warehouse.session.access_token))),
    userInventoryWrite: await expectExplicitDenied("user inventory write", rest("/rest/v1/inventory", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(inventoryPayload(`${marker.toUpperCase()}-USER`))
    }, bearerHeaders(byKey.user.session.access_token))),
    unauthorizedOrderWrite: await expectExplicitDenied("unauthorized order write", rest("/rest/v1/orders", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(orderPayload(`${marker.toUpperCase()}-UNAUTH`, byKey.unauthorized.userId))
    }, bearerHeaders(byKey.unauthorized.session.access_token))),
    unauthorizedActivityWrite: await expectExplicitDenied("unauthorized activity log write", rest("/rest/v1/activity_logs", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        actor_id: byKey.unauthorized.userId,
        action: "security.unauthorized_probe",
        entity_table: "activity_logs",
        entity_id: marker,
        severity: "warning",
        metadata: { marker }
      })
    }, bearerHeaders(byKey.unauthorized.session.access_token))),
    unauthorizedNotificationWrite: await expectExplicitDenied("unauthorized notification write", rest("/rest/v1/notifications", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        recipient_id: byKey.unauthorized.userId,
        channel: "security",
        title: marker,
        body: "Denied",
        status: "unread",
        priority: "high",
        entity_table: "security",
        entity_id: marker,
        payload: { marker },
        created_at: new Date().toISOString()
      })
    }, bearerHeaders(byKey.unauthorized.session.access_token))),
    localUploadMissingToken: await (async () => {
      const result = await localFetch("/api/upload", {
        method: "POST",
        body: JSON.stringify({ marker })
      }, { "Content-Type": "application/json" });
      assertUploadDenied(result.response.status, "missing token upload");
      return { status: "VERIFIED_DENIED", httpStatus: result.response.status, statusText: result.response.statusText };
    })(),
    localUploadInvalidToken: await (async () => {
      const result = await localFetch("/api/upload", {
        method: "POST",
        body: JSON.stringify({ marker })
      }, {
        "Content-Type": "application/json",
        Authorization: `Bearer ${invalidToken}`
      });
      assertUploadDenied(result.response.status, "invalid token upload");
      return { status: "VERIFIED_DENIED", httpStatus: result.response.status, statusText: result.response.statusText };
    })()
  };

  checks.denialTelemetry = {
    unauthorizedProductWrite: await reportDeniedAttempt(byKey.unauthorized, {
      eventType: "security.rls_denied",
      attemptedResource: "/rest/v1/mithron_products",
      denialReason: "Unauthorized product write denied by Supabase RLS.",
      httpStatus: checks.unauthorizedProductWrite.httpStatus,
      method: "POST"
    }),
    warehouseAdminInviteWrite: await reportDeniedAttempt(byKey.warehouse, {
      eventType: "security.privilege_escalation",
      attemptedResource: "/rest/v1/admin_invites",
      denialReason: "Warehouse role attempted admin invite write.",
      httpStatus: checks.warehouseAdminInviteWrite.httpStatus,
      method: "POST"
    }),
    userInventoryWrite: await reportDeniedAttempt(byKey.user, {
      eventType: "security.rest_denied",
      attemptedResource: "/rest/v1/inventory",
      denialReason: "User role attempted inventory write.",
      httpStatus: checks.userInventoryWrite.httpStatus,
      method: "POST"
    })
  };

  return checks;
}

async function validateJwtAndSessionBoundaries(byKey) {
  const adminToken = byKey.admin.session.access_token;
  const expiredTampered = tamperJwt(adminToken, { exp: Math.floor(Date.now() / 1000) - 60 });
  const roleTampered = tamperJwt(byKey.user.session.access_token, {
    app_metadata: { role: "admin" },
    user_metadata: { role: "admin" }
  });
  const noneToken = unsignedAdminJwt(byKey.unauthorized.userId);

  return {
    expiredTamperedJwtRejected: await expectExplicitDenied("expired tampered JWT rejected", rest("/rest/v1/profiles?select=*&limit=1", {}, bearerHeaders(expiredTampered))),
    roleTamperedJwtRejected: await expectExplicitDenied("role tampered JWT rejected", rest("/rest/v1/admin_invites?select=*&limit=1", {}, bearerHeaders(roleTampered))),
    unsignedJwtRejected: await expectExplicitDenied("alg none JWT rejected", rest("/rest/v1/user_roles?select=*&limit=1", {}, bearerHeaders(noneToken))),
    removedSessionRouteRedirect: await (async () => {
      const result = await localFetch("/admin", {}, {});
      if (![301, 302, 303, 307, 308].includes(result.response.status)) {
        throw new Error(`anonymous /admin expected redirect, got ${result.response.status}.`);
      }
      return {
        status: "VERIFIED_REDIRECT",
        httpStatus: result.response.status,
        location: result.response.headers.get("location")
      };
    })(),
    dbRoleAuthoritativeForAuthorizedUsers: {
      admin: byKey.admin.fetchedRole,
      warehouse: byKey.warehouse.fetchedRole,
      user: byKey.user.fetchedRole,
      unauthorized: byKey.unauthorized.fetchedRole
    }
  };
}

async function loginBrowser(page, persona, nextPath) {
  await page.goto(`${baseUrl}/login?next=${encodeURIComponent(nextPath)}`, { waitUntil: "domcontentloaded" });
  await page.locator("input[type='email']").fill(persona.email);
  await page.locator("input[type='password']").fill(persona.password);
  const startUrl = page.url();
  await Promise.all([
    page.waitForURL((target) => target.href !== startUrl, { timeout: 30000 }).catch(() => null),
    page.locator('button[type="submit"]').click()
  ]);
  await page.waitForLoadState("domcontentloaded").catch(() => {});
}

async function validateHiddenRoutes(byKey) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const results = {};
  try {
    for (const persona of [byKey.unauthorized, byKey.warehouse, byKey.user]) {
      const context = await browser.newContext();
      const page = await context.newPage();
      try {
        await loginBrowser(page, persona, "/admin");
        const startUrl = page.url();
        const checks = { afterLogin: startUrl };
        for (const route of ["/admin", "/admin/products", "/admin/settings", "/warehouse/inventory", "/operations"]) {
          await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
          checks[route] = {
            url: page.url(),
            productForms: await page.locator('[data-product-table="mithron_products"]').count(),
            warehouseInventory: await page.locator("[data-inventory-system]").count(),
            operationsForms: await page.locator('[data-notifications-table="notifications"]').count(),
            userGovernanceTables: await page.locator('[data-user-governance-table="users"]').count()
          };
        }
        results[persona.key] = checks;
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  const unauthorized = results.unauthorized;
  if (!Object.values(unauthorized).every((entry) => typeof entry === "string" || !String(entry.url ?? "").includes("/admin") && !String(entry.url ?? "").includes("/warehouse") && !String(entry.url ?? "").includes("/operations"))) {
    throw new Error("Unauthorized user reached a protected route.");
  }
  if (results.warehouse["/admin/products"].productForms !== 0 || results.warehouse["/operations"].operationsForms !== 0) {
    throw new Error("Warehouse role saw admin/product or operations controls.");
  }
  if (results.user["/warehouse/inventory"].warehouseInventory !== 0 || results.user["/admin/products"].productForms !== 0) {
    throw new Error("User role saw warehouse or product controls.");
  }
  return results;
}

async function validateRlsMatrix(byKey) {
  const protectedOrder = await serviceInsert("orders", orderPayload(`${marker.toUpperCase()}-PROTECTED`, byKey.admin.userId));
  cleanup.push(() => serviceDelete("orders", `id=eq.${encodeURIComponent(protectedOrder.id)}`));
  const unauthorizedOrderDelete = await rest(
    `/rest/v1/orders?id=eq.${encodeURIComponent(protectedOrder.id)}`,
    { method: "DELETE", headers: { Prefer: "return=representation" } },
    bearerHeaders(byKey.unauthorized.session.access_token)
  );
  const protectedOrderAfterDelete = await restOk(`/rest/v1/orders?select=id&id=eq.${encodeURIComponent(protectedOrder.id)}`);

  const adminRoleDelete = await rest(
    `/rest/v1/user_roles?user_id=eq.${encodeURIComponent(byKey.user.userId)}&role_key=eq.user`,
    { method: "DELETE", headers: { Prefer: "return=representation" } },
    bearerHeaders(byKey.admin.session.access_token)
  );

  return {
    unauthorizedUserRolesSelect: await expectDenied("unauthorized user_roles read", rest("/rest/v1/user_roles?select=*&limit=5", {}, bearerHeaders(byKey.unauthorized.session.access_token))),
    warehouseAdminInvitesSelect: await expectDenied("warehouse admin_invites read", rest("/rest/v1/admin_invites?select=*&limit=5", {}, bearerHeaders(byKey.warehouse.session.access_token))),
    userProfilesSelect: await expectDenied(
      "user cross-user profiles read",
      rest(`/rest/v1/profiles?select=id,email,default_role&id=neq.${encodeURIComponent(byKey.user.userId)}&limit=5`, {}, bearerHeaders(byKey.user.session.access_token))
    ),
    unauthorizedOrdersDelete: (() => {
      const rows = Array.isArray(protectedOrderAfterDelete.body) ? protectedOrderAfterDelete.body : [];
      if (rows.length !== 1) {
        throw new Error("Unauthorized order delete removed or hid the protected service-created order.");
      }
      return summarizeDenied(unauthorizedOrderDelete);
    })(),
    adminDirectUserRoleDeleteExplicitDenied: await (async () => {
      const summary = summarizeDenied(adminRoleDelete);
      const roleStillExists = await restOk(
        `/rest/v1/user_roles?select=role_key&user_id=eq.${encodeURIComponent(byKey.user.userId)}&role_key=eq.user`
      );
      const rows = Array.isArray(roleStillExists.body) ? roleStillExists.body : [];
      if (rows.length !== 1) {
        throw new Error("Admin direct user role delete removed the protected user role row.");
      }
      return summary;
    })()
  };
}

async function validateRealtimeLeakBoundary(byKey) {
  const unauthorizedClient = byKey.unauthorized.client;
  const events = [];
  const channel = unauthorizedClient.channel(`security-boundary:${marker}`).on(
    "postgres_changes",
    { event: "*", schema: "public", table: "notifications" },
    (payload) => events.push(payload)
  );

  await new Promise((resolve, reject) => {
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") resolve();
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") reject(new Error(`Realtime subscription failed: ${status}`));
    });
  });

  const notification = await serviceInsert("notifications", {
    recipient_id: byKey.admin.userId,
    channel: "security",
    title: `Security boundary ${marker}`,
    body: "Unauthorized realtime clients must not receive this.",
    status: "unread",
    priority: "high",
    entity_table: "security_boundary",
    entity_id: marker,
    payload: { marker },
    created_at: new Date().toISOString()
  });
  cleanup.push(() => serviceDelete("notifications", `id=eq.${encodeURIComponent(notification.id)}`));

  await new Promise((resolve) => setTimeout(resolve, 3500));
  await unauthorizedClient.removeChannel(channel);

  if (events.length) {
    throw new Error(`Unauthorized realtime subscription received ${events.length} notification event(s).`);
  }
  return {
    status: "VERIFIED_NO_EVENTS",
    unauthorizedEvents: events.length
  };
}

async function validateSecurityAuditEvidence() {
  const governanceRows = await restOk("/rest/v1/activity_logs?select=action,metadata&action=like.users.%25&order=created_at.desc&limit=20");
  const rows = Array.isArray(governanceRows.body) ? governanceRows.body : [];
  const metadataComplete = rows.some((row) => {
    const metadata = row.metadata;
    return metadata
      && typeof metadata === "object"
      && !Array.isArray(metadata)
      && Object.hasOwn(metadata, "actor_role")
      && Object.hasOwn(metadata, "target_user_id")
      && Object.hasOwn(metadata, "before_state")
      && Object.hasOwn(metadata, "after_state")
      && Object.hasOwn(metadata, "related_entity_ids");
  });

  const securityEventRows = await restOk(`/rest/v1/security_events?select=event_type,attempted_resource,denial_reason,actor_user_id,actor_role,metadata&attempted_resource=like.*${encodeURIComponent(marker)}*&order=created_at.desc&limit=20`);
  const securityRows = Array.isArray(securityEventRows.body) ? securityEventRows.body : [];
  const directDenialsObserved = securityRows.some((row) => {
    const type = String(row.event_type ?? "");
    return ["security.rest_denied", "security.rls_denied", "security.privilege_escalation"].includes(type);
  });

  return {
    governanceAuditMetadata: metadataComplete ? "VERIFIED" : "NOT_OBSERVED",
    directRlsDeniedAttemptAppLogs: directDenialsObserved ? "VERIFIED" : "FAILED_NOT_OBSERVED",
    securityEventRows: securityRows.length,
    note: "Boundary denials remain enforced by Supabase Auth/RLS; application-mediated denial reports persist forensic security_events for operational review."
  };
}

async function cleanupRows() {
  const failures = [];
  for (const action of cleanup.reverse()) {
    try {
      await action();
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  return failures;
}

async function main() {
  const byKey = await setupPersonas();
  const results = {
    status: "FAILED",
    marker,
    auth: Object.fromEntries(Object.values(byKey).map((persona) => [persona.key, {
      userId: persona.userId,
      expectedRole: persona.role,
      fetchedRole: persona.fetchedRole,
      status: persona.fetchedRole === persona.role ? "VERIFIED" : persona.role ? "FAILED" : persona.fetchedRole === null ? "VERIFIED_UNAUTHORIZED" : "FAILED"
    }]))
  };

  try {
    results.directApiAccess = await validateDirectApiAccess(byKey);
    results.jwtAndSession = await validateJwtAndSessionBoundaries(byKey);
    results.hiddenRoutes = await validateHiddenRoutes(byKey);
    results.rlsMatrix = await validateRlsMatrix(byKey);
    results.realtimeLeakBoundary = await validateRealtimeLeakBoundary(byKey);
    results.securityAuditEvidence = await validateSecurityAuditEvidence();
    results.cleanupFailures = await cleanupRows();
    results.status = results.cleanupFailures.length ? "PARTIAL_CLEANUP_FAILURE" : "VERIFIED";
    console.log(JSON.stringify(results, null, 2));
    process.exit(results.status === "VERIFIED" ? 0 : 1);
  } catch (error) {
    results.cleanupFailures = await cleanupRows();
    results.error = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify(results, null, 2));
    process.exit(1);
  } finally {
    await Promise.all(Object.values(byKey).map((persona) => persona.client.auth.signOut().catch(() => {})));
  }
}

main();
