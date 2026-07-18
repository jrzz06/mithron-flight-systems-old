import { assertSupabaseAdminConfig } from "@/lib/env";
import { fetchWithTimeout, SUPABASE_FETCH_TIMEOUT_MS } from "@/lib/fetch-with-timeout";
import type { EnterprisePermission } from "@/lib/auth/permissions";
import { requirePermission } from "@/services/auth";

type EnvSource = Record<string, string | undefined>;
type JsonRecord = Record<string, unknown>;
type PermissionGuard = (permission: EnterprisePermission) => Promise<unknown> | unknown;
export type AdminMutationOptions = {
  guard?: PermissionGuard;
  /** Allow unauthenticated inserts for public-facing tables (e.g. guest enquiries). */
  allowGuest?: boolean;
  /** Trusted server callbacks (e.g. verified payment webhooks) without a user actor. */
  allowSystemActor?: boolean;
  /**
   * Extra audit metadata to attach to the audit log entry.
   * Useful when the DB write is performed as a system actor but we still want to record
   * the customer/requester context for traceability.
   */
  auditMetadata?: JsonRecord;
  /** Compare-and-swap guard for parallel edits. */
  expectedUpdatedAt?: string | null;
  /** Skip audit_logs writes when the mutation already has a dedicated audit trail. */
  skipAuditLog?: boolean;
};

export class AdminRecordConflictError extends Error {
  readonly currentRow?: JsonRecord;

  constructor(message: string, currentRow?: JsonRecord) {
    super(message);
    this.name = "AdminRecordConflictError";
    this.currentRow = currentRow;
  }
}

const optimisticLockTables = new Set([
  "mithron_products",
  "inventory",
  "warehouse_stock",
  "orders",
  "shipments",
  "blog_posts",
  "enquiries",
  "contact_requests"
]);

const mutableTables = new Set([
  "hero_banners",
  "section_visibility",
  "homepage_ordering",
  "cms_pages",
  "cms_sections",
  "content_revisions",
  "site_navigation",
  "footer_columns",
  "footer_links",
  "category_metadata",
  "trust_cards",
  "product_reviews",
  "faqs",
  "media_assets",
  "product_media_assets",
  "promotional_campaigns",
  "mithron_products",
  "inventory",
  "warehouse_stock",
  "inventory_movements",
  "orders",
  "order_items",
  "shipments",
  "shipment_items",
  "shipment_timeline",
  "deployment_requests",
  "staff_tasks",
  "notifications",
  "activity_logs",
  "security_events",
  "admin_settings",
  "admin_invites",
  "profiles",
  "user_roles",
  "enquiries",
  "contact_requests",
  "leads",
  "customer_addresses",
  "payments",
  "blog_posts",
  "customer_order_reviews"
]);

const tablePermissions: Record<string, EnterprisePermission> = {
  hero_banners: "cms.write",
  section_visibility: "cms.write",
  homepage_ordering: "cms.write",
  cms_pages: "cms.write",
  cms_sections: "cms.write",
  content_revisions: "cms.write",
  site_navigation: "cms.write",
  footer_columns: "cms.write",
  footer_links: "cms.write",
  category_metadata: "cms.write",
  trust_cards: "cms.write",
  product_reviews: "cms.write",
  faqs: "cms.write",
  blog_posts: "cms.write",
  media_assets: "media.write",
  product_media_assets: "products.write",
  promotional_campaigns: "cms.write",
  mithron_products: "products.write",
  inventory: "warehouse.write",
  warehouse_stock: "warehouse.write",
  inventory_movements: "warehouse.write",
  orders: "orders.lifecycle",
  order_items: "orders.lifecycle",
  shipments: "warehouse.write",
  shipment_items: "warehouse.write",
  shipment_timeline: "warehouse.write",
  deployment_requests: "operations.write",
  staff_tasks: "operations.write",
  notifications: "notifications.write",
  activity_logs: "audit.read",
  security_events: "audit.read",
  admin_settings: "settings.write",
  admin_invites: "settings.write",
  profiles: "settings.write",
  user_roles: "settings.write",
  enquiries: "enquiries.write",
  contact_requests: "enquiries.write",
  leads: "enquiries.write",
  customer_addresses: "enquiries.write",
  payments: "payments.write",
  customer_order_reviews: "enquiries.write"
};

const adminReadColumnsByTable: Record<string, string> = {
  hero_banners: "id,product_slug,title,subtitle,cta_label,href,sort_order,is_visible,status,revision,updated_at,created_at",
  section_visibility: "id,section_key,route_path,is_visible,status,created_at",
  homepage_ordering: "section_key,sort_order,is_visible,status,updated_at",
  cms_pages: "id,slug,title,route_path,sort_order,is_visible,status,revision,updated_at,created_at",
  cms_sections: "id,page_id,section_key,component_key,title,sort_order,is_visible,status,revision,updated_at,created_at",
  content_revisions: "id,entity_table,entity_id,revision,change_summary,created_by,created_at",
  site_navigation: "id,label,href,placement,parent_id,required_role,sort_order,is_visible,status,revision,updated_at,created_at",
  footer_columns: "id,title,sort_order,is_visible,status,revision,updated_at,created_at",
  footer_links: "id,column_id,label,href,sort_order,is_visible,status,revision,updated_at,created_at",
  category_metadata: "route_key,title,subtitle,sort_order,is_visible,status,revision,updated_at,created_at",
  trust_cards: "id,title,sort_order,is_visible,status,revision,updated_at,created_at",
  product_reviews: "id,product_slug,reviewer_name,rating,sort_order,is_visible,status,revision,updated_at,created_at",
  faqs: "id,scope,product_slug,question,sort_order,is_visible,status,revision,updated_at,created_at",
  blog_posts: "id,slug,title,excerpt,body,body_json,category,tags,author,reading_time_minutes,is_featured,published_at,seo_title,meta_description,related_product_slugs,status,is_visible,revision,cover_image,archived_at,updated_at,created_at",
  media_assets: "id,bucket,folder,storage_path,public_url,mime_type,width,height,size_bytes,content_hash,is_primary,is_visible,status,updated_at,created_at",
  product_media_assets: "product_slug,media_asset_id,usage,variant_id,sort_order,is_primary,created_at,updated_at",
  promotional_campaigns: "id,label,headline,cta_label,href,media_asset_id,starts_at,ends_at,sort_order,is_visible,status,revision,updated_at,created_at",
  mithron_products: "slug,name,tagline,category,price,supplier_id,submitted_by,rejection_reason,workflow_status,is_visible,source_availability,sort_order,updated_at,created_at",
  inventory: "id,product_slug,sku,variant_id,stock_status,quantity,reserved_quantity,reorder_threshold,updated_at,created_at",
  warehouse_stock: "id,warehouse_code,product_slug,sku,variant_id,available_quantity,committed_quantity,last_counted_at,updated_at,created_at",
  inventory_movements: "id,product_slug,sku,variant_id,warehouse_code,warehouse_stock_id,movement_type,quantity_delta,quantity_before,quantity_after,reason_code,actor_user_id,related_order_id,related_shipment_id,created_at",
  orders: "id,order_number,customer_email,status,payment_status,fulfillment_status,channel,total,currency,metadata,timeline,shipment_tracking,invoice_url,source_enquiry_id,archived_at,deleted_at,created_at,updated_at",
  order_items: "id,order_id,product_slug,product_name,sku,quantity,line_total,metadata,created_at",
  shipments: "id,order_id,shipment_number,shipment_status,warehouse_id,carrier_name,tracking_number,updated_at,created_at",
  shipment_items: "id,shipment_id,order_item_id,product_id,variant_id,quantity,created_at",
  shipment_timeline: "id,shipment_id,event_type,previous_status,next_status,actor_user_id,created_at",
  deployment_requests: "id,order_id,requester_email,region,mission_profile,status,assigned_to,updated_at,created_at",
  staff_tasks: "id,title,status,priority,assigned_to,related_request_id,due_at,updated_at,created_at",
  notifications: "id,recipient_id,channel,title,status,priority,entity_table,entity_id,created_at,read_at",
  activity_logs: "id,actor_id,action,entity_table,entity_id,severity,created_at",
  security_events: "id,actor_user_id,actor_role,event_type,attempted_resource,http_status,severity,dedupe_key,created_at",
  admin_settings: "id,payload,updated_by,updated_at,created_at",
  admin_invites: "id,email,role_key,status,invited_by,accepted_by,expires_at,accepted_at,metadata,created_at,updated_at",
  profiles: "id,email,display_name,default_role,governance_status,session_revoked_at,updated_at,created_at",
  user_roles: "user_id,role_key,created_at",
  roles: "key,label,description,sort_order",
  enquiries: "id,customer_user_id,customer_email,subject,body,status,region,related_product_slug,assigned_to,converted_order_id,enquiry_kind,enquiry_number,payload,archived_at,deleted_at,created_at,updated_at",
  contact_requests: "id,request_number,customer_user_id,customer_email,customer_phone,customer_full_name,customer_company,subject,body,status,assigned_to,converted_order_id,created_at,updated_at",
  leads: "id,lead_number,name,phone,email,address,product_slug,product_name,message,source,status,converted_order_id,customer_user_id,payload,created_at,updated_at",
  customer_addresses: "id,user_id,label,line1,city,region,postal_code,country,phone,is_default,is_billing,is_shipping,created_at,updated_at",
  payments: "id,order_id,provider,provider_intent_id,provider_payment_id,amount,currency,status,verified_at,created_at,updated_at",
  customer_order_reviews:
    "id,order_id,user_id,product_slug,rating,title,body,customer_name,image_urls,helpful_count,verified_purchase,status,created_at,updated_at"
};

