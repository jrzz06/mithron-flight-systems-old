import { cache } from "react";
import { createClient as createSupabaseServiceClient } from "@supabase/supabase-js";
import { normalizeCmsRole } from "@/lib/auth/permissions";
import { getSupabaseAdminConfig, type SupabaseAdminConfig } from "@/lib/env";
import { buildEnterpriseCleanupReadiness } from "@/services/enterprise-cleanup";
import { countPublishedProductsWithoutPrimaryLink } from "@/services/catalog";
import {
  chunkValues,
  collectOrderItemProductSlugs,
  mergeInventoryRowsByProductSlug
} from "@/lib/inventory-availability";
import { isWarehouseEligible } from "@/lib/orders/lifecycle";
import { operationalArchiveHotCutoffIso } from "@/services/data-archive";

type EnvSource = Record<string, string | undefined>;
type AdminSnapshotStatus = "LIVE" | "PARTIAL" | "BLOCKED";
type AdminRow = Record<string, unknown>;

type AdminSnapshot<T extends Record<string, unknown>> = {
  status: AdminSnapshotStatus;
  source: "supabase-admin" | "blocked";
  blockedReason?: string;
  snapshotLimitWarning?: string;
  data: T;
};

type WarehouseSnapshotScope =
  | "full"
  | "dashboard"
  | "orders"
  | "picking"
  | "packing"
  | "dispatch"
  | "transfers"
  | "movements"
  | "activity"
  | "settings";

type WarehouseSnapshotTable =
  | "products"
  | "inventory"
  | "stock"
  | "movements"
  | "orders"
  | "orderItems"
  | "shipments"
  | "shipmentItems"
  | "shipmentTimeline"
  | "activityLogs";

type WarehouseSnapshotInput = EnvSource | {
  env?: EnvSource;
  scope?: WarehouseSnapshotScope;
  ordersFilter?: "all" | "warehouse";
};

type CountMetric = {
  table: string;
  count: number;
  status: "LIVE" | "UNAVAILABLE";
};

export type DashboardOperationalCounts = {
  pendingOrdersReview: CountMetric;
  lowStockAlerts: CountMetric;
  pendingSupplierSubmissions: CountMetric;
  openEnquiries: CountMetric;
};

export type PendingSupplierSubmission = {
  slug: string;
  name: string;
  supplierLabel: string;
  updatedAt: string;
};

function combineCountMetrics(label: string, left: CountMetric, right: CountMetric): CountMetric {
  if (left.status === "UNAVAILABLE" && right.status === "UNAVAILABLE") {
    return { table: label, count: 0, status: "UNAVAILABLE" };
  }
  return {
    table: label,
    count: (left.status === "LIVE" ? left.count : 0) + (right.status === "LIVE" ? right.count : 0),
    status: left.status === "LIVE" || right.status === "LIVE" ? "LIVE" : "UNAVAILABLE"
  };
}

export function formatDashboardCount(metric: CountMetric) {
  return metric.status === "LIVE" ? String(metric.count) : "—";
}

export function orderNeedsAdminReview(order: AdminRow) {
  const status = String(order.status ?? "pending");
  const channel = String(order.channel ?? "checkout");
  return (
    ["paid", "admin_review", "pending_payment"].includes(status)
    || (channel === "enquiry" && ["admin_review", "pending_payment"].includes(status))
  );
}

const ADMIN_LIST_LIMIT = 80;
const ADMIN_FETCH_TIMEOUT_MS = 30_000;
const MEDIA_LIBRARY_LIMIT = 96;
const PRODUCT_MANAGER_LIMIT = 120;
const PRODUCT_RELATION_LIMIT = 160;
const PRODUCT_LIST_SELECT =
  "slug,name,category,price,compare_at,badge,badge_enabled,badge_text,badge_style,description,description_json,specs,on_sale,discount_type,discount_value,cost_of_goods,show_price_per_unit,charge_tax,tax_group,tax_rate,tax_included,image,hero,gallery,workflow_status,published_at,archived_at,is_visible,sort_order,updated_at,source_availability,tagline";
const PRODUCT_EDITOR_SELECT =
  "slug,name,category,price,compare_at,badge,badge_enabled,badge_text,badge_style,description,on_sale,discount_type,discount_value,cost_of_goods,show_price_per_unit,charge_tax,tax_group,tax_rate,tax_included,image,hero,gallery,variants,specs,workflow_status,published_at,archived_at,is_visible,seo_title,seo_description,og_title,og_description,og_image,source_availability,sort_order,updated_at,tagline";
const MOVEMENT_AUDIT_LIMIT = 80;

const warehouseSnapshotScopes: Record<WarehouseSnapshotScope, Set<WarehouseSnapshotTable>> = {
  full: new Set(["products", "inventory", "stock", "movements", "orders", "orderItems", "shipments", "shipmentItems", "shipmentTimeline", "activityLogs"]),
  dashboard: new Set(["inventory", "stock", "movements", "orders", "orderItems", "shipments"]),
  orders: new Set(["products", "inventory", "orders", "orderItems", "shipments"]),
  picking: new Set(["inventory", "orders", "orderItems"]),
  packing: new Set(["orders", "orderItems", "shipments"]),
  dispatch: new Set(["shipments", "shipmentItems", "shipmentTimeline", "orders", "orderItems"]),
  transfers: new Set(["stock", "movements"]),
  movements: new Set(["movements"]),
  activity: new Set(["movements", "shipmentTimeline", "activityLogs"]),
  settings: new Set(["inventory", "stock", "shipments"])
};

const dashboardQueries = {
  orders: "select=id,order_number,customer_email,status,payment_status,fulfillment_status,channel,total,currency,created_at,updated_at&order=created_at.desc&limit=8",
  ordersNeedingReview:
    "select=id,order_number,customer_email,status,payment_status,fulfillment_status,channel,total,currency,created_at,updated_at&status=in.(paid,admin_review,pending_payment)&order=created_at.desc&limit=8",
  shipments: "select=id,shipment_number,shipment_status,order_id,warehouse_id,updated_at,created_at&order=updated_at.desc&limit=8",
  inventoryMovements: "select=id,movement_type,product_slug,sku,quantity_delta,created_at&order=created_at.desc&limit=8",
  contentRevisions: "select=id,entity_table,entity_id,revision,change_summary,created_at&order=created_at.desc&limit=8",
  mediaAssets: "select=id,bucket,folder,storage_path,public_url,mime_type,created_at,updated_at&order=created_at.desc&limit=8",
  notifications: "select=id,title,status,created_at,read_at&order=created_at.desc&limit=8",
  activityLogs: "select=id,action,entity_table,entity_id,severity,created_at&order=created_at.desc&limit=8",
  deploymentRequests: "select=id,requester_email,region,mission_profile,status,created_at,updated_at&status=in.(pending,triaged,approved,scheduled,blocked,escalated)&order=updated_at.desc&limit=8",
  staffTasks: "select=id,title,status,priority,assigned_to,due_at,created_at,updated_at&status=in.(open,in_progress,blocked)&order=updated_at.desc&limit=8",
  lowStockInventory: "select=product_slug,sku,stock_status,quantity,reorder_threshold,updated_at&stock_status=in.(low_stock,out_of_stock)&order=updated_at.desc&limit=8"
} as const;

const operationsQueries = {
  operationRoutes: "select=id,route_key,label,href,module_key,required_role,sort_order,is_visible,status&order=sort_order.asc&limit=40",
  deploymentRequests: "select=id,order_id,requester_email,region,mission_profile,status,assigned_to,created_at,updated_at&order=created_at.desc&limit=60",
  staffTasks: "select=id,title,status,priority,assigned_to,due_at,created_at,updated_at&order=created_at.desc&limit=60",
  notifications: "select=id,title,status,priority,entity_table,entity_id,created_at,read_at&order=created_at.desc&limit=60",
  activityLogs: "select=id,action,entity_table,entity_id,severity,created_at&order=created_at.desc&limit=60",
  orders: "select=id,order_number,status,payment_status,fulfillment_status,total,currency,updated_at,created_at&order=updated_at.desc&limit=40",
  shipments: "select=id,shipment_number,shipment_status,status,carrier_name,tracking_number,updated_at,created_at&order=updated_at.desc&limit=40"
} as const;