const contentRevisionPermissions: EnterprisePermission[] = [
  "cms.write",
  "products.write",
  "media.write",
  "warehouse.write",
  "orders.write",
  "audit.read"
];
const supplierProductMutationPermissions: EnterprisePermission[] = ["products.write", "products.submit"];
const catalogInventoryMutationPermissions: EnterprisePermission[] = [
  "warehouse.write",
  "products.write",
  "products.submit",
  "inventory.update_own"
];
const maxRevisionAttempts = 3;

/** Fail-fast bound for every Supabase REST mutation so a slow endpoint cannot leave admin save buttons stuck on "Saving…". */
export const ADMIN_MUTATION_TIMEOUT_MS = 25_000;

function mutationSignal() {
  return AbortSignal.timeout(ADMIN_MUTATION_TIMEOUT_MS);
}

/** Bounded Supabase REST fetch — composes with mutationSignal when provided. */
function adminRestFetch(input: RequestInfo | URL, init?: RequestInit) {
  return fetchWithTimeout(input, init, SUPABASE_FETCH_TIMEOUT_MS);
}

function logCmsRevisionDebug(message: string, payload: Record<string, unknown>) {
  if (process.env.MITHRON_CMS_REVISION_DEBUG === "true") {
    console.info(message, payload);
  }
}

const cmsRevisionMutationTables = new Set([
  "hero_banners",
  "section_visibility",
  "homepage_ordering",
  "cms_pages",
  "cms_sections",
  "site_navigation",
  "footer_columns",
  "footer_links",
  "category_metadata",
  "trust_cards",
  "product_reviews",
  "faqs",
  "promotional_campaigns",
  "blog_posts"
]);

export type CmsRevisionMutationOperation = "publish" | "archive" | "restore";

type CmsRevisionMutationInput = {
  operation: CmsRevisionMutationOperation;
  table: string;
  idColumn: string;
  idValue: string;
  patch: JsonRecord;
  actorId: string | null;
  changeSummary?: string | null;
  requestId?: string | null;
};

function headers(serviceRoleKey: string, prefer = "return=representation") {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    Prefer: prefer
  };
}

async function mutationErrorMessage(response: Response, table: string, action: string) {
  const text = await response.text();
  // Log full internal details server-side only; never expose to callers
  if (!text) {
    console.error(`[admin-actions] ${action} ${table} failed: ${response.status} ${response.statusText}`);
    return `Failed to ${action} ${table} record.`;
  }

  try {
    const parsed = JSON.parse(text) as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const internalDetails = [
      typeof parsed.message === "string" ? parsed.message : "",
      typeof parsed.details === "string" ? parsed.details : "",
      typeof parsed.hint === "string" ? `hint: ${parsed.hint}` : "",
      typeof parsed.code === "string" ? `code=${parsed.code}` : ""
    ].filter(Boolean).join(" ");
    console.error(`[admin-actions] ${action} ${table} failed: ${response.status} ${response.statusText}${internalDetails ? ` - ${internalDetails}` : ""}`);
    const codeSuffix = typeof parsed.code === "string" ? ` code=${parsed.code}` : "";
    return `Failed to ${action} ${table} record.${codeSuffix}`;
  } catch {
    console.error(`[admin-actions] ${action} ${table} failed: ${response.status} ${response.statusText} - ${text.slice(0, 500)}`);
    return `Failed to ${action} ${table} record.`;
  }
}

function assertMutableTable(table: string) {
  if (!mutableTables.has(table)) {
    throw new Error(`Admin mutation attempted against unsupported table: ${table}.`);
  }
}

function adminReadSelectForTable(table: string) {
  const columns = adminReadColumnsByTable[table];
  if (!columns) {
    throw new Error(`No admin read-column mapping registered for table: ${table}.`);
  }
  return `select=${columns}`;
}

export function getRequiredPermissionForAdminTable(table: string): EnterprisePermission {
  assertMutableTable(table);
  const permission = tablePermissions[table];
  if (!permission) {
    throw new Error(`No permission mapping registered for admin table: ${table}.`);
  }
  return permission;
}

export async function assertAdminMutationPermission(table: string, actorId: string | null, options: AdminMutationOptions = {}) {
  if (!actorId) {
    if (options.allowSystemActor) {
      return getRequiredPermissionForAdminTable(table);
    }
    if (options.allowGuest && (table === "enquiries" || table === "leads" || table === "contact_requests")) {
      return getRequiredPermissionForAdminTable(table);
    }
    throw new Error(`Admin mutation against ${table} requires an authenticated actor id.`);
  }
  if (table === "content_revisions") {
    return assertAdminMutationAnyPermission(table, actorId, contentRevisionPermissions, options);
  }
  if (table === "mithron_products" || table === "product_media_assets") {
    return assertAdminMutationAnyPermission(table, actorId, supplierProductMutationPermissions, options);
  }
  if (table === "inventory") {
    return assertAdminMutationAnyPermission(table, actorId, catalogInventoryMutationPermissions, options);
  }
  const permission = getRequiredPermissionForAdminTable(table);
  await (options.guard ?? requirePermission)(permission);
  return permission;
}

async function assertAdminMutationAnyPermission(
  table: string,
  actorId: string | null,
  permissions: EnterprisePermission[],
  options: AdminMutationOptions = {}
) {
  if (!actorId) {
    throw new Error(`Admin mutation against ${table} requires an authenticated actor id.`);
  }

  const guard = options.guard ?? requirePermission;
  const failures: unknown[] = [];
  for (const permission of permissions) {
    try {
      await guard(permission);
      return permission;
    } catch (error) {
      failures.push(error);
    }
  }

  throw new Error(`Admin mutation against ${table} requires one of: ${permissions.join(", ")}.`);
}

export async function insertAuditLog(
  action: string,
  entityTable: string,
  entityId: string | null,
  afterData: JsonRecord,
  actorId: string | null,
  env: EnvSource = process.env,
  beforeData: JsonRecord | null = null,
  extraMetadata: JsonRecord | null = null
) {
  const config = assertSupabaseAdminConfig(env);
  const response = await adminRestFetch(`${config.url}/rest/v1/audit_logs`, {
    method: "POST",
    headers: headers(config.serviceRoleKey),
    signal: mutationSignal(),
    body: JSON.stringify({
      actor_id: actorId,
      action,
      entity_table: entityTable,
      entity_id: entityId,
      before_data: beforeData,
      after_data: afterData,
      metadata: {
        source: "mithron-admin",
        changed_fields: diffBeforeAfter(beforeData, afterData),
        ...(extraMetadata ?? {})
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to create audit_logs record: ${response.status} ${response.statusText}`);
  }
}

function inferEntityId(table: string, record: JsonRecord) {
  if (typeof record.id === "string") return record.id;
  if (typeof record.slug === "string") return record.slug;
  if (table === "mithron_products" && typeof record.slug === "string") return record.slug;
  if (table === "product_media_assets") return [record.product_slug, record.media_asset_id, record.usage].filter(Boolean).join(":");
  if (table === "inventory") return [record.product_slug, record.sku].filter(Boolean).join(":");
  if (table === "warehouse_stock") return [record.warehouse_code, record.product_slug, record.sku].filter(Boolean).join(":");
  if (table === "user_roles") return [record.user_id, record.role_key].filter(Boolean).join(":");
  return "";
}

function diffBeforeAfter(beforeData: JsonRecord | null, afterData: JsonRecord | null) {
  if (!beforeData || !afterData) return [];
  const keys = new Set([...Object.keys(beforeData), ...Object.keys(afterData)]);
  return [...keys].filter((key) => JSON.stringify(beforeData[key]) !== JSON.stringify(afterData[key])).sort();
}

async function fetchExistingAdminRecord(
  table: string,
  identity: JsonRecord,
  identityColumns: string,
  env: EnvSource = process.env
) {
  const columns = identityColumns.split(",").map((column) => column.trim()).filter(Boolean);
  if (!columns.length) return null;
  const query = columns
    .map((column) => `${column}=eq.${encodeURIComponent(String(identity[column] ?? ""))}`)
    .join("&");
  if (columns.some((column) => identity[column] === undefined || identity[column] === null || String(identity[column]) === "")) return null;

  const config = assertSupabaseAdminConfig(env);
  const response = await adminRestFetch(`${config.url}/rest/v1/${table}?${adminReadSelectForTable(table)}&${query}&limit=1`, {
    headers: headers(config.serviceRoleKey),
    cache: "no-store",
    signal: mutationSignal()
  });

  if (!response.ok) return null;
  const rows = await response.json() as JsonRecord[];
  return rows[0] ?? null;
}

function identityFromMutationTarget(idColumn: string, idValue: string) {
  const columns = idColumn.split(",").map((column) => column.trim()).filter(Boolean);
  if (!columns.length) {
    throw new Error("Admin mutation requires at least one identity column.");
  }
  if (columns.length === 1) {
    return {
      identity: { [columns[0]]: idValue },
      query: `${columns[0]}=eq.${encodeURIComponent(idValue)}`
    };
  }

  const delimiterIndex = idValue.indexOf(":");
  const values = columns.length === 2 && delimiterIndex >= 0
    ? [idValue.slice(0, delimiterIndex), idValue.slice(delimiterIndex + 1)]
    : idValue.split(":");

  if (values.length !== columns.length || values.some((value) => value === "")) {
    throw new Error(`Admin mutation target ${idColumn} requires ${columns.length} identity values.`);
  }

  const identity = Object.fromEntries(columns.map((column, index) => [column, values[index]]));
  const query = columns
    .map((column, index) => `${column}=eq.${encodeURIComponent(values[index])}`)
    .join("&");

  return { identity, query };
}

export async function fetchAdminRecordsByColumn(
  table: string,
  column: string,
  value: string,
  env: EnvSource = process.env,
  options: { requiredPermission?: EnterprisePermission; limit?: number } = {}
) {
  assertMutableTable(table);
  if (options.requiredPermission) {
    await requirePermission(options.requiredPermission);
  }
  const config = assertSupabaseAdminConfig(env);
  const limit = options.limit ?? 50;
  const response = await adminRestFetch(
    `${config.url}/rest/v1/${table}?${column}=eq.${encodeURIComponent(value)}&${adminReadSelectForTable(table)}&limit=${limit}`,
    {
      headers: headers(config.serviceRoleKey),
      cache: "no-store",
      signal: mutationSignal()
    }
  );

  if (!response.ok) {
    throw new Error(await mutationErrorMessage(response, table, "read"));
  }

  return await response.json() as JsonRecord[];
}

async function deleteAdminRecordsByColumn(
  table: string,
  column: string,
  value: string,
  actorId: string | null,
  env: EnvSource = process.env
) {
  assertMutableTable(table);
  await assertAdminMutationPermission(table, actorId);
  const config = assertSupabaseAdminConfig(env);
  const beforeData = await fetchAdminRecordsByColumn(table, column, value, env);
  const response = await adminRestFetch(`${config.url}/rest/v1/${table}?${column}=eq.${encodeURIComponent(value)}`, {
    method: "DELETE",
    headers: headers(config.serviceRoleKey, "return=representation"),
    signal: mutationSignal()
  });

  if (!response.ok) {
    throw new Error(await mutationErrorMessage(response, table, "delete"));
  }

  const records = await response.json() as JsonRecord[];
  await insertAuditLog(
    "delete",
    table,
    `${column}:${value}`,
    { column, value, rows: records.length },
    actorId,
    env,
    { rows: beforeData },
    null
  );
  return records;
}

async function insertActivityLogRecord(payload: JsonRecord, actorId: string | null, env: EnvSource = process.env) {
  await assertAdminMutationAnyPermission(
    "activity_logs",
    actorId,
    ["warehouse.write", "orders.write", "audit.read", "settings.write"]
  );
  const config = assertSupabaseAdminConfig(env);
  const response = await adminRestFetch(`${config.url}/rest/v1/activity_logs`, {
    method: "POST",
    headers: headers(config.serviceRoleKey),
    signal: mutationSignal(),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Failed to create activity_logs record: ${response.status} ${response.statusText}`);
  }

  const [record] = await response.json() as JsonRecord[];
  return record ?? payload;
}

async function insertNotificationRecord(
  payload: JsonRecord,
  actorId: string | null,
  env: EnvSource = process.env,
  options: AdminMutationOptions = {}
) {
  if (!options.allowSystemActor) {
    await assertAdminMutationAnyPermission(
      "notifications",
      actorId,
      ["notifications.write", "warehouse.write", "orders.write"]
    );
  }
  const config = assertSupabaseAdminConfig(env);

  // Callers historically passed `metadata` for email side-channels and extras.
  // The notifications table stores that data in `payload` jsonb — never as a
  // top-level `metadata` column (PostgREST 400 if sent raw).
  const {
    metadata: legacyMetadata,
    recipient_email: topLevelRecipientEmail,
    payload: existingPayload,
    ...rest
  } = payload;
  const legacy = isPlainRecord(legacyMetadata) ? legacyMetadata : {};
  const existing = isPlainRecord(existingPayload) ? existingPayload : {};
  const mergedPayload: JsonRecord = { ...existing, ...legacy };
  if (typeof topLevelRecipientEmail === "string" && topLevelRecipientEmail.trim()) {
    mergedPayload.recipient_email = topLevelRecipientEmail.trim();
  }

  // Business-event idempotency: when the caller supplies a dedupe_key
  // (e.g. "order-paid:<order-id>:<recipient>"), the unique index on
  // notifications.dedupe_key plus ignore-duplicates makes retries and
  // concurrent producers a no-op instead of a duplicate notification.
  const dedupeKey = typeof rest.dedupe_key === "string" && rest.dedupe_key.trim()
    ? rest.dedupe_key.trim()
    : null;
  const endpoint = dedupeKey
    ? `${config.url}/rest/v1/notifications?on_conflict=dedupe_key`
    : `${config.url}/rest/v1/notifications`;
  const preferHeader = dedupeKey
    ? "resolution=ignore-duplicates,return=representation"
    : "return=representation";

  const insertBody: JsonRecord = {
    ...rest,
    payload: mergedPayload,
    ...(dedupeKey ? { dedupe_key: dedupeKey } : {})
  };
  // recipient_id is nullable for email-only customer notifications.
  if (insertBody.recipient_id === "" || insertBody.recipient_id === undefined) {
    insertBody.recipient_id = null;
  }

  const response = await adminRestFetch(endpoint, {
    method: "POST",
    headers: headers(config.serviceRoleKey, preferHeader),
    signal: mutationSignal(),
    body: JSON.stringify(insertBody)
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Failed to create notifications record: ${response.status} ${response.statusText}${
        detail ? ` — ${detail.slice(0, 240)}` : ""
      }`
    );
  }

  const rows = await response.json() as JsonRecord[];
  const record = rows[0];

  // Duplicate suppressed by dedupe_key: nothing was inserted, so skip the
  // audit log and email side effects.
  if (dedupeKey && !record) {
    return insertBody;
  }

  await insertAuditLog("create", "notifications", String(record?.id ?? ""), record ?? insertBody, actorId, env);

  const recipientEmail = typeof mergedPayload.recipient_email === "string"
    ? mergedPayload.recipient_email
    : null;
  if (recipientEmail) {
    const { scheduleBackgroundWork } = await import("@/lib/jobs/queue-provider");
    scheduleBackgroundWork("notification-email", async () => {
      const { dispatchEmailNotification } = await import("@/services/email/resend");
      await dispatchEmailNotification({
        recipientEmail,
        title: String(insertBody.title ?? "Mithron notification"),
        body: String(insertBody.body ?? "")
      });
    });
  }

  return record ?? insertBody;
}

function isContentRevisionConflict(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return isContentRevisionConflictText(message);
}

function isContentRevisionConflictText(message: string) {
  return (
    message.includes("content_revisions")
    && (
      message.includes("23505")
      || message.includes("409 Conflict")
      || message.includes("content_revisions_entity_table_entity_id_revision_key")
    )
  );
}

function isPlainRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeMutationRecord(value: unknown): JsonRecord {
  if (Array.isArray(value)) {
    return isPlainRecord(value[0]) ? value[0] : {};
  }
  return isPlainRecord(value) ? value : {};
}

function assertCmsRevisionMutationTable(table: string) {
  assertMutableTable(table);
  if (!cmsRevisionMutationTables.has(table)) {
    throw new Error(`CMS revision mutation attempted against unsupported content table: ${table}.`);
  }
}

function cmsRevisionRequestId(requestId: string | null | undefined) {
  if (requestId?.trim()) return requestId.trim();
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }
  return `cms-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseJsonRecord(text: string) {
  if (!text) return {};
  const parsed = JSON.parse(text) as unknown;
  return normalizeMutationRecord(parsed);
}

async function insertContentRevisionViaRpc(
  entityTable: string,
  entityId: string,
  snapshot: JsonRecord,
  actorId: string | null,
  changeSummary: string | null,
  env: EnvSource
) {
  const config = assertSupabaseAdminConfig(env);
  const response = await adminRestFetch(`${config.url}/rest/v1/rpc/cms_insert_content_revision`, {
    method: "POST",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    cache: "no-store",
    signal: mutationSignal(),
    body: JSON.stringify({
      p_entity_table: entityTable,
      p_entity_id: entityId,
      p_snapshot: snapshot,
      p_change_summary: changeSummary ?? null,
      p_created_by: actorId ?? null
    })
  });

  const text = await response.text().catch(() => "");
  if (!response.ok) {
    throw new Error(
      `Failed to create content_revisions record: ${response.status} ${response.statusText}${text ? ` - ${text.slice(0, 400)}` : ""}`
    );
  }

  return normalizeMutationRecord(text ? JSON.parse(text) : {});
}

async function insertContentRevisionViaTableTrigger(
  entityTable: string,
  entityId: string,
  snapshot: JsonRecord,
  actorId: string | null,
  changeSummary: string | null,
  env: EnvSource
) {
  const config = assertSupabaseAdminConfig(env);
  const response = await adminRestFetch(`${config.url}/rest/v1/content_revisions`, {
    method: "POST",
    headers: headers(config.serviceRoleKey),
    cache: "no-store",
    signal: mutationSignal(),
    body: JSON.stringify({
      entity_table: entityTable,
      entity_id: entityId,
      snapshot,
      change_summary: changeSummary ?? null,
      created_by: actorId ?? null
    })
  });

  const text = await response.text().catch(() => "");
  if (!response.ok) {
    throw new Error(
      `Failed to create DB-owned content_revisions record: ${response.status} ${response.statusText}${text ? ` - ${text.slice(0, 400)}` : ""}`
    );
  }

  return normalizeMutationRecord(text ? JSON.parse(text) : {});
}

export async function recordEntityRevisionSnapshot(
  entityTable: string,
  entityId: string,
  snapshot: JsonRecord,
  actorId: string | null,
  changeSummary: string | null,
  env: EnvSource = process.env
) {
  await assertAdminMutationAnyPermission("content_revisions", actorId, contentRevisionPermissions);

  let lastConflict: unknown = null;
  for (let attempt = 1; attempt <= maxRevisionAttempts; attempt += 1) {
    try {
      return await insertContentRevisionViaRpc(entityTable, entityId, snapshot, actorId, changeSummary, env);
    } catch (error) {
      if (attempt >= maxRevisionAttempts || !isContentRevisionConflict(error)) {
        if (!isContentRevisionConflict(error)) {
          throw error;
        }
        lastConflict = error;
        break;
      }

      lastConflict = error;
      const retryDelayMs = 50 * Math.pow(2, attempt - 1);
      console.warn("[cms-revision] direct revision RPC retry", {
        entityTable,
        entityId,
        attempt,
        retryDelayMs
      });
      await new Promise(resolve => setTimeout(resolve, retryDelayMs));
    }
  }

  console.warn("[cms-revision] direct revision RPC exhausted; falling back to DB-owned table trigger", {
    entityTable,
    entityId,
    attempts: maxRevisionAttempts
  });

  try {
    return await insertContentRevisionViaTableTrigger(entityTable, entityId, snapshot, actorId, changeSummary, env);
  } catch (error) {
    const original = lastConflict instanceof Error ? lastConflict.message : String(lastConflict ?? "unknown RPC conflict");
    const fallback = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to create content revision after RPC conflict retries and DB-owned fallback. original=${original} fallback=${fallback}`);
  }
}

export async function mutateCmsContentWithRevision(input: CmsRevisionMutationInput, env: EnvSource = process.env) {
  assertCmsRevisionMutationTable(input.table);
  if (input.table === "inventory_movements" || input.table === "shipment_timeline") {
    throw new Error(`${input.table} records are immutable.`);
  }
  await assertAdminMutationPermission(input.table, input.actorId);

  const config = assertSupabaseAdminConfig(env);
  const target = identityFromMutationTarget(input.idColumn, input.idValue);
  const requestId = cmsRevisionRequestId(input.requestId);
  const entity = `${input.table}:${input.idValue}`;

  for (let attempt = 1; attempt <= maxRevisionAttempts; attempt += 1) {
    logCmsRevisionDebug("[cms-revision] transaction start", {
      requestId,
      entity,
      operation: input.operation,
      attempt
    });
    logCmsRevisionDebug("[cms-revision] insert payload", {
      requestId,
      entityTable: input.table,
      entityId: input.idValue,
      operation: input.operation,
      patchKeys: Object.keys(input.patch).sort(),
      attempt
    });

    const response = await adminRestFetch(`${config.url}/rest/v1/rpc/cms_mutate_content_with_revision`, {
      method: "POST",
      headers: headers(config.serviceRoleKey, "return=representation"),
      cache: "no-store",
      signal: mutationSignal(),
      body: JSON.stringify({
        p_operation: input.operation,
        p_entity_table: input.table,
        p_entity_id: input.idValue,
        p_identity: target.identity,
        p_patch: input.patch,
        p_change_summary: input.changeSummary ?? null,
        p_actor_id: input.actorId ?? null,
        p_request_id: requestId,
        p_attempt: attempt
      })
    });

    const text = await response.text().catch(() => "");
    if (response.ok) {
      const result = parseJsonRecord(text);
      const record = normalizeMutationRecord(result.record);
      logCmsRevisionDebug("[cms-revision] transaction end", {
        requestId,
        entity,
        operation: input.operation,
        attempt,
        revision: result.revision ?? record.revision ?? null,
        revisionId: result.revision_id ?? null
      });
      if (!Object.keys(record).length) {
        throw new Error(`CMS revision mutation ${input.operation} returned no ${input.table} record.`);
      }
      return record;
    }

    const errorDetails = text ? ` - ${text.slice(0, 500)}` : "";
    const errorMessage = `Failed to ${input.operation} ${input.table} record: ${response.status} ${response.statusText}${errorDetails}`;
    if (attempt < maxRevisionAttempts && isContentRevisionConflictText(errorMessage)) {
      const retryDelayMs = 50 * Math.pow(2, attempt - 1);
      console.warn("[cms-revision] 23505 retry", {
        requestId,
        entity,
        operation: input.operation,
        attempt,
        retryDelayMs
      });
      await new Promise(resolve => setTimeout(resolve, retryDelayMs));
      continue;
    }

    throw new Error(errorMessage);
  }

  throw new Error(`Failed to ${input.operation} ${input.table} record after ${maxRevisionAttempts} attempts.`);
}

export async function createAdminRecord(
  table: string,
  payload: JsonRecord,
  actorId: string | null,
  env: EnvSource = process.env,
  options: AdminMutationOptions = {}
) {
  assertMutableTable(table);
  await assertAdminMutationPermission(table, actorId, options);
  const config = assertSupabaseAdminConfig(env);
  const response = await adminRestFetch(`${config.url}/rest/v1/${table}`, {
    method: "POST",
    headers: headers(config.serviceRoleKey),
    signal: mutationSignal(),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(await mutationErrorMessage(response, table, "create"));
  }

  let record: JsonRecord | undefined;
  const responseText = await response.text();
  if (responseText) {
    try {
      const parsed = JSON.parse(responseText) as JsonRecord | JsonRecord[];
      record = Array.isArray(parsed) ? parsed[0] : parsed;
    } catch {
      record = undefined;
    }
  }

  const afterData = record ?? payload;
  if (!options.skipAuditLog) {
    await insertAuditLog(
      "create",
      table,
      inferEntityId(table, afterData),
      afterData,
      actorId,
      env,
      null,
      options.auditMetadata ?? null
    );
  }
  return record ?? payload;
}

export async function upsertAdminRecord(
  table: string,
  conflictColumn: string,
  payload: JsonRecord,
  actorId: string | null,
  env: EnvSource = process.env,
  options: AdminMutationOptions = {}
) {
  assertMutableTable(table);
  await assertAdminMutationPermission(table, actorId, options);
  const config = assertSupabaseAdminConfig(env);
  const beforeData = await fetchExistingAdminRecord(table, payload, conflictColumn, env);
  const response = await adminRestFetch(`${config.url}/rest/v1/${table}?on_conflict=${encodeURIComponent(conflictColumn)}`, {
    method: "POST",
    headers: headers(config.serviceRoleKey, "resolution=merge-duplicates,return=representation"),
    signal: mutationSignal(),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(await mutationErrorMessage(response, table, "upsert"));
  }

  const [record] = await response.json() as JsonRecord[];
  const afterData = record ?? payload;
  if (!options.skipAuditLog) {
    await insertAuditLog(
      "upsert",
      table,
      inferEntityId(table, afterData) || inferEntityId(table, payload),
      afterData,
      actorId,
      env,
      beforeData,
      options.auditMetadata ?? null
    );
  }
  return record ?? payload;
}

export async function updateAdminRecord(
  table: string,
  idColumn: string,
  idValue: string,
  payload: JsonRecord,
  actorId: string | null,
  env: EnvSource = process.env,
  options: AdminMutationOptions = {}
) {
  assertMutableTable(table);
  if (table === "inventory_movements") {
    throw new Error("Inventory movement records are immutable.");
  }
  if (table === "shipment_timeline") {
    throw new Error("Shipment timeline records are immutable.");
  }
  await assertAdminMutationPermission(table, actorId, options);
  const config = assertSupabaseAdminConfig(env);
  const target = identityFromMutationTarget(idColumn, idValue);
  const beforeData = await fetchExistingAdminRecord(table, target.identity, idColumn, env);
  const optimisticQuery = options.expectedUpdatedAt && optimisticLockTables.has(table)
    ? `&updated_at=eq.${encodeURIComponent(options.expectedUpdatedAt)}`
    : "";
  const response = await adminRestFetch(`${config.url}/rest/v1/${table}?${target.query}${optimisticQuery}`, {
    method: "PATCH",
    headers: headers(config.serviceRoleKey, "return=representation"),
    signal: mutationSignal(),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(await mutationErrorMessage(response, table, "update"));
  }

  const responseText = await response.text();
  let parsedRecords: JsonRecord[] = [];
  if (responseText) {
    try {
      const parsed = JSON.parse(responseText) as JsonRecord | JsonRecord[];
      parsedRecords = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    } catch {
      parsedRecords = [];
    }
  }

  if (options.expectedUpdatedAt && optimisticLockTables.has(table) && parsedRecords.length === 0) {
    const currentRow = await fetchExistingAdminRecord(table, target.identity, idColumn, env);
    throw new AdminRecordConflictError(
      `Concurrent update detected on ${table}. Reload the latest version and retry.`,
      currentRow ?? undefined
    );
  }

  let record: JsonRecord | undefined = parsedRecords[0];

  if (!record) {
    const fallback = beforeData ? { ...beforeData, ...payload } : await fetchExistingAdminRecord(table, target.identity, idColumn, env);
    record = fallback ?? undefined;
  }
  if (!record) {
    throw new Error(`Failed to update ${table} record: no row matched ${idColumn}=${idValue}.`);
  }

  const afterData = record ?? payload;
  if (!options.skipAuditLog) {
    await insertAuditLog(
      "update",
      table,
      idValue,
      afterData,
      actorId,
      env,
      beforeData,
      options.auditMetadata ?? null
    );
  }
  return afterData;
}

export async function deleteAdminRecord(table: string, idColumn: string, idValue: string, actorId: string | null, env: EnvSource = process.env) {
  assertMutableTable(table);
  if (table === "inventory_movements") {
    throw new Error("Inventory movement records are immutable.");
  }
  if (table === "shipment_timeline") {
    throw new Error("Shipment timeline records are immutable.");
  }
  await assertAdminMutationPermission(table, actorId);
  const config = assertSupabaseAdminConfig(env);
  const beforeData = await fetchExistingAdminRecord(table, { [idColumn]: idValue }, idColumn, env);
  const response = await adminRestFetch(`${config.url}/rest/v1/${table}?${idColumn}=eq.${encodeURIComponent(idValue)}`, {
    method: "DELETE",
    headers: headers(config.serviceRoleKey, "return=minimal"),
    signal: mutationSignal()
  });

  if (!response.ok) {
    throw new Error(`Failed to delete ${table} record: ${response.status} ${response.statusText}`);
  }

  await insertAuditLog("delete", table, idValue, { idColumn, idValue }, actorId, env, beforeData, null);
  return { table, idColumn, idValue };
}

export function createHeroBannerDraft(payload: JsonRecord, actorId: string | null, env: EnvSource = process.env) {
  return createAdminRecord("hero_banners", { ...payload, status: "draft" }, actorId, env);
}

export function upsertMediaAssetRecord(
  payload: JsonRecord,
  actorId: string | null,
  env: EnvSource = process.env,
  options: AdminMutationOptions = {}
) {
  return upsertAdminRecord("media_assets", "id", payload, actorId, env, options);
}

export function upsertProductRecord(payload: JsonRecord, actorId: string | null, env: EnvSource = process.env) {
  return upsertAdminRecord("mithron_products", "slug", payload, actorId, env);
}

export function upsertProductMediaAssetRecord(
  payload: JsonRecord,
  actorId: string | null,
  env: EnvSource = process.env,
  options: AdminMutationOptions = {}
) {
  return upsertAdminRecord("product_media_assets", "product_slug,media_asset_id,usage", payload, actorId, env, options);
}

export function updateProductPublicationRecord(payload: JsonRecord, actorId: string | null, env: EnvSource = process.env) {
  return updateAdminRecord("mithron_products", "slug", String(payload.slug ?? ""), payload, actorId, env);
}

export type ProductDeletionBlockers = {
  inventory_movements: number;
  shipment_items: number;
  order_items: number;
  hero_banners: number;
  product_reviews: number;
  faqs: number;
};

export type ProductDeletionBlockerResult = {
  blockers: ProductDeletionBlockers;
  hasBlockers: boolean;
  blockerCount: number;
};

export type ProductDeleteMode = "auto" | "hard" | "force_hard";

export type ProductDeleteOutcome = "archived" | "deleted" | "force_deleted";

export function isProductArchivedRecord(product: JsonRecord) {
  const workflow = String(product.workflow_status ?? "");
  return workflow === "archived" || Boolean(product.archived_at);
}

export async function getProductDeletionBlockers(
  slug: string,
  env: EnvSource = process.env
): Promise<ProductDeletionBlockerResult> {
  const [
    inventoryMovements,
    shipmentItems,
    orderItems,
    heroBanners,
    productReviews,
    faqs
  ] = await Promise.all([
    fetchAdminRecordsByColumn("inventory_movements", "product_slug", slug, env),
    fetchAdminRecordsByColumn("shipment_items", "product_id", slug, env),
    fetchAdminRecordsByColumn("order_items", "product_slug", slug, env),
    fetchAdminRecordsByColumn("hero_banners", "product_slug", slug, env),
    fetchAdminRecordsByColumn("product_reviews", "product_slug", slug, env),
    fetchAdminRecordsByColumn("faqs", "product_slug", slug, env)
  ]);

  const blockers: ProductDeletionBlockers = {
    inventory_movements: inventoryMovements.length,
    shipment_items: shipmentItems.length,
    order_items: orderItems.length,
    hero_banners: heroBanners.length,
    product_reviews: productReviews.length,
    faqs: faqs.length
  };
  const blockerCount = Object.values(blockers).reduce((sum, count) => sum + count, 0);

  return {
    blockers,
    hasBlockers: blockerCount > 0,
    blockerCount
  };
}

function formatProductDeletionBlockerMessage(slug: string, blockers: ProductDeletionBlockers) {
  return `Product ${slug} has operational or storefront references (${JSON.stringify(blockers)}). Archive it instead of hard deleting.`;
}

function assertProductCanForceDelete(slug: string, blockers: ProductDeletionBlockers) {
  if (blockers.order_items > 0 || blockers.shipment_items > 0) {
    throw new Error(
      `Cannot force delete product ${slug} with order or shipment history (${JSON.stringify({
        order_items: blockers.order_items,
        shipment_items: blockers.shipment_items
      })}).`
    );
  }
}

export async function archiveProductRecord(slug: string, actorId: string | null, env: EnvSource = process.env) {
  assertMutableTable("mithron_products");
  await assertAdminMutationPermission("mithron_products", actorId);
  const product = await fetchExistingAdminRecord("mithron_products", { slug }, "slug", env);
  if (!product) {
    throw new Error(`Product ${slug} does not exist or was already deleted.`);
  }

  const now = new Date().toISOString();
  const record = await updateProductPublicationRecord(
    {
      slug,
      workflow_status: "archived",
      is_visible: false,
      published_at: null,
      archived_at: now,
      updated_at: now
    },
    actorId,
    env
  );

  return {
    beforeData: product,
    record
  };
}

async function hardDeleteProductRecord(
  slug: string,
  actorId: string | null,
  env: EnvSource = process.env
) {
  const product = await fetchExistingAdminRecord("mithron_products", { slug }, "slug", env);
  if (!product) {
    throw new Error(`Product ${slug} does not exist or was already deleted.`);
  }

  const deletedDependencies = {
    product_media_assets: (await deleteAdminRecordsByColumn("product_media_assets", "product_slug", slug, actorId, env)).length,
    inventory: (await deleteAdminRecordsByColumn("inventory", "product_slug", slug, actorId, env)).length,
    warehouse_stock: (await deleteAdminRecordsByColumn("warehouse_stock", "product_slug", slug, actorId, env)).length
  };
  const deletedProduct = await deleteAdminRecord("mithron_products", "slug", slug, actorId, env);

  return {
    ...deletedProduct,
    beforeData: product,
    deletedDependencies
  };
}

export async function deleteOrArchiveProduct(
  slug: string,
  actorId: string | null,
  options: { mode: ProductDeleteMode },
  env: EnvSource = process.env
) {
  assertMutableTable("mithron_products");
  await assertAdminMutationPermission("mithron_products", actorId);
  const product = await fetchExistingAdminRecord("mithron_products", { slug }, "slug", env);
  if (!product) {
    throw new Error(`Product ${slug} does not exist or was already deleted.`);
  }

  const blockerResult = await getProductDeletionBlockers(slug, env);

  if (options.mode === "auto") {
    if (blockerResult.hasBlockers) {
      const archived = await archiveProductRecord(slug, actorId, env);
      return {
        outcome: "archived" as const,
        blockers: blockerResult.blockers,
        ...archived
      };
    }

    const deleted = await hardDeleteProductRecord(slug, actorId, env);
    return {
      outcome: "deleted" as const,
      blockers: blockerResult.blockers,
      ...deleted
    };
  }

  if (!isProductArchivedRecord(product)) {
    throw new Error(`Product ${slug} must be archived before permanent delete.`);
  }

  if (options.mode === "hard") {
    if (blockerResult.hasBlockers) {
      throw new Error(formatProductDeletionBlockerMessage(slug, blockerResult.blockers));
    }

    const deleted = await hardDeleteProductRecord(slug, actorId, env);
    return {
      outcome: "deleted" as const,
      blockers: blockerResult.blockers,
      ...deleted
    };
  }

  assertProductCanForceDelete(slug, blockerResult.blockers);
  const deleted = await hardDeleteProductRecord(slug, actorId, env);
  return {
    outcome: "force_deleted" as const,
    blockers: blockerResult.blockers,
    ...deleted
  };
}

export async function deleteProductRecordSafely(
  slug: string,
  actorId: string | null,
  env: EnvSource = process.env,
  options: { force?: boolean } = {}
) {
  const result = await deleteOrArchiveProduct(
    slug,
    actorId,
    { mode: options.force ? "force_hard" : "hard" },
    env
  );

  if (result.outcome !== "deleted" && result.outcome !== "force_deleted") {
    throw new Error(`Expected hard delete for ${slug}, received ${result.outcome}.`);
  }

  return {
    beforeData: result.beforeData,
    deletedDependencies: result.deletedDependencies,
    blockers: result.blockers,
    outcome: result.outcome
  };
}

export function adjustWarehouseStock(payload: JsonRecord, actorId: string | null, env: EnvSource = process.env) {
  return createAdminRecord("warehouse_stock", payload, actorId, env);
}

export function createDeploymentTask(payload: JsonRecord, actorId: string | null, env: EnvSource = process.env) {
  return createAdminRecord("staff_tasks", payload, actorId, env);
}

export async function upsertInventoryRecord(
  payload: JsonRecord,
  actorId: string | null,
  env: EnvSource = process.env,
  options: AdminMutationOptions = {}
) {
  try {
    return await upsertAdminRecord("inventory", "product_slug", payload, actorId, env, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Legacy databases still use UNIQUE (product_slug, sku); PostgREST returns 42P10 for mismatched on_conflict targets.
    if (message.includes("code=42P10")) {
      return upsertAdminRecord("inventory", "product_slug,sku", payload, actorId, env, options);
    }
    throw error;
  }
}

export function upsertWarehouseStockRecord(
  payload: JsonRecord,
  actorId: string | null,
  env: EnvSource = process.env,
  options: AdminMutationOptions = {}
) {
  return upsertAdminRecord("warehouse_stock", "warehouse_code,product_slug,sku", payload, actorId, env, options);
}

export function toInventoryMovementInsertPayload(payload: JsonRecord): JsonRecord {
  const insertPayload = { ...payload };
  const productId = typeof insertPayload.product_id === "string" && insertPayload.product_id.trim()
    ? insertPayload.product_id.trim()
    : typeof insertPayload.product_slug === "string" && insertPayload.product_slug.trim()
      ? insertPayload.product_slug.trim()
      : null;

  if (!productId) {
    throw new Error("Inventory movement product_id is required.");
  }

  insertPayload.product_id = productId;
  delete insertPayload.product_slug;
  return insertPayload;
}

export function createInventoryMovementRecord(payload: JsonRecord, actorId: string | null, env: EnvSource = process.env) {
  return createAdminRecord("inventory_movements", toInventoryMovementInsertPayload(payload), actorId, env, { skipAuditLog: true });
}

export function createOrderRecord(payload: JsonRecord, actorId: string | null, env: EnvSource = process.env) {
  return createAdminRecord("orders", payload, actorId, env);
}

/** Trusted server checkout mutations — auth is enforced in the checkout API route. */
const checkoutApiMutationOptions: AdminMutationOptions = {
  allowSystemActor: true,
  guard: async () => undefined
};

/** Customer checkout — auth verified in /api/checkout before calling this. */
export function createCustomerCheckoutOrderRecord(payload: JsonRecord, actorId: string | null, env: EnvSource = process.env) {
  return createAdminRecord("orders", payload, actorId, env, checkoutApiMutationOptions);
}

/** Atomic checkout create: order + items + soft-reserve in one DB transaction. */
export async function createCustomerCheckoutOrderAtomic(
  orderPayload: JsonRecord,
  orderItems: JsonRecord[],
  actorId: string | null,
  env: EnvSource = process.env,
  warehouseCode?: string
): Promise<{ order_id: string; order_number: string; reservation?: unknown }> {
  assertMutableTable("orders");
  await assertAdminMutationPermission("orders", actorId, checkoutApiMutationOptions);
  const config = assertSupabaseAdminConfig(env);
  const response = await adminRestFetch(`${config.url}/rest/v1/rpc/create_checkout_order`, {
    method: "POST",
    headers: {
      ...headers(config.serviceRoleKey),
      Prefer: "return=representation"
    },
    signal: mutationSignal(),
    body: JSON.stringify({
      p_order: orderPayload,
      p_order_items: orderItems,
      p_warehouse_code: warehouseCode ?? null
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(await mutationErrorMessage(response, "orders", "create"));
  }

  const result = (await response.json()) as {
    ok?: boolean;
    order_id?: string;
    order_number?: string;
    reservation?: unknown;
    error?: string;
  };

  if (!result?.order_id) {
    throw new Error(result?.error || "Atomic checkout order creation failed.");
  }

  return {
    order_id: String(result.order_id),
    order_number: String(result.order_number ?? orderPayload.order_number ?? ""),
    reservation: result.reservation
  };
}

/** Customer checkout line items — auth verified in /api/checkout before calling this. */
export function createCustomerCheckoutOrderItemRecord(payload: JsonRecord, actorId: string | null, env: EnvSource = process.env) {
  return createAdminRecord("order_items", payload, actorId, env, checkoutApiMutationOptions);
}

/** Batch insert checkout line items in a single Supabase request. */
export async function createCustomerCheckoutOrderItemRecords(
  payloads: JsonRecord[],
  actorId: string | null,
  env: EnvSource = process.env
) {
  if (!payloads.length) return;

  assertMutableTable("order_items");
  await assertAdminMutationPermission("order_items", actorId, checkoutApiMutationOptions);
  const config = assertSupabaseAdminConfig(env);
  const response = await adminRestFetch(`${config.url}/rest/v1/order_items`, {
    method: "POST",
    headers: {
      ...headers(config.serviceRoleKey),
      Prefer: "return=minimal"
    },
    signal: mutationSignal(),
    body: JSON.stringify(payloads)
  });

  if (!response.ok) {
    throw new Error(await mutationErrorMessage(response, "order_items", "create"));
  }
}

/** Customer checkout payment row — auth verified in /api/checkout before calling this. */
export function createCustomerCheckoutPaymentRecord(payload: JsonRecord, actorId: string | null, env: EnvSource = process.env) {
  return createAdminRecord("payments", payload, actorId, env, checkoutApiMutationOptions);
}

export function createOrderItemRecord(payload: JsonRecord, actorId: string | null, env: EnvSource = process.env) {
  return createAdminRecord("order_items", payload, actorId, env);
}

export function updateOrderRecord(
  orderId: string,
  payload: JsonRecord,
  actorId: string | null,
  env: EnvSource = process.env,
  options: AdminMutationOptions = {}
) {
  return updateAdminRecord("orders", "id", orderId, payload, actorId, env, options);
}

export function createShipmentRecord(payload: JsonRecord, actorId: string | null, env: EnvSource = process.env) {
  return createAdminRecord("shipments", payload, actorId, env);
}

export function updateShipmentRecord(shipmentId: string, payload: JsonRecord, actorId: string | null, env: EnvSource = process.env) {
  return updateAdminRecord("shipments", "id", shipmentId, payload, actorId, env);
}

export function createShipmentItemRecord(payload: JsonRecord, actorId: string | null, env: EnvSource = process.env) {
  return createAdminRecord("shipment_items", payload, actorId, env);
}

export function createShipmentTimelineRecord(payload: JsonRecord, actorId: string | null, env: EnvSource = process.env) {
  return createAdminRecord("shipment_timeline", payload, actorId, env);
}

export function createDeploymentRequestRecord(payload: JsonRecord, actorId: string | null, env: EnvSource = process.env) {
  return createAdminRecord("deployment_requests", payload, actorId, env);
}

export function updateDeploymentRequestRecord(requestId: string, payload: JsonRecord, actorId: string | null, env: EnvSource = process.env) {
  return updateAdminRecord("deployment_requests", "id", requestId, payload, actorId, env);
}

export function createStaffTaskRecord(payload: JsonRecord, actorId: string | null, env: EnvSource = process.env) {
  return createAdminRecord("staff_tasks", payload, actorId, env);
}

export function updateStaffTaskRecord(taskId: string, payload: JsonRecord, actorId: string | null, env: EnvSource = process.env) {
  return updateAdminRecord("staff_tasks", "id", taskId, payload, actorId, env);
}

/**
 * Builds a stable notifications.dedupe_key from business-event parts
 * (e.g. "order-paid", orderId, recipientId). Keys describe the event —
 * not the request — so retries/concurrent producers are suppressed while
 * distinct events for the same entity still notify.
 */
export function notificationDedupeKey(...parts: Array<string | null | undefined>) {
  return parts
    .map((part) => String(part ?? "").trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "-"))
    .filter(Boolean)
    .join(":");
}

export function createNotificationRecord(
  payload: JsonRecord,
  actorId: string | null,
  env: EnvSource = process.env,
  options: AdminMutationOptions = {}
) {
  return insertNotificationRecord(payload, actorId, env, options);
}

/** Customer checkout notifications — server-side only, no staff permission required. */
export function createCustomerCheckoutNotificationRecord(payload: JsonRecord, env: EnvSource = process.env) {
  return insertNotificationRecord(payload, null, env, { allowSystemActor: true });
}

export function createActivityLogRecord(payload: JsonRecord, actorId: string | null, env: EnvSource = process.env) {
  return insertActivityLogRecord(payload, actorId, env);
}

export async function appendOrderTimelineViaRpc(
  orderId: string,
  entry: JsonRecord,
  actorId: string | null,
  env: EnvSource = process.env,
  options: { expectedUpdatedAt?: string | null } = {}
) {
  await assertAdminMutationPermission("orders", actorId);
  const config = assertSupabaseAdminConfig(env);
  const response = await adminRestFetch(`${config.url}/rest/v1/rpc/append_order_timeline_entry`, {
    method: "POST",
    headers: headers(config.serviceRoleKey),
    cache: "no-store",
    signal: mutationSignal(),
    body: JSON.stringify({
      p_order_id: orderId,
      p_entry: entry,
      p_expected_updated_at: options.expectedUpdatedAt ?? null
    })
  });

  const text = await response.text().catch(() => "");
  if (!response.ok) {
    throw new Error(`Failed to append order timeline: ${response.status} ${response.statusText}${text ? ` - ${text.slice(0, 300)}` : ""}`);
  }

  const result = normalizeMutationRecord(text ? JSON.parse(text) : {});
  if (result.conflict === true) {
    throw new AdminRecordConflictError(
      "Concurrent order update detected. Reload the latest order state and retry.",
      isPlainRecord(result.current_row) ? result.current_row : undefined
    );
  }

  if (result.ok !== true) {
    throw new Error("Failed to append order timeline entry.");
  }

  await insertAuditLog("update", "orders", orderId, normalizeMutationRecord(result.row), actorId, env, null, null);
  return normalizeMutationRecord(result.row);
}

export async function transitionOrderWithTimelineViaRpc(
  orderId: string,
  entry: JsonRecord,
  actorId: string | null,
  env: EnvSource = process.env,
  options: {
    status?: string | null;
    fulfillmentStatus?: string | null;
    paymentStatus?: string | null;
    expectedUpdatedAt?: string | null;
    idempotencyKey?: string | null;
  } = {}
) {
  await assertAdminMutationPermission("orders", actorId);
  const config = assertSupabaseAdminConfig(env);
  const response = await adminRestFetch(`${config.url}/rest/v1/rpc/transition_order_with_timeline`, {
    method: "POST",
    headers: headers(config.serviceRoleKey),
    cache: "no-store",
    signal: mutationSignal(),
    body: JSON.stringify({
      p_order_id: orderId,
      p_entry: entry,
      p_status: options.status ?? null,
      p_fulfillment_status: options.fulfillmentStatus ?? null,
      p_payment_status: options.paymentStatus ?? null,
      p_expected_updated_at: options.expectedUpdatedAt ?? null,
      p_idempotency_key: options.idempotencyKey ?? null
    })
  });

  const text = await response.text().catch(() => "");
  if (!response.ok) {
    throw new Error(
      `Failed to transition order with timeline: ${response.status} ${response.statusText}${text ? ` - ${text.slice(0, 300)}` : ""}`
    );
  }

  const result = normalizeMutationRecord(text ? JSON.parse(text) : {});
  if (result.conflict === true) {
    throw new AdminRecordConflictError(
      "Concurrent order update detected. Reload the latest order state and retry.",
      isPlainRecord(result.current_row) ? result.current_row : undefined
    );
  }

  if (result.ok !== true) {
    throw new Error("Failed to transition order with timeline.");
  }

  if (result.duplicate !== true) {
    await insertAuditLog("update", "orders", orderId, normalizeMutationRecord(result.row), actorId, env, null, null);
  }

  return normalizeMutationRecord(result.row);
}

export async function setProductMediaPrimaryViaRpc(
  productSlug: string,
  mediaAssetId: string,
  usage = "primary",
  actorId: string | null = null,
  env: EnvSource = process.env
) {
  const config = assertSupabaseAdminConfig(env);
  const response = await adminRestFetch(`${config.url}/rest/v1/rpc/set_product_media_primary`, {
    method: "POST",
    headers: headers(config.serviceRoleKey),
    cache: "no-store",
    signal: mutationSignal(),
    body: JSON.stringify({
      p_product_slug: productSlug,
      p_media_asset_id: mediaAssetId,
      p_usage: usage
    })
  });

  const text = await response.text().catch(() => "");
  if (!response.ok) {
    throw new Error(`Failed to set primary product media: ${response.status} ${response.statusText}${text ? ` - ${text.slice(0, 300)}` : ""}`);
  }

  const result = normalizeMutationRecord(text ? JSON.parse(text) : {});
  await insertAuditLog(
    "upsert",
    "product_media_assets",
    `${productSlug}:${mediaAssetId}:${usage}`,
    result,
    actorId,
    env
  );
  return result;
}

export function upsertProfileRecord(
  payload: JsonRecord,
  actorId: string | null,
  env: EnvSource = process.env,
  options: AdminMutationOptions = {}
) {
  return upsertAdminRecord("profiles", "id", payload, actorId, env, options);
}

export function upsertUserRoleRecord(payload: JsonRecord, actorId: string | null, env: EnvSource = process.env) {
  return upsertAdminRecord("user_roles", "user_id,role_key", payload, actorId, env);
}

export async function deleteUserRoleRecord(userId: string, roleKey: string, actorId: string | null, env: EnvSource = process.env) {
  assertMutableTable("user_roles");
  await assertAdminMutationPermission("user_roles", actorId);
  const config = assertSupabaseAdminConfig(env);
  const beforeData = await fetchExistingAdminRecord("user_roles", { user_id: userId, role_key: roleKey }, "user_id,role_key", env);
  const response = await adminRestFetch(
    `${config.url}/rest/v1/user_roles?user_id=eq.${encodeURIComponent(userId)}&role_key=eq.${encodeURIComponent(roleKey)}`,
    {
      method: "DELETE",
      headers: headers(config.serviceRoleKey, "return=representation"),
      signal: mutationSignal()
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to delete user_roles record: ${response.status} ${response.statusText}`);
  }

  const records = await response.json() as JsonRecord[];
  await insertAuditLog(
    "delete",
    "user_roles",
    `${userId}:${roleKey}`,
    { user_id: userId, role_key: roleKey, rows: records.length },
    actorId,
    env,
    beforeData,
    null
  );
  return records;
}