const auditQueries = {
  auditLogs: "select=id,actor_id,action,entity_table,entity_id,metadata,created_at&order=created_at.desc&limit=60",
  activityLogs: "select=id,actor_id,action,entity_table,entity_id,severity,metadata,created_at&order=created_at.desc&limit=60",
  securityEvents: "select=id,actor_user_id,actor_role,event_type,attempted_resource,denial_reason,route_path,http_status,severity,metadata,created_at&order=created_at.desc&limit=80",
  restDenials: "select=id,actor_user_id,actor_role,event_type,attempted_resource,denial_reason,route_path,http_status,severity,metadata,created_at&event_type=in.(security.rest_denied,security.rls_denied,security.denied_mutation)&order=created_at.desc&limit=80",
  realtimeAnomalies: "select=id,actor_user_id,actor_role,event_type,attempted_resource,denial_reason,route_path,http_status,severity,metadata,created_at&event_type=eq.security.realtime_denied&order=created_at.desc&limit=80",
  privilegeEscalations: "select=id,actor_user_id,actor_role,event_type,attempted_resource,denial_reason,route_path,http_status,severity,metadata,created_at&event_type=eq.security.privilege_escalation&order=created_at.desc&limit=80",
  authAnomalies: "select=id,actor_user_id,actor_role,event_type,attempted_resource,denial_reason,route_path,http_status,severity,metadata,created_at&event_type=in.(security.invalid_jwt,security.auth_failed)&order=created_at.desc&limit=80",
  authEvents: "select=id,actor_id,action,entity_table,entity_id,severity,metadata,created_at&action=like.auth.%25&order=created_at.desc&limit=80",
  deniedActions: "select=id,actor_id,action,entity_table,entity_id,severity,metadata,created_at&action=like.security.%25&order=created_at.desc&limit=80",
  governanceTimeline: "select=id,actor_id,action,entity_table,entity_id,severity,metadata,created_at&entity_table=in.(profiles,user_roles,admin_invites)&order=created_at.desc&limit=80",
  productActivity: "select=id,actor_id,action,entity_table,entity_id,severity,metadata,created_at&action=like.products.%25&order=created_at.desc&limit=80",
  notifications: "select=id,title,status,priority,entity_table,entity_id,created_at,read_at&order=created_at.desc&limit=80"
} as const;

const governanceQueries = {
  profiles: "select=id,email,display_name,default_role,created_at,updated_at&order=updated_at.desc&limit=160",
  userRoles: "select=user_id,role_key,created_at&order=created_at.desc&limit=320",
  roles: "select=key,label,description,sort_order&order=sort_order.asc&limit=40",
  adminInvites: "select=id,email,role_key,status,expires_at,created_at,updated_at&order=created_at.desc&limit=80",
  activityLogs: "select=id,actor_id,action,entity_table,entity_id,severity,metadata,created_at&or=(entity_table.in.(profiles,user_roles,admin_invites,auth),action.like.users.%25)&order=created_at.desc&limit=40"
} as const;

const supplierDirectoryQueries = {
  supplierRoles: "select=user_id,role_key,created_at&role_key=eq.supplier&order=created_at.desc&limit=160",
  profiles: "select=id,email,display_name,phone,governance_status,created_at,updated_at&order=updated_at.desc&limit=320"
} as const;

const adminSettingsQueries = {
  settings: "select=id,payload,updated_at&order=updated_at.desc&limit=1",
  mediaUsage: "select=id,mime_type,file_size_bytes,size_bytes,variants,responsive_variants,updated_at&order=updated_at.desc&limit=160"
} as const;

const cmsWorkspaceQueries = {
  cmsPages: "select=id,slug,title,route_path,sort_order,is_visible,status,revision,updated_at,created_at&order=sort_order.asc&limit=20",
  cmsSections: "select=id,page_id,section_key,component_key,title,payload,sort_order,is_visible,status,revision,updated_at,created_at&order=sort_order.asc&limit=20",
  heroBanners: "select=id,product_slug,title,subtitle,cta_label,href,image,poster,video,theme,composition,title_color,subtitle_color,starts_at,ends_at,sort_order,is_visible,status,revision,updated_at,created_at&order=sort_order.asc&limit=20",
  homepageSections: "select=id,section_key,label,component_key,payload,sort_order,is_visible,status,revision,updated_at,created_at&order=sort_order.asc&limit=20",
  sectionVisibility: "select=id,section_key,route_path,is_visible,starts_at,ends_at,status,created_at&order=created_at.desc&limit=20",
  homepageOrdering: "select=section_key,sort_order,is_visible,status,updated_at&order=sort_order.asc&limit=20",
  siteNavigation: "select=id,label,href,placement,sort_order,is_visible,status,revision,updated_at,created_at&order=sort_order.asc&limit=20",
  footerColumns: "select=id,title,sort_order,is_visible,status,revision,updated_at,created_at&order=sort_order.asc&limit=20",
  footerLinks: "select=id,column_id,label,href,sort_order,is_visible,status,revision,updated_at,created_at&order=sort_order.asc&limit=20",
  categoryMetadata: "select=route_key,title,subtitle,hero_image,showcase_image,personality,featured_product_slugs,ecosystem_payload,sort_order,is_visible,status,revision,updated_at,created_at&order=sort_order.asc&limit=20",
  productReviews: "select=id,product_slug,reviewer_name,body,rating,sort_order,is_visible,status,revision,updated_at,created_at&order=sort_order.asc&limit=20",
  faqs: "select=id,scope,product_slug,question,answer,sort_order,is_visible,status,revision,updated_at,created_at&order=sort_order.asc&limit=40",
  promotionalCampaigns: "select=id,label,headline,body,cta_label,href,media_asset_id,starts_at,ends_at,sort_order,is_visible,status,revision,updated_at,created_at&order=sort_order.asc&limit=40",
  mediaAssets: "select=id,public_url,caption,alt,alt_text,width,height,usage_scope,metadata,updated_at&order=updated_at.desc&limit=40",
  contentRevisions: "select=id,entity_table,entity_id,revision,snapshot,change_summary,created_at&order=created_at.desc&limit=20"
} as const;

type GovernedUser = {
  id: string;
  email: string;
  display_name: string;
  default_role: string;
  roles: string[];
  status: string;
  created_at: string;
  last_sign_in_at: string | null;
  banned_until: string | null;
};

export type UserGovernanceActivityItem = {
  id: string;
  timestamp: string;
  actorName: string;
  actionLabel: string;
  targetLabel: string;
};

export type AdminSupplierItem = {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  verificationStatus: string;
  registeredAt: string;
};

type SupabaseAuthUser = {
  id: string;
  email?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
  created_at?: string;
  last_sign_in_at?: string | null;
  banned_until?: string | null;
  email_confirmed_at?: string | null;
};

function blockedSnapshot<T extends Record<string, unknown>>(message: string, data: T): AdminSnapshot<T> {
  return {
    status: "BLOCKED",
    source: "blocked",
    blockedReason: message,
    data
  };
}

const personalEmailDomains = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "live.com"
]);

const userGovernanceActionLabels: Record<string, string> = {
  "users.create": "Created user",
  "users.invite": "Sent invite",
  "users.invite_duplicate": "Blocked duplicate invite",
  "users.invite_notification": "Logged invite notification",
  "users.role_assign": "Changed role",
  "users.role_remove": "Removed role",
  "users.disable": "Disabled account",
  "users.reactivate": "Reactivated account",
  "users.remove": "Removed user",
  "users.password_reset": "Reset password",
  "auth.login": "Signed in",
  "auth.logout": "Signed out",
  "auth.session_revoked": "Revoked session",
  "auth.invite_accept": "Accepted invite",
  "auth.failed_login": "Failed login"
};

function readActivityMetadata(row: AdminRow) {
  const metadata = row.metadata;
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
}

function readActivityStateField(state: unknown, key: string) {
  if (!state || typeof state !== "object" || Array.isArray(state)) return null;
  const value = (state as Record<string, unknown>)[key];
  return value == null ? null : String(value);
}

function deriveCompanyLabel(email: string, metadata: Record<string, unknown>) {
  const explicit = metadata.company ?? metadata.company_name ?? metadata.organization;
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();

  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (!domain || personalEmailDomains.has(domain)) return "—";
  const label = domain.split(".")[0] ?? "";
  if (!label) return "—";
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function userGovernanceActionLabel(action: string) {
  if (userGovernanceActionLabels[action]) return userGovernanceActionLabels[action];
  return action.replaceAll(".", " ").replaceAll("_", " ");
}

export function mapUserGovernanceActivity(
  activity: AdminRow[],
  users: GovernedUser[],
  invites: AdminRow[] = []
): UserGovernanceActivityItem[] {
  const userById = new Map(users.map((user) => [user.id, user]));
  const inviteById = new Map(invites.map((invite) => [String(invite.id ?? ""), invite]));

  return activity.map((row) => {
    const metadata = readActivityMetadata(row);
    const actorId = String(row.actor_id ?? "");
    const actor = userById.get(actorId);
    const targetUserId = metadata.target_user_id ? String(metadata.target_user_id) : "";
    const targetUser = targetUserId ? userById.get(targetUserId) : null;
    const entityTable = String(row.entity_table ?? "");
    const entityId = String(row.entity_id ?? "");
    const action = String(row.action ?? "");

    let targetLabel = "—";
    if (targetUser) {
      targetLabel = targetUser.display_name || targetUser.email;
    } else if (entityTable === "admin_invites") {
      const invite = inviteById.get(entityId);
      targetLabel = String(invite?.email ?? metadata.email ?? readActivityStateField(metadata.after_state, "email") ?? entityId);
    } else if (entityTable === "user_roles") {
      const role = readActivityStateField(metadata.after_state, "role")
        ?? readActivityStateField(metadata.after_state, "role_key");
      const roleUserId = readActivityStateField(metadata.after_state, "user_id") ?? targetUserId;
      const roleUser = roleUserId ? userById.get(roleUserId) : null;
      if (roleUser && role) targetLabel = `${roleUser.email} → ${role}`;
      else if (roleUser) targetLabel = roleUser.display_name || roleUser.email;
      else if (role) targetLabel = role;
    } else if (entityTable === "profiles") {
      const profileUser = userById.get(entityId);
      targetLabel = profileUser
        ? profileUser.display_name || profileUser.email
        : String(readActivityStateField(metadata.after_state, "email") ?? metadata.email ?? entityId);
    } else if (entityTable === "auth") {
      targetLabel = actor?.email ?? "Auth session";
    } else if (entityTable && entityId) {
      targetLabel = entityTable;
    }

    return {
      id: String(row.id ?? `${action}-${row.created_at ?? ""}`),
      timestamp: String(row.created_at ?? ""),
      actorName: actor?.display_name || actor?.email || (actorId ? "Team member" : "System"),
      actionLabel: userGovernanceActionLabel(action),
      targetLabel
    };
  });
}

function isWarehouseSnapshotScope(value: unknown): value is WarehouseSnapshotScope {
  return typeof value === "string" && value in warehouseSnapshotScopes;
}

function resolveWarehouseSnapshotInput(input: WarehouseSnapshotInput = process.env) {
  const isOptions = Boolean(input && typeof input === "object" && ("scope" in input || "env" in input || "ordersFilter" in input));
  const options = isOptions ? input as { env?: EnvSource; scope?: unknown; ordersFilter?: "all" | "warehouse" } : null;
  const scope = isWarehouseSnapshotScope(options?.scope) ? options.scope : "full";
  return {
    env: options ? (options.env ?? process.env) : (input as EnvSource),
    scope,
    tables: warehouseSnapshotScopes[scope],
    ordersFilter: options?.ordersFilter ?? "warehouse"
  };
}

function getAdminHeaders(config: Extract<SupabaseAdminConfig, { configured: true }>) {
  return {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    "Content-Type": "application/json"
  };
}

function getSupabaseServiceClient(config: Extract<SupabaseAdminConfig, { configured: true }>) {
  return createSupabaseServiceClient(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

async function listGovernanceAuthUsers(config: Extract<SupabaseAdminConfig, { configured: true }>) {
  try {
    const supabase = getSupabaseServiceClient(config);
    const authUsers = await supabase.auth.admin.listUsers({ page: 1, perPage: 100 });
    if (authUsers.error) {
      return { users: [] as SupabaseAuthUser[], error: authUsers.error.message };
    }
    return { users: (authUsers.data?.users ?? []) as SupabaseAuthUser[], error: undefined };
  } catch (error) {
    return {
      users: [] as SupabaseAuthUser[],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function adminFetchErrorMessage(error: unknown) {
  if (error instanceof Error) {
    const cause = error.cause instanceof Error ? error.cause.message : "";
    return cause ? `${error.message} (${cause})` : error.message;
  }
  return String(error);
}

async function fetchAdminRows<T extends AdminRow>(
  config: Extract<SupabaseAdminConfig, { configured: true }>,
  table: string,
  query = `select=id&limit=${ADMIN_LIST_LIMIT}`
) {
  try {
    const response = await fetch(`${config.url}/rest/v1/${table}?${query}`, {
      headers: getAdminHeaders(config),
      cache: "no-store",
      signal: AbortSignal.timeout(ADMIN_FETCH_TIMEOUT_MS)
    });

    if (!response.ok) {
      return {
        table,
        status: "UNAVAILABLE" as const,
        rows: [] as T[],
        error: `${response.status} ${response.statusText}`
      };
    }

    return {
      table,
      status: "LIVE" as const,
      rows: (await response.json()) as T[]
    };
  } catch (error) {
    return {
      table,
      status: "UNAVAILABLE" as const,
      rows: [] as T[],
      error: adminFetchErrorMessage(error)
    };
  }
}

async function countTableRows(
  config: Extract<SupabaseAdminConfig, { configured: true }>,
  table: string,
  query = "select=id&limit=1"
): Promise<CountMetric> {
  try {
    const response = await fetch(`${config.url}/rest/v1/${table}?${query}`, {
      method: "HEAD",
      headers: {
        ...getAdminHeaders(config),
        Prefer: "count=exact"
      },
      cache: "no-store",
      signal: AbortSignal.timeout(ADMIN_FETCH_TIMEOUT_MS)
    });

    if (!response.ok) {
      return { table, count: 0, status: "UNAVAILABLE" };
    }

    const range = response.headers.get("content-range");
    const count = range?.includes("/") ? Number(range.split("/").at(-1)) : 0;
    return { table, count: Number.isFinite(count) ? count : 0, status: "LIVE" };
  } catch {
    return { table, count: 0, status: "UNAVAILABLE" };
  }
}

async function countTable(config: Extract<SupabaseAdminConfig, { configured: true }>, table: string): Promise<CountMetric> {
  return countTableRows(config, table);
}

async function fetchStorageBuckets(config: Extract<SupabaseAdminConfig, { configured: true }>) {
  try {
    const response = await fetch(`${config.url}/storage/v1/bucket`, {
      headers: getAdminHeaders(config),
      cache: "no-store",
      signal: AbortSignal.timeout(ADMIN_FETCH_TIMEOUT_MS)
    });

    if (!response.ok) {
      return {
        table: "storage.buckets",
        status: "UNAVAILABLE" as const,
        rows: [] as AdminRow[],
        error: `${response.status} ${response.statusText}`
      };
    }

    return {
      table: "storage.buckets",
      status: "LIVE" as const,
      rows: (await response.json()) as AdminRow[]
    };
  } catch (error) {
    return {
      table: "storage.buckets",
      status: "UNAVAILABLE" as const,
      rows: [] as AdminRow[],
      error: adminFetchErrorMessage(error)
    };
  }
}

function statusFromMetrics(metrics: CountMetric[]): "LIVE" | "PARTIAL" {
  return metrics.every((metric) => metric.status === "LIVE") ? "LIVE" : "PARTIAL";
}

const loadAdminDashboardSnapshot = cache(async (env: EnvSource = process.env) => {
  const config = getSupabaseAdminConfig(env);
  const emptyOperationalCounts: DashboardOperationalCounts = {
    pendingOrdersReview: { table: "orders.pending_review", count: 0, status: "UNAVAILABLE" },
    lowStockAlerts: { table: "inventory.low_stock", count: 0, status: "UNAVAILABLE" },
    pendingSupplierSubmissions: { table: "mithron_products.pending_review", count: 0, status: "UNAVAILABLE" },
    openEnquiries: { table: "enquiries.open", count: 0, status: "UNAVAILABLE" }
  };
  const emptyData = {
    metrics: [] as CountMetric[],
    operationalCounts: emptyOperationalCounts,
    recentOrders: [] as AdminRow[],
    ordersNeedingReview: [] as AdminRow[],
    recentNotifications: [] as AdminRow[],
    recentActivity: [] as AdminRow[],
    lowStockAlerts: [] as AdminRow[],
    pendingSupplierSubmissionRows: [] as PendingSupplierSubmission[]
  };
  if (!config.configured) return blockedSnapshot(config.message, emptyData);

  const [
    metrics,
    operationalCounts,
    recentOrders,
    ordersNeedingReview,
    recentNotifications,
    recentActivity,
    lowStockAlerts,
    pendingSupplierSubmissionRows
  ] = await Promise.all([
    Promise.all([
      countTable(config, "orders"),
      countTable(config, "mithron_products"),
      countTable(config, "inventory"),
      countTable(config, "notifications")
    ]),
    Promise.all([
      countTableRows(config, "orders", "select=id&status=in.(paid,admin_review,pending_payment)&limit=1").then((metric) => ({
        ...metric,
        table: "orders.pending_review"
      })),
      countTableRows(config, "inventory", "select=product_slug&stock_status=in.(low_stock,out_of_stock)&limit=1").then((metric) => ({
        ...metric,
        table: "inventory.low_stock"
      })),
      countTableRows(config, "mithron_products", "select=slug&workflow_status=eq.pending_review&limit=1").then((metric) => ({
        ...metric,
        table: "mithron_products.pending_review"
      })),
      Promise.all([
        countTableRows(config, "enquiries", "select=id&status=eq.new&limit=1"),
        countTableRows(config, "orders", "select=id&channel=eq.enquiry&status=eq.admin_review&limit=1")
      ]).then(([contactEnquiries, checkoutEnquiries]) =>
        combineCountMetrics("enquiries.open", { ...contactEnquiries, table: "enquiries.new" }, { ...checkoutEnquiries, table: "orders.enquiry_review" })
      )
    ]).then(([pendingOrdersReview, lowStockAlertsCount, pendingSupplierSubmissions, openEnquiries]) => ({
      pendingOrdersReview,
      lowStockAlerts: lowStockAlertsCount,
      pendingSupplierSubmissions,
      openEnquiries
    })),
    fetchAdminRows(config, "orders", dashboardQueries.orders),
    fetchAdminRows(config, "orders", dashboardQueries.ordersNeedingReview),
    fetchAdminRows(config, "notifications", dashboardQueries.notifications),
    fetchAdminRows(config, "activity_logs", dashboardQueries.activityLogs),
    fetchAdminRows(config, "inventory", dashboardQueries.lowStockInventory),
    listPendingSupplierSubmissions(env)
  ]);
  const rowTables = [recentOrders, ordersNeedingReview, recentNotifications, recentActivity, lowStockAlerts];
  const operationalMetricList = Object.values(operationalCounts);

  return {
    status:
      statusFromMetrics(metrics) === "LIVE"
      && operationalMetricList.every((metric) => metric.status === "LIVE")
      && rowTables.every((table) => table.status === "LIVE")
        ? "LIVE" as const
        : "PARTIAL" as const,
    source: "supabase-admin" as const,
    blockedReason: rowTables.find((table) => table.status !== "LIVE")?.error,
    data: {
      metrics,
      operationalCounts,
      recentOrders: recentOrders.rows,
      ordersNeedingReview: ordersNeedingReview.rows,
      recentNotifications: recentNotifications.rows,
      recentActivity: recentActivity.rows,
      lowStockAlerts: lowStockAlerts.rows,
      pendingSupplierSubmissionRows
    }
  };
});

export async function getAdminDashboardSnapshot(env: EnvSource = process.env) {
  const { readThroughCache, REDIS_CACHE_KEYS } = await import("@/lib/cache-redis");
  const { cacheControlPlaneRead } = await import("@/lib/control-plane/query-cache");
  return readThroughCache(
    REDIS_CACHE_KEYS.controlPlaneAdminDashboard,
    30,
    () =>
      cacheControlPlaneRead(
        ["admin-dashboard-snapshot"],
        () => loadAdminDashboardSnapshot(env),
        {
          revalidate: 30,
          tags: [
            "admin-dashboard",
            "control-plane-orders",
            "control-plane-inventory",
            "control-plane-enquiries",
            "control-plane-notifications",
            "control-plane-activity",
            "control-plane-catalog"
          ]
        }
      )
  );
}

export const getAuditObservabilitySnapshot = cache(async (env: EnvSource = process.env) => {
  const config = getSupabaseAdminConfig(env);
  const emptyData = {
    metrics: [] as CountMetric[],
    auditLogs: [] as AdminRow[],
    activityLogs: [] as AdminRow[],
    securityEvents: [] as AdminRow[],
    restDenials: [] as AdminRow[],
    realtimeAnomalies: [] as AdminRow[],
    privilegeEscalations: [] as AdminRow[],
    authAnomalies: [] as AdminRow[],
    authEvents: [] as AdminRow[],
    deniedActions: [] as AdminRow[],
    governanceTimeline: [] as AdminRow[],
    productActivity: [] as AdminRow[],
    notifications: [] as AdminRow[]
  };
  if (!config.configured) return blockedSnapshot(config.message, emptyData);

  const [
    metrics,
    auditLogs,
    activityLogs,
    securityEvents,
    restDenials,
    realtimeAnomalies,
    privilegeEscalations,
    authAnomalies,
    authEvents,
    deniedActions,
    governanceTimeline,
    productActivity,
    notifications
  ] = await Promise.all([
    Promise.all([
      countTable(config, "audit_logs"),
      countTable(config, "activity_logs"),
      countTable(config, "security_events"),
      countTable(config, "notifications")
    ]),
    fetchAdminRows(config, "audit_logs", withOperationalHotWindow(auditQueries.auditLogs)),
    fetchAdminRows(config, "activity_logs", withOperationalHotWindow(auditQueries.activityLogs)),
    fetchAdminRows(config, "security_events", auditQueries.securityEvents),
    fetchAdminRows(config, "security_events", auditQueries.restDenials),
    fetchAdminRows(config, "security_events", auditQueries.realtimeAnomalies),
    fetchAdminRows(config, "security_events", auditQueries.privilegeEscalations),
    fetchAdminRows(config, "security_events", auditQueries.authAnomalies),
    fetchAdminRows(config, "activity_logs", withOperationalHotWindow(auditQueries.authEvents)),
    fetchAdminRows(config, "activity_logs", withOperationalHotWindow(auditQueries.deniedActions)),
    fetchAdminRows(config, "activity_logs", withOperationalHotWindow(auditQueries.governanceTimeline)),
    fetchAdminRows(config, "activity_logs", withOperationalHotWindow(auditQueries.productActivity)),
    fetchAdminRows(config, "notifications", auditQueries.notifications)
  ]);

  const rowTables = [auditLogs, activityLogs, securityEvents, restDenials, realtimeAnomalies, privilegeEscalations, authAnomalies, authEvents, deniedActions, governanceTimeline, productActivity, notifications];

  return {
    status: metrics.every((metric) => metric.status === "LIVE") && rowTables.every((table) => table.status === "LIVE") ? "LIVE" as const : "PARTIAL" as const,
    source: "supabase-admin" as const,
    blockedReason: rowTables.find((table) => table.status !== "LIVE")?.error,
    data: {
      metrics,
      auditLogs: auditLogs.rows,
      activityLogs: activityLogs.rows,
      securityEvents: securityEvents.rows,
      restDenials: restDenials.rows,
      realtimeAnomalies: realtimeAnomalies.rows,
      privilegeEscalations: privilegeEscalations.rows,
      authAnomalies: authAnomalies.rows,
      authEvents: authEvents.rows,
      deniedActions: deniedActions.rows,
      governanceTimeline: governanceTimeline.rows,
      productActivity: productActivity.rows,
      notifications: notifications.rows
    }
  };
});

export const getEnterpriseCleanupSnapshot = cache(async (env: EnvSource = process.env) => {
  const config = getSupabaseAdminConfig(env);
  const blockedReadiness = buildEnterpriseCleanupReadiness({
    cmsCutoverReady: false,
    cmsParityVerified: false,
    mediaParityVerified: false,
    canonicalMediaRows: 0,
    productMediaLinks: 0,
    realtimeStabilized: false,
    warehouseAuthenticatedVerified: false,
    rollbackRecoveryVerified: false
  });
  const emptyData = {
    readiness: blockedReadiness,
    remoteCounts: [] as CountMetric[]
  };
  if (!config.configured) return blockedSnapshot(config.message, emptyData);

  const remoteCounts = await Promise.all([
    countTable(config, "product_reviews"),
    countTable(config, "promotional_campaigns"),
    countTable(config, "section_visibility"),
    countTable(config, "content_revisions"),
    countTable(config, "media_assets"),
    countTable(config, "product_media_assets"),
    countTable(config, "mithron_assets"),
    countTable(config, "inventory"),
    countTable(config, "warehouse_stock"),
    countTable(config, "inventory_movements"),
    countTable(config, "shipments"),
    countTable(config, "shipment_timeline"),
    countTable(config, "notifications"),
    countTable(config, "activity_logs")
  ]);
  const byTable = new Map(remoteCounts.map((metric) => [metric.table, metric]));
  const count = (table: string) => byTable.get(table)?.count ?? 0;
  const live = (table: string) => byTable.get(table)?.status === "LIVE";

  const cmsCutoverReady = count("product_reviews") > 0
    && count("promotional_campaigns") > 0
    && count("section_visibility") > 0
    && count("content_revisions") > 0;
  const realtimeStabilized = live("notifications") && live("activity_logs");
  const warehouseRemoteReady = live("inventory")
    && live("warehouse_stock")
    && live("inventory_movements")
    && live("shipments")
    && live("shipment_timeline");

  const canonicalMediaRows = count("media_assets");
  const productMediaLinks = count("product_media_assets");
  const primaryLinkCoverage = await countPublishedProductsWithoutPrimaryLink();
  const mediaParityVerified = canonicalMediaRows > 0
    && productMediaLinks > 0
    && primaryLinkCoverage.publishedCount > 0
    && primaryLinkCoverage.missingCount === 0;

  const readiness = buildEnterpriseCleanupReadiness({
    cmsCutoverReady,
    cmsParityVerified: false,
    mediaParityVerified,
    canonicalMediaRows,
    productMediaLinks,
    realtimeStabilized,
    warehouseAuthenticatedVerified: false,
    rollbackRecoveryVerified: false
  });

  return {
    status: remoteCounts.every((metric) => metric.status === "LIVE") && warehouseRemoteReady ? readiness.status : "PARTIAL" as const,
    source: "supabase-admin" as const,
    blockedReason: readiness.blockers.join(" "),
    data: { readiness, remoteCounts }
  };
});

export const getUserGovernanceSnapshot = cache(async (env: EnvSource = process.env) => {
  const config = getSupabaseAdminConfig(env);
  const emptyData = {
    users: [] as GovernedUser[],
    roles: [] as AdminRow[],
    invites: [] as AdminRow[],
    activity: [] as AdminRow[]
  };
  if (!config.configured) return blockedSnapshot(config.message, emptyData);

  const [authUsers, profiles, userRoles, roles, invites, activity, governanceTimeline] = await Promise.all([
    listGovernanceAuthUsers(config),
    fetchAdminRows(config, "profiles", governanceQueries.profiles),
    fetchAdminRows(config, "user_roles", governanceQueries.userRoles),
    fetchAdminRows(config, "roles", governanceQueries.roles),
    fetchAdminRows(config, "admin_invites", governanceQueries.adminInvites),
    fetchAdminRows(config, "activity_logs", governanceQueries.activityLogs),
    fetchAdminRows(config, "activity_logs", auditQueries.governanceTimeline)
  ]);

  const profileById = new Map(profiles.rows.map((profile) => [String(profile.id ?? ""), profile]));
  const authById = new Map(authUsers.users.map((user) => [user.id, user]));
  const rolesByUser = new Map<string, string[]>();
  for (const row of userRoles.rows) {
    const userId = String(row.user_id ?? "");
    const roleKey = normalizeCmsRole(row.role_key);
    if (!userId || !roleKey) continue;
    const existingRoles = rolesByUser.get(userId) ?? [];
    if (!existingRoles.includes(roleKey)) {
      rolesByUser.set(userId, [...existingRoles, roleKey]);
    }
  }

  const now = Date.now();
  const userIds = new Set([
    ...authUsers.users.map((user) => user.id),
    ...profiles.rows.map((profile) => String(profile.id ?? "")).filter(Boolean)
  ]);
  const users = Array.from(userIds).map((userId) => {
    const user = authById.get(userId);
    const profile = profileById.get(userId);
    const bannedUntil = typeof user?.banned_until === "string" ? user.banned_until : null;
    const isDisabled = bannedUntil ? Date.parse(bannedUntil) > now : false;
    const email = String(user?.email ?? profile?.email ?? "");
    const displayName = String(profile?.display_name ?? user?.user_metadata?.display_name ?? email);
    const roles = rolesByUser.get(userId) ?? [];
    const defaultRole = normalizeCmsRole(profile?.default_role ?? user?.app_metadata?.role) ?? roles[0] ?? "user";

    return {
      id: userId,
      email,
      display_name: displayName,
      default_role: defaultRole,
      roles,
      status: authUsers.error && !user ? "auth_unavailable" : isDisabled ? "disabled" : user?.email_confirmed_at ? "active" : "pending",
      created_at: String(user?.created_at ?? profile?.created_at ?? ""),
      last_sign_in_at: typeof user?.last_sign_in_at === "string" ? user.last_sign_in_at : null,
      banned_until: bannedUntil
    };
  }).sort((first, second) => {
    if (first.status === "disabled" && second.status !== "disabled") return 1;
    if (first.status !== "disabled" && second.status === "disabled") return -1;
    return first.display_name.localeCompare(second.display_name);
  });

  return {
    status: authUsers.error || [profiles, userRoles, roles, invites, activity, governanceTimeline].some((table) => table.status !== "LIVE") ? "PARTIAL" as const : "LIVE" as const,
    source: "supabase-admin" as const,
    blockedReason: authUsers.error,
    data: {
      users,
      roles: roles.rows,
      invites: invites.rows,
      activity: [...activity.rows, ...governanceTimeline.rows]
        .filter((row, index, rows) => rows.findIndex((candidate) => String(candidate.id ?? "") === String(row.id ?? "")) === index)
        .sort((first, second) => Date.parse(String(second.created_at ?? "")) - Date.parse(String(first.created_at ?? "")))
        .slice(0, 60)
    }
  };
});

export const loadAdminSuppliersSnapshot = cache(async (env: EnvSource = process.env) => {
  const config = getSupabaseAdminConfig(env);
  const emptyData = { suppliers: [] as AdminSupplierItem[] };
  if (!config.configured) return blockedSnapshot(config.message, emptyData);

  const [authUsers, supplierRoles, profiles] = await Promise.all([
    listGovernanceAuthUsers(config),
    fetchAdminRows(config, "user_roles", supplierDirectoryQueries.supplierRoles),
    fetchAdminRows(config, "profiles", supplierDirectoryQueries.profiles)
  ]);

  const profileById = new Map(profiles.rows.map((profile) => [String(profile.id ?? ""), profile]));
  const authById = new Map(authUsers.users.map((user) => [user.id, user]));
  const roleCreatedAt = new Map(
    supplierRoles.rows.map((row) => [String(row.user_id ?? ""), String(row.created_at ?? "")])
  );
  const supplierIds = [...new Set(supplierRoles.rows.map((row) => String(row.user_id ?? "")).filter(Boolean))];

  const suppliers = supplierIds.map((supplierId) => {
    const profile = profileById.get(supplierId);
    const authUser = authById.get(supplierId);
    const metadata = authUser?.user_metadata ?? {};
    const email = String(authUser?.email ?? profile?.email ?? "");
    const name = String(profile?.display_name ?? metadata.display_name ?? email);
    const company = deriveCompanyLabel(email, metadata);
    const phone = String(profile?.phone ?? metadata.phone ?? "");
    const governanceStatus = String(profile?.governance_status ?? "active");
    const emailVerified = Boolean(authUser?.email_confirmed_at);
    const verificationStatus = governanceStatus !== "active"
      ? governanceStatus
      : emailVerified
        ? "verified"
        : "pending";
    const registeredAt = roleCreatedAt.get(supplierId)
      || String(profile?.created_at ?? authUser?.created_at ?? "");

    return {
      id: supplierId,
      name,
      company,
      email,
      phone,
      verificationStatus,
      registeredAt
    };
  }).sort((first, second) => second.registeredAt.localeCompare(first.registeredAt));

  return {
    status: authUsers.error || [supplierRoles, profiles].some((table) => table.status !== "LIVE") ? "PARTIAL" as const : "LIVE" as const,
    source: "supabase-admin" as const,
    blockedReason: authUsers.error,
    data: { suppliers }
  };
});

export async function getAdminSuppliersSnapshot(env: EnvSource = process.env) {
  const { readThroughCache, REDIS_CACHE_KEYS } = await import("@/lib/cache-redis");
  const { cacheControlPlaneRead } = await import("@/lib/control-plane/query-cache");
  return readThroughCache(
    REDIS_CACHE_KEYS.controlPlaneSuppliersSnapshot,
    30,
    () =>
      cacheControlPlaneRead(
        ["admin-suppliers-snapshot"],
        () => loadAdminSuppliersSnapshot(env),
        { revalidate: 30, tags: ["admin-suppliers", "control-plane-suppliers"] }
      )
  );
}

export const loadCmsCoreSnapshot = cache(async (env: EnvSource = process.env) => {
  const config = getSupabaseAdminConfig(env);
  const emptyData = { tables: [] as Array<{ table: string; status: string; rows: AdminRow[] }> };
  if (!config.configured) return blockedSnapshot(config.message, emptyData);

  const tables = await Promise.all([
    fetchAdminRows(config, "cms_pages", cmsWorkspaceQueries.cmsPages),
    fetchAdminRows(config, "cms_sections", cmsWorkspaceQueries.cmsSections),
    fetchAdminRows(config, "hero_banners", cmsWorkspaceQueries.heroBanners),
    fetchAdminRows(config, "product_reviews", cmsWorkspaceQueries.productReviews),
    fetchAdminRows(config, "media_assets", cmsWorkspaceQueries.mediaAssets)
  ]);

  return {
    status: tables.every((table) => table.status === "LIVE") ? "LIVE" as const : "PARTIAL" as const,
    source: "supabase-admin" as const,
    blockedReason: undefined,
    data: { tables }
  };
});

export async function getCmsCoreSnapshot(env: EnvSource = process.env) {
  const { readThroughCache, REDIS_CACHE_KEYS } = await import("@/lib/cache-redis");
  const { cacheControlPlaneRead } = await import("@/lib/control-plane/query-cache");
  return readThroughCache(
    REDIS_CACHE_KEYS.controlPlaneCmsCoreSnapshot,
    30,
    () =>
      cacheControlPlaneRead(
        ["admin-cms-core-snapshot"],
        () => loadCmsCoreSnapshot(env),
        { revalidate: 30, tags: ["admin-cms", "control-plane-cms"] }
      )
  );
}

export const loadCmsMarketingWorkspaceSnapshot = cache(async (env: EnvSource = process.env) => {
  const config = getSupabaseAdminConfig(env);
  const emptyData = { tables: [] as Array<{ table: string; status: string; rows: AdminRow[] }> };
  if (!config.configured) return blockedSnapshot(config.message, emptyData);

  const tables = await Promise.all([
    fetchAdminRows(config, "faqs", cmsWorkspaceQueries.faqs),
    fetchAdminRows(config, "promotional_campaigns", cmsWorkspaceQueries.promotionalCampaigns)
  ]);

  return {
    status: tables.every((table) => table.status === "LIVE") ? "LIVE" as const : "PARTIAL" as const,
    source: "supabase-admin" as const,
    blockedReason: tables.find((table) => table.status !== "LIVE")?.error,
    data: { tables }
  };
});

export async function getCmsMarketingWorkspaceSnapshot(env: EnvSource = process.env) {
  const { readThroughCache, REDIS_CACHE_KEYS } = await import("@/lib/cache-redis");
  const { cacheControlPlaneRead } = await import("@/lib/control-plane/query-cache");
  return readThroughCache(
    REDIS_CACHE_KEYS.controlPlaneCmsMarketingSnapshot,
    30,
    () =>
      cacheControlPlaneRead(
        ["admin-cms-marketing-snapshot"],
        () => loadCmsMarketingWorkspaceSnapshot(env),
        { revalidate: 30, tags: ["admin-cms", "control-plane-cms"] }
      )
  );
}

export const loadCmsAdvancedWorkspaceSnapshot = cache(async (env: EnvSource = process.env) => {
  const config = getSupabaseAdminConfig(env);
  const emptyData = { tables: [] as Array<{ table: string; status: string; rows: AdminRow[] }> };
  if (!config.configured) return blockedSnapshot(config.message, emptyData);

  const tables = await Promise.all([
    fetchAdminRows(config, "section_visibility", cmsWorkspaceQueries.sectionVisibility),
    fetchAdminRows(config, "homepage_ordering", cmsWorkspaceQueries.homepageOrdering),
    fetchAdminRows(config, "site_navigation", cmsWorkspaceQueries.siteNavigation),
    fetchAdminRows(config, "footer_columns", cmsWorkspaceQueries.footerColumns),
    fetchAdminRows(config, "footer_links", cmsWorkspaceQueries.footerLinks),
    fetchAdminRows(config, "category_metadata", cmsWorkspaceQueries.categoryMetadata),
    fetchAdminRows(config, "content_revisions", cmsWorkspaceQueries.contentRevisions)
  ]);

  return {
    status: tables.every((table) => table.status === "LIVE") ? "LIVE" as const : "PARTIAL" as const,
    source: "supabase-admin" as const,
    blockedReason: undefined,
    data: { tables }
  };
});

export async function getCmsAdvancedWorkspaceSnapshot(env: EnvSource = process.env) {
  const { readThroughCache, REDIS_CACHE_KEYS } = await import("@/lib/cache-redis");
  const { cacheControlPlaneRead } = await import("@/lib/control-plane/query-cache");
  return readThroughCache(
    REDIS_CACHE_KEYS.controlPlaneCmsAdvancedSnapshot,
    30,
    () =>
      cacheControlPlaneRead(
        ["admin-cms-advanced-snapshot"],
        () => loadCmsAdvancedWorkspaceSnapshot(env),
        { revalidate: 30, tags: ["admin-cms", "control-plane-cms"] }
      )
  );
}

function mergeCmsWorkspaceSnapshots(
  core: Awaited<ReturnType<typeof getCmsCoreSnapshot>>,
  advanced: Awaited<ReturnType<typeof getCmsAdvancedWorkspaceSnapshot>>
) {
  if (core.status === "BLOCKED" || advanced.status === "BLOCKED") {
    return {
      status: "BLOCKED" as const,
      source: "blocked" as const,
      blockedReason: core.blockedReason ?? advanced.blockedReason,
      data: {
        tables: [...core.data.tables, ...advanced.data.tables]
      }
    };
  }

  return {
    status: core.status === "LIVE" && advanced.status === "LIVE" ? "LIVE" as const : "PARTIAL" as const,
    source: "supabase-admin" as const,
    blockedReason: core.blockedReason ?? advanced.blockedReason,
    data: {
      tables: [...core.data.tables, ...advanced.data.tables]
    }
  };
}

export async function getCmsWorkspaceSnapshot(env: EnvSource = process.env) {
  const [core, advanced] = await Promise.all([
    getCmsCoreSnapshot(env),
    getCmsAdvancedWorkspaceSnapshot(env)
  ]);
  return mergeCmsWorkspaceSnapshots(core, advanced);
}

export const getMediaLibrarySnapshot = cache(async (env: EnvSource = process.env) => {
  const config = getSupabaseAdminConfig(env);
  const emptyData = {
    assets: [] as AdminRow[],
    sourceRows: [] as AdminRow[],
    productLinks: [] as AdminRow[],
    buckets: [] as AdminRow[],
    mediaCounts: [] as CountMetric[],
    publishedProductsWithoutPrimaryLink: 0,
    publishedProductCount: 0,
    primaryLinkCoverage: 0
  };
  if (!config.configured) return blockedSnapshot(config.message, emptyData);

  const [mediaCounts, assets, productLinks, buckets, primaryLinkCoverage] = await Promise.all([
    Promise.all([
      countTable(config, "media_assets"),
      countTable(config, "mithron_assets"),
      countTable(config, "product_media_assets")
    ]),
    fetchAdminRows(config, "media_assets", `select=id,bucket,folder,storage_path,public_url,mime_type,file_size_bytes,size_bytes,width,height,visibility,status,caption,alt,alt_text,tags,variants,responsive_variants,updated_at&order=updated_at.desc&limit=${MEDIA_LIBRARY_LIMIT}`),
    fetchAdminRows(config, "product_media_assets", `select=product_slug,media_asset_id,usage,variant_id,is_primary,sort_order,alt_text,caption,metadata,updated_at&order=updated_at.desc&limit=${PRODUCT_RELATION_LIMIT}`),
    fetchStorageBuckets(config),
    countPublishedProductsWithoutPrimaryLink()
  ]);

  const publishedProductCount = primaryLinkCoverage.publishedCount;
  const publishedProductsWithoutPrimaryLink = primaryLinkCoverage.missingCount;
  const primaryLinkCoverageRatio = publishedProductCount > 0
    ? Math.round((primaryLinkCoverage.linkedCount / publishedProductCount) * 100)
    : 0;

  return {
    status: mediaCounts.every((metric) => metric.status === "LIVE") && [assets, productLinks, buckets].every((table) => table.status === "LIVE") ? "LIVE" as const : "PARTIAL" as const,
    source: "supabase-admin" as const,
    blockedReason: undefined,
    data: {
      assets: assets.rows,
      sourceRows: [] as AdminRow[],
      productLinks: productLinks.rows,
      buckets: buckets.rows,
      mediaCounts,
      publishedProductsWithoutPrimaryLink,
      publishedProductCount,
      primaryLinkCoverage: primaryLinkCoverageRatio
    }
  };
});

export async function getAdminSettingsSnapshot(env: EnvSource = process.env) {
  const config = getSupabaseAdminConfig(env);
  const emptyData = {
    settings: {} as AdminRow,
    storage: {
      usageBytes: 0,
      mediaCount: 0,
      optimizedImagesCount: 0,
      cdnCacheStatus: "No media"
    },
    mediaCounts: [] as CountMetric[]
  };
  if (!config.configured) return blockedSnapshot(config.message, emptyData);

  const [settings, mediaCounts, mediaUsage] = await Promise.all([
    fetchAdminRows(config, "admin_settings", adminSettingsQueries.settings),
    Promise.all([
      countTable(config, "media_assets"),
      countTable(config, "product_media_assets")
    ]),
    fetchAdminRows(config, "media_assets", adminSettingsQueries.mediaUsage)
  ]);
  const usageBytes = mediaUsage.rows.reduce((total, row) => total + Number(row.file_size_bytes ?? row.size_bytes ?? 0), 0);
  const optimizedImagesCount = mediaUsage.rows.filter((row) => {
    const mimeType = String(row.mime_type ?? "");
    return mimeType.includes("avif") || mimeType.includes("webp") || Boolean(row.variants) || Boolean(row.responsive_variants);
  }).length;
  const settingsPayload = settings.rows[0]?.payload;

  return {
    status: settings.status === "LIVE" && mediaUsage.status === "LIVE" && mediaCounts.every((metric) => metric.status === "LIVE") ? "LIVE" as const : "PARTIAL" as const,
    source: "supabase-admin" as const,
    blockedReason: settings.status !== "LIVE" ? settings.error : mediaUsage.status !== "LIVE" ? mediaUsage.error : undefined,
    data: {
      settings: settingsPayload && typeof settingsPayload === "object" && !Array.isArray(settingsPayload) ? settingsPayload as AdminRow : {},
      storage: {
        usageBytes: Number.isFinite(usageBytes) ? usageBytes : 0,
        mediaCount: mediaCounts.find((metric) => metric.table === "media_assets")?.count ?? mediaUsage.rows.length,
        optimizedImagesCount,
        cdnCacheStatus: mediaUsage.rows.length ? "Ready" : "No media"
      },
      mediaCounts
    }
  };
}

export const loadProductManagerSnapshot = cache(async (env: EnvSource = process.env) => {
  const config = getSupabaseAdminConfig(env);
  const emptyData = {
    products: [] as AdminRow[],
    mediaLinks: [] as AdminRow[],
    inventory: [] as AdminRow[],
    stock: [] as AdminRow[],
    movements: [] as AdminRow[],
    categories: [] as AdminRow[],
    productCounts: [] as CountMetric[],
    mediaCounts: [] as CountMetric[],
    stockCoverage: { productCount: 0, inventoryLinked: 0, stockLinked: 0, missingStock: 0 },
    catalogMetrics: { activeProducts: 0, archivedProducts: 0, totalProducts: 0 }
  };
  if (!config.configured) return blockedSnapshot(config.message, emptyData);

  const activeProductQuery =
    "select=slug&workflow_status=neq.archived&archived_at=is.null&merge_status=neq.archived_merged";
  const archivedProductQuery = "select=slug&or=(workflow_status.eq.archived,archived_at.not.is.null)";

  const [productCounts, mediaCounts, products, mediaLinks, inventory, stock, movements, categories, activeProducts, archivedProducts, totalProducts] = await Promise.all([
    Promise.all([
      countTable(config, "mithron_products"),
      countTable(config, "inventory"),
      countTable(config, "warehouse_stock")
    ]),
    Promise.all([
      countTable(config, "media_assets"),
      countTable(config, "product_media_assets")
    ]),
    fetchAdminRows(config, "mithron_products", `select=${PRODUCT_LIST_SELECT}&order=sort_order.asc&limit=${PRODUCT_MANAGER_LIMIT}`),
    fetchAdminRows(config, "product_media_assets", `select=product_slug,media_asset_id,usage,variant_id,is_primary,sort_order,alt_text,caption,metadata,updated_at&order=updated_at.desc&limit=${PRODUCT_RELATION_LIMIT}`),
    fetchAdminRows(config, "inventory", `select=product_slug,sku,stock_status,quantity,reserved_quantity,reorder_threshold,updated_at&order=updated_at.desc&limit=${PRODUCT_RELATION_LIMIT}`),
    fetchAdminRows(config, "warehouse_stock", `select=warehouse_code,product_slug,sku,available_quantity,committed_quantity,last_counted_at,updated_at&order=updated_at.desc&limit=${PRODUCT_RELATION_LIMIT}`),
    fetchAdminRows(config, "inventory_movements", `select=id,movement_type,product_slug,sku,quantity_before,quantity_after,quantity_delta,reason_code,actor_user_id,related_order_id,related_shipment_id,created_at&order=created_at.desc&limit=${MOVEMENT_AUDIT_LIMIT}`),
    fetchAdminRows(config, "category_metadata", "select=route_key,title,status,is_visible,sort_order&order=sort_order.asc&limit=80"),
    countTableRows(config, "mithron_products", activeProductQuery),
    countTableRows(config, "mithron_products", archivedProductQuery),
    countTableRows(config, "mithron_products", "select=slug")
  ]);
  const inventorySlugs = new Set(inventory.rows.map((row) => String(row.product_slug ?? "")).filter(Boolean));
  const stockSlugs = new Set(stock.rows.map((row) => String(row.product_slug ?? "")).filter(Boolean));
  const stockCoverage = {
    productCount: products.rows.length,
    inventoryLinked: products.rows.filter((product) => inventorySlugs.has(String(product.slug ?? ""))).length,
    stockLinked: products.rows.filter((product) => stockSlugs.has(String(product.slug ?? ""))).length,
    missingStock: products.rows.filter((product) => !stockSlugs.has(String(product.slug ?? ""))).length
  };

  return {
    status: [...productCounts, ...mediaCounts].every((metric) => metric.status === "LIVE") && [products, mediaLinks, inventory, stock, movements, categories].every((table) => table.status === "LIVE") ? "LIVE" as const : "PARTIAL" as const,
    source: "supabase-admin" as const,
    blockedReason: undefined,
    data: {
      products: products.rows,
      mediaLinks: mediaLinks.rows,
      inventory: inventory.rows,
      stock: stock.rows,
      movements: movements.rows,
      categories: categories.rows,
      productCounts,
      mediaCounts,
      stockCoverage,
      catalogMetrics: {
        activeProducts: activeProducts.count,
        archivedProducts: archivedProducts.count,
        totalProducts: totalProducts.count
      }
    }
  };
});

export async function getProductManagerSnapshot(env: EnvSource = process.env) {
  const { readThroughCache, REDIS_CACHE_KEYS } = await import("@/lib/cache-redis");
  const { cacheControlPlaneRead } = await import("@/lib/control-plane/query-cache");
  return readThroughCache(
    REDIS_CACHE_KEYS.controlPlaneProductManagerSnapshot,
    30,
    () =>
      cacheControlPlaneRead(
        ["admin-product-manager-snapshot"],
        () => loadProductManagerSnapshot(env),
        {
          revalidate: 30,
          tags: ["admin-products", "control-plane-catalog", "control-plane-inventory"]
        }
      )
  );
}

export async function fetchProductEditorDetail(productSlug: string, env: EnvSource = process.env) {
  const config = getSupabaseAdminConfig(env);
  if (!config.configured || !productSlug.trim()) return null;
  const rows = await fetchAdminRows(
    config,
    "mithron_products",
    `select=${PRODUCT_EDITOR_SELECT}&slug=eq.${encodeURIComponent(productSlug)}&limit=1`
  );
  return rows.rows[0] ?? null;
}

const WAREHOUSE_SNAPSHOT_ROW_LIMIT = 80;

function withOperationalHotWindow(query: string) {
  const cutoff = encodeURIComponent(operationalArchiveHotCutoffIso());
  return `${query}&created_at=gte.${cutoff}`;
}

function warehouseSnapshotLimitWarning(tables: Array<{ table: string; rows: AdminRow[] }>) {
  const truncated = tables
    .filter((table) => table.rows.length >= WAREHOUSE_SNAPSHOT_ROW_LIMIT)
    .map((table) => table.table);
  if (!truncated.length) return undefined;
  return `Snapshot capped at ${WAREHOUSE_SNAPSHOT_ROW_LIMIT} rows for: ${truncated.join(", ")}. Older records may be hidden — use filtered views or reports for full history.`;
}

const loadWarehouseSnapshot = cache(async (
  scope: WarehouseSnapshotScope,
  ordersFilter: "all" | "warehouse",
  env: EnvSource
) => {
  const tables = warehouseSnapshotScopes[scope];
  const resolvedEnv = env;
  const config = getSupabaseAdminConfig(resolvedEnv);

  const emptyData = {
    products: [] as AdminRow[],
    inventory: [] as AdminRow[],
    stock: [] as AdminRow[],
    movements: [] as AdminRow[],
    orders: [] as AdminRow[],
    orderItems: [] as AdminRow[],
    shipments: [] as AdminRow[],
    shipmentItems: [] as AdminRow[],
    shipmentTimeline: [] as AdminRow[],
    activityLogs: [] as AdminRow[]
  };
  if (!config.configured) return blockedSnapshot(config.message, emptyData);

  const skipped = <T extends AdminRow>(table: string) => ({
    table,
    status: "SKIPPED" as const,
    rows: [] as T[]
  });
  const maybeFetch = <T extends AdminRow>(key: WarehouseSnapshotTable, table: string, query: string) => (
    tables.has(key)
      ? fetchAdminRows<T>(config, table, query)
      : Promise.resolve(skipped<T>(table))
  );

  const scopeOrderRelations = scope === "orders";
  const inventoryRowLimit = scopeOrderRelations ? WAREHOUSE_SNAPSHOT_ROW_LIMIT : 500;
  const inventorySelectColumns =
    "product_slug,sku,variant_id,stock_status,quantity,reserved_quantity,reorder_threshold,updated_at";
  const inventoryCatalogQuery =
    `select=${inventorySelectColumns}&order=updated_at.desc&limit=${inventoryRowLimit}`;
  const warehouseStockQuery =
    "select=id,warehouse_code,product_slug,sku,variant_id,available_quantity,committed_quantity,last_counted_at,updated_at&order=updated_at.desc&limit=120";
  const orderItemsSelect =
    "select=id,order_id,product_slug,product_name,sku,quantity,line_total,metadata,created_at";
  const shipmentsSelect =
    "select=id,shipment_number,shipment_status,order_id,warehouse_id,carrier_name,tracking_number,updated_at,created_at";
  const [products, inventory, stock, movements, orders, shipmentItems, shipmentTimeline, activityLogs] = await Promise.all([
    maybeFetch("products", "mithron_products", `select=slug,name,category,price,image,hero,workflow_status,archived_at,is_visible,updated_at&order=sort_order.asc&limit=${WAREHOUSE_SNAPSHOT_ROW_LIMIT}`),
    maybeFetch("inventory", "inventory", inventoryCatalogQuery),
    maybeFetch("stock", "warehouse_stock", warehouseStockQuery),
    maybeFetch("movements", "inventory_movements", `select=id,movement_type,product_slug,sku,quantity_before,quantity_after,quantity_delta,reason_code,actor_user_id,related_order_id,related_shipment_id,created_at&order=created_at.desc&limit=${WAREHOUSE_SNAPSHOT_ROW_LIMIT}`),
    maybeFetch("orders", "orders", `select=id,order_number,customer_email,status,payment_status,fulfillment_status,channel,total,currency,metadata,timeline,shipment_tracking,invoice_url,archived_at,deleted_at,created_at,updated_at&created_at=gte.${encodeURIComponent(operationalArchiveHotCutoffIso())}&order=created_at.desc&limit=${WAREHOUSE_SNAPSHOT_ROW_LIMIT}`),
    maybeFetch("shipmentItems", "shipment_items", `select=id,shipment_id,order_item_id,product_id,variant_id,quantity,created_at&order=created_at.desc&limit=120`),
    maybeFetch("shipmentTimeline", "shipment_timeline", `select=id,shipment_id,event_type,previous_status,next_status,actor_user_id,created_at&order=created_at.desc&limit=${WAREHOUSE_SNAPSHOT_ROW_LIMIT}`),
    maybeFetch("activityLogs", "activity_logs", `select=id,actor_id,action,entity_table,entity_id,severity,metadata,created_at&entity_table=in.(orders,shipments,inventory,warehouse_stock,inventory_movements)&order=created_at.desc&limit=${WAREHOUSE_SNAPSHOT_ROW_LIMIT}`)
  ]);

  type SnapshotFetchResult<T extends AdminRow> =
    | Awaited<ReturnType<typeof fetchAdminRows<T>>>
    | ReturnType<typeof skipped<T>>;

  let orderItems: SnapshotFetchResult<AdminRow> = skipped<AdminRow>("order_items");
  let shipments: SnapshotFetchResult<AdminRow> = skipped<AdminRow>("shipments");
  if (scopeOrderRelations) {
    const orderIds = orders.rows
      .map((order) => String(order.id ?? "").trim())
      .filter(Boolean);
    if (orderIds.length) {
      const orderIdFilter = orderIds.map((id) => encodeURIComponent(id)).join(",");
      const [scopedOrderItems, scopedShipments] = await Promise.all([
        tables.has("orderItems")
          ? fetchAdminRows<AdminRow>(config, "order_items", `${orderItemsSelect}&order_id=in.(${orderIdFilter})&order=created_at.desc`)
          : Promise.resolve(skipped<AdminRow>("order_items")),
        tables.has("shipments")
          ? fetchAdminRows<AdminRow>(config, "shipments", `${shipmentsSelect}&order_id=in.(${orderIdFilter})&order=updated_at.desc`)
          : Promise.resolve(skipped<AdminRow>("shipments"))
      ]);
      orderItems = scopedOrderItems;
      shipments = scopedShipments;
    }
  } else {
    [orderItems, shipments] = await Promise.all([
      maybeFetch("orderItems", "order_items", `${orderItemsSelect}&order=created_at.desc&limit=120`),
      maybeFetch("shipments", "shipments", `${shipmentsSelect}&order=updated_at.desc&limit=${WAREHOUSE_SNAPSHOT_ROW_LIMIT}`)
    ]);
  }

  // Orders snapshot caps inventory at 80 newest rows — enrich with rows for products on loaded order lines.
  let inventoryRows = inventory.rows;
  if (scopeOrderRelations && tables.has("inventory") && orderItems.rows.length) {
    const orderSlugs = collectOrderItemProductSlugs(orderItems.rows);
    if (orderSlugs.length) {
      const enrichmentBatches = await Promise.all(
        chunkValues(orderSlugs, 40).map((chunk) => {
          const slugFilter = chunk.map((slug) => encodeURIComponent(slug)).join(",");
          return fetchAdminRows<AdminRow>(
            config,
            "inventory",
            `select=${inventorySelectColumns}&product_slug=in.(${slugFilter})`
          );
        })
      );
      const enrichmentRows = enrichmentBatches.flatMap((batch) =>
        batch.status === "LIVE" ? batch.rows : []
      );
      inventoryRows = mergeInventoryRowsByProductSlug(inventory.rows, enrichmentRows);
    }
  }

  const fetchedTables = [products, inventory, stock, movements, orders, orderItems, shipments, shipmentItems, shipmentTimeline, activityLogs]
    .filter((table) => table.status !== "SKIPPED");
  const blockedTable = fetchedTables.find((table) => table.status !== "LIVE");
  const filteredOrders = ordersFilter === "warehouse"
    ? orders.rows.filter((order) => isWarehouseEligible(order))
    : orders.rows;
  const snapshotTables = [
    { table: "mithron_products", rows: products.rows },
    { table: "inventory", rows: inventoryRows },
    { table: "warehouse_stock", rows: stock.rows },
    { table: "inventory_movements", rows: movements.rows },
    { table: "orders", rows: filteredOrders },
    { table: "order_items", rows: orderItems.rows },
    { table: "shipments", rows: shipments.rows },
    { table: "shipment_items", rows: shipmentItems.rows },
    { table: "shipment_timeline", rows: shipmentTimeline.rows },
    { table: "activity_logs", rows: activityLogs.rows }
  ];

  return {
    status: fetchedTables.every((table) => table.status === "LIVE") ? "LIVE" as const : "PARTIAL" as const,
    source: "supabase-admin" as const,
    blockedReason: blockedTable?.error,
    snapshotLimitWarning: warehouseSnapshotLimitWarning(snapshotTables),
    data: {
      products: products.rows,
      inventory: inventoryRows,
      stock: stock.rows,
      movements: movements.rows,
      orders: filteredOrders,
      orderItems: orderItems.rows,
      shipments: shipments.rows,
      shipmentItems: shipmentItems.rows,
      shipmentTimeline: shipmentTimeline.rows,
      activityLogs: activityLogs.rows
    }
  };
});

export async function getWarehouseSnapshot(input: WarehouseSnapshotInput = process.env) {
  const { env, scope, ordersFilter } = resolveWarehouseSnapshotInput(input);
  const { readThroughCache, REDIS_CACHE_KEYS } = await import("@/lib/cache-redis");
  const { cacheControlPlaneRead } = await import("@/lib/control-plane/query-cache");
  return readThroughCache(
    REDIS_CACHE_KEYS.controlPlaneWarehouseSnapshot(scope, ordersFilter),
    30,
    () =>
      cacheControlPlaneRead(
        ["admin-warehouse-snapshot", scope, ordersFilter],
        () => loadWarehouseSnapshot(scope, ordersFilter, env),
        {
          revalidate: 30,
          tags: [
            "admin-warehouse-snapshot",
            "control-plane-orders",
            "control-plane-inventory",
            "control-plane-catalog",
            "control-plane-warehouse"
          ]
        }
      )
  );
}

export const getOperationsSnapshot = cache(async (env: EnvSource = process.env) => {
  const config = getSupabaseAdminConfig(env);
  const emptyData = {
    routes: [] as AdminRow[],
    requests: [] as AdminRow[],
    tasks: [] as AdminRow[],
    notifications: [] as AdminRow[],
    activity: [] as AdminRow[],
    orders: [] as AdminRow[],
    shipments: [] as AdminRow[]
  };
  if (!config.configured) return blockedSnapshot(config.message, emptyData);

  const [routes, requests, tasks, notifications, activity, orders, shipments] = await Promise.all([
    fetchAdminRows(config, "operation_routes", operationsQueries.operationRoutes),
    fetchAdminRows(config, "deployment_requests", operationsQueries.deploymentRequests),
    fetchAdminRows(config, "staff_tasks", operationsQueries.staffTasks),
    fetchAdminRows(config, "notifications", operationsQueries.notifications),
    fetchAdminRows(config, "activity_logs", operationsQueries.activityLogs),
    fetchAdminRows(config, "orders", operationsQueries.orders),
    fetchAdminRows(config, "shipments", operationsQueries.shipments)
  ]);

  return {
    status: [routes, requests, tasks, notifications, activity, orders, shipments].every((table) => table.status === "LIVE") ? "LIVE" as const : "PARTIAL" as const,
    source: "supabase-admin" as const,
    blockedReason: undefined,
    data: {
      routes: routes.rows,
      requests: requests.rows,
      tasks: tasks.rows,
      notifications: notifications.rows,
      activity: activity.rows,
      orders: orders.rows,
      shipments: shipments.rows
    }
  };
});

export async function listPendingSupplierSubmissions(env: EnvSource = process.env): Promise<PendingSupplierSubmission[]> {
  const config = getSupabaseAdminConfig(env);
  if (!config.configured) return [];

  const response = await fetch(
    `${config.url}/rest/v1/mithron_products?select=slug,name,supplier_id,updated_at&workflow_status=eq.pending_review&order=updated_at.desc&limit=8`,
    {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`
      },
      cache: "no-store"
    }
  );
  if (!response.ok) return [];

  const products = (await response.json()) as AdminRow[];
  const supplierIds = [...new Set(products.map((product) => String(product.supplier_id ?? "")).filter(Boolean))];
  const profileById = new Map<string, string>();

  if (supplierIds.length) {
    const profilesResponse = await fetch(
      `${config.url}/rest/v1/profiles?select=id,email,display_name&id=in.(${supplierIds.map(encodeURIComponent).join(",")})`,
      {
        headers: {
          apikey: config.serviceRoleKey,
          Authorization: `Bearer ${config.serviceRoleKey}`
        },
        cache: "no-store"
      }
    );
    if (profilesResponse.ok) {
      const profiles = (await profilesResponse.json()) as AdminRow[];
      for (const profile of profiles) {
        const id = String(profile.id ?? "");
        if (!id) continue;
        profileById.set(id, String(profile.display_name ?? profile.email ?? id));
      }
    }
  }

  return products.map((product) => {
    const supplierId = String(product.supplier_id ?? "");
    return {
      slug: String(product.slug ?? ""),
      name: String(product.name ?? product.slug ?? "Product"),
      supplierLabel: supplierId ? profileById.get(supplierId) ?? "Supplier" : "Supplier",
      updatedAt: String(product.updated_at ?? "")
    };
  });
}
