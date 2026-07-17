"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { invalidateAuthRoleRedisCaches } from "@/lib/cache-invalidation";
import { revalidateAfterMutation } from "@/lib/control-plane/revalidate-realtime";
import { isNextRedirect } from "@/lib/server-action-feedback";
import { insertUserNotification, notificationChannelForRole } from "@/lib/notifications/create-notification";
import { redirect } from "next/navigation";
import { getSiteOrigin } from "@/lib/site-url";
import { createClient as createSupabaseServiceClient } from "@supabase/supabase-js";
import { assertSupabaseAdminConfig } from "@/lib/env";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { type CmsRole, normalizeCmsRole } from "@/lib/auth/permissions";
import { requirePermission } from "@/services/auth";
import { ensureAllCanonicalRoles, provisionAuthenticatedUser } from "@/services/auth-provisioning";
import { assignWarehouseOperator } from "@/services/warehouses";
import {
  createActivityLogRecord,
  createAdminRecord,
  createNotificationRecord,
  deleteAdminRecord,
  deleteUserRoleRecord,
  updateAdminRecord,
  upsertProfileRecord,
  upsertUserRoleRecord
} from "@/services/admin-actions";
import { recordAuthActivityEvent } from "@/services/security-observability";
import {
  assertAdminEmailDomainAllowed,
  assertPasswordResetPolicyAllowed,
  getAdminSettingsPolicy
} from "@/services/admin-settings-policy";
import type { CreateUserFormState } from "@/components/admin/create-user-form";

const manageableUserRoles = [
  "admin",
  "warehouse",
  "supplier",
  "user"
] as const satisfies readonly CmsRole[];

const settingsReadColumns = {
  pendingInvite: "select=id,email,role_key,status,metadata,expires_at,created_at,updated_at",
  inviteNotification: "select=id,payload",
  inviteById: "select=id,email,role_key,status,metadata,expires_at,accepted_at,created_at,updated_at"
};

type JsonRecord = Record<string, unknown>;
type SettingsActorContext = {
  actorId: string;
  actorRole: string | null;
};

const canonicalRoleRows: Record<CmsRole, { label: string; description: string; sort_order: number }> = {
  admin: {
    label: "Admin",
    description: "Full admin, CMS, product, media, order, warehouse, settings, and audit access.",
    sort_order: 1
  },
  warehouse: {
    label: "Warehouse",
    description: "Inventory, shipment, stock, and order-fulfillment access.",
    sort_order: 2
  },
  supplier: {
    label: "Supplier",
    description: "Submit and manage own products pending admin approval.",
    sort_order: 3
  },
  user: {
    label: "User",
    description: "Storefront customer access with orders, enquiries, and profile.",
    sort_order: 4
  }
};

function readRequiredString(formData: FormData, key: string, label: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} ${key} is required.`);
  }
  return value.trim();
}

function readOptionalString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readSettingString(formData: FormData, key: string, fallback = "") {
  return readOptionalString(formData, key) ?? fallback;
}

function readSettingBoolean(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function settingsRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function existingString(section: JsonRecord, key: string, fallback = "") {
  const value = section[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

function existingBoolean(section: JsonRecord, key: string, fallback = false) {
  const value = section[key];
  return typeof value === "boolean" ? value : fallback;
}

function mergeSettingString(formData: FormData, key: string, existing: string, fallback = "") {
  return formData.has(key) ? readSettingString(formData, key, fallback) : existing;
}

function mergeSettingBoolean(formData: FormData, key: string, existing: boolean) {
  return formData.has(key) ? readSettingBoolean(formData, key) : existing;
}

function assertEmail(value: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new Error("User email must be a valid email address.");
  }
  return value.toLowerCase();
}

function generatedTemporaryPassword() {
  return `Mithron-${randomUUID()}-Aa1!`;
}

function assertTemporaryPassword(value: string | null | undefined, label = "Temporary password") {
  const password = value?.trim();
  if (!password || password.length < 8) {
    throw new Error(`${label} must be at least 8 characters.`);
  }
  return password;
}

export type ManagedUserCreateResult = {
  userId: string;
  email: string;
  role: CmsRole;
  temporaryPassword: string;
  passwordGenerated: boolean;
};

async function verifyManagedUserCredentials(email: string, password: string) {
  const config = assertSupabaseAdminConfig(process.env);
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!publishableKey) {
    throw new Error("Missing Supabase publishable key for login verification.");
  }

  const verifier = createSupabaseServiceClient(config.url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { error } = await verifier.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`User account was created but login verification failed: ${error.message}`);
  }
}

function assertManageableUserRole(value: string | null | undefined) {
  const role = normalizeCmsRole(value);
  if (!role || !(manageableUserRoles as readonly string[]).includes(role)) {
    throw new Error(`Role ${value ?? "empty"} cannot be assigned through user management.`);
  }
  return role;
}

async function settingsActor(): Promise<SettingsActorContext> {
  const context = await requirePermission("settings.write");
  if (!context.userId) {
    throw new Error("User management requires an authenticated admin actor.");
  }
  return {
    actorId: context.userId,
    actorRole: context.role
  };
}

function serviceClient() {
  const config = assertSupabaseAdminConfig(process.env);
  return createSupabaseServiceClient(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

async function invokeMaintenanceEndpoint(path: string) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    throw new Error("CRON_SECRET is not configured for maintenance tasks.");
  }

  const response = await fetchWithTimeout(
    `${getSiteOrigin()}${path}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`
      },
      cache: "no-store"
    },
    60_000
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Maintenance task failed (${response.status})${text ? `: ${text.slice(0, 200)}` : ""}`);
  }

  return response.json().catch(() => null);
}

export async function saveAdminSettingsFormAction(formData: FormData) {
  try {
    const maintenanceAction = readSettingString(formData, "maintenance_action");
    if (maintenanceAction) {
      const { actorId } = await settingsActor();

      if (maintenanceAction === "prune_logs") {
        await invokeMaintenanceEndpoint("/api/admin/prune-logs");
      } else if (maintenanceAction === "archive_movements") {
        await invokeMaintenanceEndpoint("/api/admin/archive-movements");
      } else if (maintenanceAction === "archive_operational_data") {
        await invokeMaintenanceEndpoint("/api/admin/archive-operational-data");
      } else {
        await createActivityLogRecord(
          {
            actor_id: actorId,
            action: `settings.maintenance.${maintenanceAction}`,
            entity_table: "admin_settings",
            entity_id: "global",
            severity: "info",
            metadata: { maintenance_action: maintenanceAction }
          },
          actorId
        );
      }

      if (maintenanceAction === "prune_logs" || maintenanceAction === "archive_movements" || maintenanceAction === "archive_operational_data") {
        await createActivityLogRecord(
          {
            actor_id: actorId,
            action: `settings.maintenance.${maintenanceAction}`,
            entity_table: "admin_settings",
            entity_id: "global",
            severity: "info",
            metadata: { maintenance_action: maintenanceAction, status: "completed" }
          },
          actorId
        );
      }

      revalidatePath("/admin/settings");
      redirect(`/admin/settings?settings_status=success&settings_message=${encodeURIComponent(`Maintenance action "${maintenanceAction.replaceAll("_", " ")}" completed.`)}`);
    }

    const { actorId, actorRole } = await settingsActor();
  const supabase = serviceClient();
  const { data: existingRow } = await supabase.from("admin_settings").select("payload").eq("id", "global").maybeSingle();
  const existingPayload = settingsRecord(existingRow?.payload);
  const existingGeneral = settingsRecord(existingPayload.general);
  const existingPerformance = settingsRecord(existingPayload.performance);
  const existingCms = settingsRecord(existingPayload.cms);
  const existingFooter = settingsRecord(existingPayload.footer);
  const existingSecurity = settingsRecord(existingPayload.security);
  const existingNotifications = settingsRecord(existingPayload.notifications);
  const payload = {
    general: {
      website_name: mergeSettingString(formData, "website_name", existingString(existingGeneral, "website_name", "Mithron Flight Systems"), "Mithron Flight Systems"),
      brand_logo: mergeSettingString(formData, "brand_logo", existingString(existingGeneral, "brand_logo")),
      admin_theme: existingString(existingGeneral, "admin_theme", "dark"),
      accent_color: existingString(existingGeneral, "accent_color", "#10b981"),
      timezone: mergeSettingString(formData, "timezone", existingString(existingGeneral, "timezone", "Asia/Kolkata"), "Asia/Kolkata"),
      currency: mergeSettingString(formData, "currency", existingString(existingGeneral, "currency", "INR"), "INR"),
      language: mergeSettingString(formData, "language", existingString(existingGeneral, "language", "en"), "en")
    },
    performance: {
      image_compression: existingBoolean(existingPerformance, "image_compression"),
      avif_webp_conversion: existingBoolean(existingPerformance, "avif_webp_conversion"),
      lazy_loading: existingBoolean(existingPerformance, "lazy_loading"),
      cdn_optimization: existingBoolean(existingPerformance, "cdn_optimization"),
      thumbnail_mode: existingBoolean(existingPerformance, "thumbnail_mode"),
      query_caching: existingBoolean(existingPerformance, "query_caching"),
      realtime_updates: existingBoolean(existingPerformance, "realtime_updates"),
      low_bandwidth_mode: existingBoolean(existingPerformance, "low_bandwidth_mode")
    },
    cms: {
      instant_publish: existingBoolean(existingCms, "instant_publish"),
      draft_mode: existingBoolean(existingCms, "draft_mode"),
      section_visibility_controls: existingBoolean(existingCms, "section_visibility_controls"),
      autosave_drafts: existingBoolean(existingCms, "autosave_drafts"),
      clear_homepage_cache_on_publish: existingBoolean(existingCms, "clear_homepage_cache_on_publish"),
      visual_editor: existingBoolean(existingCms, "visual_editor"),
      image_previews: existingBoolean(existingCms, "image_previews")
    },
    footer: {
      leadTitle: existingString(existingFooter, "leadTitle"),
      leadBody: existingString(existingFooter, "leadBody"),
      contactEmail: existingString(existingFooter, "contactEmail"),
      contactPhone: existingString(existingFooter, "contactPhone"),
      legalText: existingString(existingFooter, "legalText")
    },
    security: {
      session_timeout_minutes: mergeSettingString(formData, "session_timeout_minutes", existingString(existingSecurity, "session_timeout_minutes", "60"), "60"),
      two_factor_required: mergeSettingBoolean(formData, "two_factor_required", existingBoolean(existingSecurity, "two_factor_required")),
      login_alerts: mergeSettingBoolean(formData, "login_alerts", existingBoolean(existingSecurity, "login_alerts", true)),
      device_tracking: existingBoolean(existingSecurity, "device_tracking"),
      password_reset_enabled: mergeSettingBoolean(formData, "password_reset_enabled", existingBoolean(existingSecurity, "password_reset_enabled", true)),
      allowed_admin_domains: mergeSettingString(formData, "allowed_admin_domains", existingString(existingSecurity, "allowed_admin_domains"))
    },
    notifications: {
      order_alerts: mergeSettingBoolean(formData, "order_alerts", existingBoolean(existingNotifications, "order_alerts", true)),
      warehouse_alerts: mergeSettingBoolean(formData, "warehouse_alerts", existingBoolean(existingNotifications, "warehouse_alerts", true)),
      cms_publish_alerts: existingBoolean(existingNotifications, "cms_publish_alerts"),
      admin_login_alerts: existingBoolean(existingNotifications, "admin_login_alerts"),
      email_notifications: mergeSettingBoolean(formData, "email_notifications", existingBoolean(existingNotifications, "email_notifications"))
    },
    updated_by: actorId,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from("admin_settings")
    .upsert({ id: "global", payload, updated_by: actorId, updated_at: payload.updated_at }, { onConflict: "id" });

  if (error) {
    throw new Error(`Failed to save admin settings: ${error.message}`);
  }

  await createActivityLogRecord(
    {
      actor_id: actorId,
      action: "settings.update",
      entity_table: "admin_settings",
      entity_id: "global",
      severity: "info",
      metadata: {
        actor_role: actorRole,
        sections: ["general", "security", "notifications"]
      }
    },
    actorId
  );

  revalidateStorefrontSettingsSurfaces();
  redirect(`/admin/settings?settings_status=success&settings_message=${encodeURIComponent("Settings saved successfully.")}`);
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    const message = error instanceof Error ? error.message : String(error);
    redirect(`/admin/settings?settings_status=error&settings_message=${encodeURIComponent(message.slice(0, 240))}`);
  }
}

async function ensureCanonicalRoleRecord(role: CmsRole) {
  const supabase = serviceClient();
  const { error } = await supabase
    .from("roles")
    .upsert({ key: role, ...canonicalRoleRows[role] }, { onConflict: "key" });
  if (error) {
    throw new Error(`Failed to ensure role ${role}: ${error.message}`);
  }
}

async function updateAuthUserWithMergedAppMetadata(
  userId: string,
  patch: JsonRecord,
  attributes: { ban_duration?: string } = {}
) {
  const supabase = serviceClient();
  const current = await supabase.auth.admin.getUserById(userId);
  if (current.error) {
    throw new Error(`Failed to load auth user ${userId}: ${current.error.message}`);
  }

  const existing = current.data.user?.app_metadata;
  const appMetadata = existing && typeof existing === "object" && !Array.isArray(existing)
    ? { ...(existing as JsonRecord), ...patch }
    : patch;
  const updated = await supabase.auth.admin.updateUserById(userId, { ...attributes, app_metadata: appMetadata });
  if (updated.error) {
    throw new Error(`Failed to update auth user ${userId}: ${updated.error.message}`);
  }
  return updated.data.user;
}

async function updateAuthUserRoleMetadata(userId: string, role: string | null) {
  return updateAuthUserWithMergedAppMetadata(userId, { role });
}

async function fetchRemainingRoles(userId: string) {
  const config = assertSupabaseAdminConfig(process.env);
  const response = await fetch(`${config.url}/rest/v1/user_roles?select=role_key&user_id=eq.${encodeURIComponent(userId)}&order=created_at.asc`, {
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Failed to load remaining user roles: ${response.status} ${response.statusText}`);
  }

  const rows = await response.json() as JsonRecord[];
  const roles: CmsRole[] = [];
  for (const row of rows) {
    const role = normalizeCmsRole(row.role_key);
    if (role && !roles.includes(role)) roles.push(role);
  }
  return roles;
}

async function findPendingInvite(email: string, role: string) {
  const config = assertSupabaseAdminConfig(process.env);
  const response = await fetch(
    `${config.url}/rest/v1/admin_invites?${settingsReadColumns.pendingInvite}&email=eq.${encodeURIComponent(email)}&role_key=eq.${encodeURIComponent(role)}&status=eq.pending&order=created_at.desc&limit=1`,
    {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        "Content-Type": "application/json"
      },
      cache: "no-store"
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to check pending invite: ${response.status} ${response.statusText}`);
  }

  const rows = await response.json() as JsonRecord[];
  return rows[0] ?? null;
}

async function findInviteNotification(inviteId: string) {
  const config = assertSupabaseAdminConfig(process.env);
  const response = await fetch(
    `${config.url}/rest/v1/notifications?${settingsReadColumns.inviteNotification}&entity_table=eq.admin_invites&entity_id=eq.${encodeURIComponent(inviteId)}&limit=20`,
    {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        "Content-Type": "application/json"
      },
      cache: "no-store"
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to check invite notifications: ${response.status} ${response.statusText}`);
  }

  const rows = await response.json() as JsonRecord[];
  return rows.find((row) => {
    const payload = row.payload;
    return Boolean(payload && typeof payload === "object" && !Array.isArray(payload) && (payload as JsonRecord).event === "users.invite_notification");
  }) ?? null;
}

async function fetchInviteById(inviteId: string) {
  const config = assertSupabaseAdminConfig(process.env);
  const response = await fetch(
    `${config.url}/rest/v1/admin_invites?${settingsReadColumns.inviteById}&id=eq.${encodeURIComponent(inviteId)}&limit=1`,
    {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        "Content-Type": "application/json"
      },
      cache: "no-store"
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to load invite ${inviteId}: ${response.status} ${response.statusText}`);
  }

  const rows = await response.json() as JsonRecord[];
  return rows[0] ?? null;
}

async function fetchAuthUserGovernanceState(userId: string) {
  const supabase = serviceClient();
  const current = await supabase.auth.admin.getUserById(userId);
  if (current.error) {
    throw new Error(`Failed to load auth user ${userId}: ${current.error.message}`);
  }
  const user = current.data.user;
  return {
    user_id: user?.id ?? userId,
    email: user?.email ?? null,
    app_metadata: user?.app_metadata ?? {},
    user_metadata: user?.user_metadata ?? {},
    banned_until: user?.banned_until ?? null
  };
}

function governanceMetadata(input: {
  actorRole: string | null;
  targetUserId: string | null;
  beforeState: JsonRecord | null;
  afterState: JsonRecord | null;
  relatedEntityIds?: JsonRecord;
  details?: JsonRecord;
}) {
  return {
    actor_role: input.actorRole,
    target_user_id: input.targetUserId,
    before_state: input.beforeState,
    after_state: input.afterState,
    related_entity_ids: input.relatedEntityIds ?? {},
    ...(input.details ?? {})
  };
}

async function logUserGovernanceAction(input: {
  actorId: string;
  actorRole: string | null;
  action: string;
  entityTable: string;
  entityId: string;
  targetUserId: string | null;
  beforeState: JsonRecord | null;
  afterState: JsonRecord | null;
  metadata: JsonRecord;
  relatedEntityIds?: JsonRecord;
  severity?: string;
}) {
  await createActivityLogRecord(
    {
      actor_id: input.actorId,
      action: input.action,
      entity_table: input.entityTable,
      entity_id: input.entityId,
      severity: input.severity ?? "info",
      metadata: governanceMetadata({
        actorRole: input.actorRole,
        targetUserId: input.targetUserId,
        beforeState: input.beforeState,
        afterState: input.afterState,
        relatedEntityIds: input.relatedEntityIds,
        details: input.metadata
      })
    },
    input.actorId
  );
}

async function createInviteNotificationIfMissing(input: {
  actorId: string;
  actorRole: string | null;
  inviteId: string;
  email: string;
  role: string;
  targetUserId: string | null;
  expiresAt: string;
}) {
  const existing = await findInviteNotification(input.inviteId);
  if (existing) return existing;

  const notification = await createNotificationRecord(
    {
      recipient_id: input.actorId,
      channel: "admin",
      title: "Managed user invite issued",
      body: `${input.email} was invited as ${input.role}.`,
      status: "unread",
      priority: "normal",
      entity_table: "admin_invites",
      entity_id: input.inviteId,
      payload: {
        event: "users.invite_notification",
        actor_role: input.actorRole,
        target_user_id: input.targetUserId,
        email: input.email,
        role: input.role,
        expires_at: input.expiresAt
      }
    },
    input.actorId
  );

  await logUserGovernanceAction({
    actorId: input.actorId,
    actorRole: input.actorRole,
    action: "users.invite_notification",
    entityTable: "admin_invites",
    entityId: input.inviteId,
    targetUserId: input.targetUserId,
    beforeState: null,
    afterState: notification,
    relatedEntityIds: {
      invite_id: input.inviteId,
      notification_id: notification.id ?? null,
      auth_user_id: input.targetUserId
    },
    metadata: {
      email: input.email,
      role: input.role,
      notification_id: notification.id ?? null
    }
  });

  return notification;
}

async function upsertManagedProfile(input: {
  userId: string;
  email: string;
  displayName: string | null;
  defaultRole: string;
  actorId: string;
}) {
  const now = new Date().toISOString();
  return upsertProfileRecord(
    {
      id: input.userId,
      email: input.email,
      display_name: input.displayName ?? input.email,
      default_role: input.defaultRole,
      governance_status: "active",
      updated_at: now
    },
    input.actorId
  );
}

function revalidateSettings() {
  // User/role governance does not change storefront CMS/shell — keep
  // invalidation scoped to admin surfaces only.
  revalidatePath("/admin");
  revalidatePath("/admin/settings");
  revalidatePath("/admin/users");
}

function revalidateStorefrontSettingsSurfaces() {
  // Admin settings payload (brand, footer lead, CMS toggles) is tagged into
  // storefront fetch caches — revalidate those when settings change.
  revalidateTag("admin-settings", "max");
  revalidateTag("cms", "max");
  revalidateTag("cms-public", "max");
  revalidateTag("homepage-cms", "max");
  revalidateTag("cms-footer-lead", "max");
  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");
}

async function findAuthUserByEmail(supabase: ReturnType<typeof serviceClient>, email: string) {
  const normalizedEmail = email.toLowerCase();
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      throw new Error(`Failed to inspect Supabase Auth users: ${error.message}`);
    }
    const match = data.users.find((user) => user.email?.toLowerCase() === normalizedEmail);
    if (match) return match;
    if (data.users.length < 200) break;
  }
  return null;
}

export async function createManagedUserAction(formData: FormData): Promise<ManagedUserCreateResult> {
  const { actorId, actorRole } = await settingsActor();
  const email = assertEmail(readRequiredString(formData, "email", "User"));
  const policy = await getAdminSettingsPolicy();
  assertAdminEmailDomainAllowed(email, policy);
  const displayName = readOptionalString(formData, "display_name");
  const role = assertManageableUserRole(readRequiredString(formData, "role_key", "User"));
  const assignedWarehouseCode = readOptionalString(formData, "assigned_warehouse_code");
  if (role === "warehouse" && !assignedWarehouseCode) {
    throw new Error("Warehouse users must be assigned to a warehouse site.");
  }
  const providedPassword = readOptionalString(formData, "temporary_password");
  const passwordGenerated = !providedPassword;
  const password = passwordGenerated ? generatedTemporaryPassword() : assertTemporaryPassword(providedPassword);
  const supabase = serviceClient();
  await ensureAllCanonicalRoles();

  const config = assertSupabaseAdminConfig(process.env);
  const existingAuthUser = await findAuthUserByEmail(supabase, email);
  if (existingAuthUser) {
    await provisionAuthenticatedUser({
      userId: existingAuthUser.id,
      email,
      displayName,
      preferredRole: role,
      actorId
    }).catch((error) => {
      console.error("[admin/settings] provisioning existing auth user failed before duplicate-account rejection", {
        email,
        userId: existingAuthUser.id,
        error: error instanceof Error ? error.message : String(error)
      });
    });
    throw new Error(`A user with email ${email} already exists in Supabase Auth. Open that user and use "Set new password" instead of creating a duplicate account.`);
  }

  const duplicateResponse = await fetchWithTimeout(
    `${config.url}/rest/v1/profiles?select=id&email=eq.${encodeURIComponent(email)}&limit=1`,
    {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`
      },
      cache: "no-store"
    }
  );
  if (duplicateResponse.ok) {
    const duplicateRows = await duplicateResponse.json() as Array<{ id?: string }>;
    if (duplicateRows.length) {
      throw new Error(`A user with email ${email} already exists. Assign a role instead of creating a duplicate account.`);
    }
  }

  const created = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName ?? email },
    app_metadata: { role, governance_status: "active" }
  });
  if (created.error || !created.data.user) {
    throw new Error(`Failed to create managed user: ${created.error?.message ?? "missing auth user"}`);
  }

  await provisionAuthenticatedUser({
    userId: created.data.user.id,
    email,
    displayName,
    preferredRole: role,
    assignedWarehouseCode: role === "warehouse" ? assignedWarehouseCode : null,
    actorId
  });

  if (role === "warehouse" && assignedWarehouseCode) {
    await assignWarehouseOperator({
      userId: created.data.user.id,
      warehouseCode: assignedWarehouseCode,
      actorId
    });
    await insertUserNotification({
      recipientId: created.data.user.id,
      channel: "warehouse",
      title: "Warehouse assignment",
      body: `You have been assigned to warehouse ${assignedWarehouseCode}.`,
      entityTable: "warehouses",
      entityId: assignedWarehouseCode,
      actorId,
      payload: {
        event: "users.warehouse_assign",
        warehouse_code: assignedWarehouseCode,
        role
      },
      dedupeKey: `warehouse-assign:${created.data.user.id}:${assignedWarehouseCode}`
    });
  }

  await verifyManagedUserCredentials(email, password);

  await logUserGovernanceAction({
    actorId,
    actorRole,
    action: "users.create",
    entityTable: "profiles",
    entityId: created.data.user.id,
    targetUserId: created.data.user.id,
    beforeState: null,
    afterState: { user_id: created.data.user.id, email, role, governance_status: "active" },
    relatedEntityIds: { profile_id: created.data.user.id },
    metadata: { email, role, display_name: displayName }
  }).catch((error) => {
    console.warn("[mithron-governance] User created but activity log write failed.", error);
  });

  revalidateSettings();

  return {
    userId: created.data.user.id,
    email,
    role,
    temporaryPassword: password,
    passwordGenerated
  };
}

export async function createUserFormAction(
  _prevState: CreateUserFormState,
  formData: FormData
): Promise<CreateUserFormState> {
  try {
    const result = await createManagedUserAction(formData);
    return {
      status: "success",
      message: `Created ${result.email} with the ${result.role} role.`,
      email: result.email,
      temporaryPassword: result.temporaryPassword,
      passwordGenerated: result.passwordGenerated
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Failed to create user."
    };
  }
}

export async function resetManagedUserPasswordAction(formData: FormData) {
  const { actorId, actorRole } = await settingsActor();
  const policy = await getAdminSettingsPolicy();
  assertPasswordResetPolicyAllowed(policy);
  const userId = readRequiredString(formData, "user_id", "Password reset");
  const email = assertEmail(readRequiredString(formData, "email", "Password reset"));
  const password = assertTemporaryPassword(readOptionalString(formData, "temporary_password"), "New password");
  const supabase = serviceClient();
  const current = await supabase.auth.admin.getUserById(userId);
  if (current.error || !current.data.user) {
    throw new Error(`Failed to load auth user ${userId}: ${current.error?.message ?? "missing user"}`);
  }

  const updated = await supabase.auth.admin.updateUserById(userId, {
    password,
    email_confirm: true
  });
  if (updated.error) {
    throw new Error(`Failed to reset password for ${email}: ${updated.error.message}`);
  }

  await verifyManagedUserCredentials(email, password);

  await logUserGovernanceAction({
    actorId,
    actorRole,
    action: "users.password_reset",
    entityTable: "profiles",
    entityId: userId,
    targetUserId: userId,
    beforeState: null,
    afterState: { user_id: userId, email, password_reset: true },
    relatedEntityIds: { profile_id: userId },
    metadata: { email }
  }).catch((error) => {
    console.warn("[mithron-governance] Password reset succeeded but activity log write failed.", error);
  });

  revalidateSettings();
}

export async function inviteManagedUserAction(formData: FormData) {
  const { actorId, actorRole } = await settingsActor();
  const email = assertEmail(readRequiredString(formData, "email", "Invite"));
  const displayName = readOptionalString(formData, "display_name");
  const role = assertManageableUserRole(readRequiredString(formData, "role_key", "Invite"));
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const supabase = serviceClient();
  await ensureCanonicalRoleRecord(role);
  const existingInvite = await findPendingInvite(email, role);

  if (existingInvite) {
    await logUserGovernanceAction({
      actorId,
      actorRole,
      action: "users.invite_duplicate",
      entityTable: "admin_invites",
      entityId: String(existingInvite.id ?? email),
      targetUserId: typeof existingInvite.metadata === "object" && existingInvite.metadata && !Array.isArray(existingInvite.metadata)
        ? String((existingInvite.metadata as JsonRecord).auth_user_id ?? "")
        : null,
      beforeState: existingInvite,
      afterState: existingInvite,
      relatedEntityIds: { invite_id: existingInvite.id ?? null },
      metadata: { email, role, reason: "Duplicate pending invite" },
      severity: "warning"
    });
    revalidateSettings();
    return;
  }

  const invited = await supabase.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      data: { display_name: displayName ?? email, invited_role: role, invited_by: actorId }
    }
  });
  if (invited.error) {
    throw new Error(`Failed to generate managed user invite: ${invited.error.message}`);
  }

  const invitedUserId = invited.data.user?.id ?? null;
  const invite = await createAdminRecord(
    "admin_invites",
    {
      email,
      role_key: role,
      token_hash: invited.data.properties?.hashed_token ?? randomUUID(),
      status: "pending",
      invited_by: actorId,
      expires_at: expiresAt,
      metadata: {
        source: "supabase_auth_generate_link",
        link_generated: Boolean(invited.data.properties?.action_link),
        verification_type: invited.data.properties?.verification_type ?? "invite",
        redirect_to: invited.data.properties?.redirect_to ?? null,
        display_name: displayName,
        auth_user_id: invitedUserId
      }
    },
    actorId
  );

  await logUserGovernanceAction({
    actorId,
    actorRole,
    action: "users.invite",
    entityTable: "admin_invites",
    entityId: String(invite.id ?? email),
    targetUserId: invitedUserId,
    beforeState: null,
    afterState: {
      invite_id: invite.id ?? null,
      email,
      role,
      status: "pending",
      expires_at: expiresAt,
      auth_user_id: invitedUserId
    },
    relatedEntityIds: { invite_id: invite.id ?? null, auth_user_id: invitedUserId },
    metadata: { email, role, display_name: displayName, expires_at: expiresAt }
  });

  await createInviteNotificationIfMissing({
    actorId,
    actorRole,
    inviteId: String(invite.id ?? email),
    email,
    role,
    targetUserId: invitedUserId,
    expiresAt
  });

  revalidateSettings();
}

export async function invalidateManagedInviteAction(formData: FormData) {
  const { actorId, actorRole } = await settingsActor();
  const inviteId = readRequiredString(formData, "invite_id", "Invite invalidation");
  const beforeState = await fetchInviteById(inviteId);
  if (!beforeState) {
    throw new Error(`Invite ${inviteId} was not found.`);
  }

  const invalidatedAt = new Date().toISOString();
  const updatedInvite = await updateAdminRecord(
    "admin_invites",
    "id",
    inviteId,
    {
      status: "invalidated",
      metadata: {
        ...((beforeState.metadata && typeof beforeState.metadata === "object" && !Array.isArray(beforeState.metadata)) ? beforeState.metadata as JsonRecord : {}),
        invalidated_by: actorId,
        invalidated_at: invalidatedAt,
        mutation_source: "admin.settings.invite_invalidate"
      }
    },
    actorId
  );

  const targetUserId = beforeState.metadata && typeof beforeState.metadata === "object" && !Array.isArray(beforeState.metadata)
    ? String((beforeState.metadata as JsonRecord).auth_user_id ?? "") || null
    : null;

  if (targetUserId && beforeState.status === "pending") {
    const invitedRole = normalizeCmsRole(beforeState.role_key);
    if (invitedRole && invitedRole !== "user") {
      await deleteUserRoleRecord(targetUserId, invitedRole, actorId);
      await updateAuthUserRoleMetadata(targetUserId, "user");
    }
  }

  await logUserGovernanceAction({
    actorId,
    actorRole,
    action: "users.invite_invalidate",
    entityTable: "admin_invites",
    entityId: inviteId,
    targetUserId,
    beforeState,
    afterState: updatedInvite,
    relatedEntityIds: { invite_id: inviteId, auth_user_id: targetUserId },
    metadata: {
      invite_id: inviteId,
      email: beforeState.email ?? null,
      role_key: beforeState.role_key ?? null,
      workflow_type: "incident_recovery",
      mutation_source: "admin.settings.invite_invalidate"
    },
    severity: "warning"
  });

  revalidateSettings();
}

export async function assignManagedUserRoleAction(formData: FormData) {
  const { actorId, actorRole } = await settingsActor();
  const userId = readRequiredString(formData, "user_id", "Role assignment");
  const email = readOptionalString(formData, "email") ?? "";
  const displayName = readOptionalString(formData, "display_name");
  const role = assertManageableUserRole(readRequiredString(formData, "role_key", "Role assignment"));
  const beforeRoles = await fetchRemainingRoles(userId);
  await ensureCanonicalRoleRecord(role);

  await upsertManagedProfile({ userId, email, displayName, defaultRole: role, actorId });
  for (const existingRole of beforeRoles) {
    if (existingRole !== role) {
      await deleteUserRoleRecord(userId, existingRole, actorId);
    }
  }
  await upsertUserRoleRecord({ user_id: userId, role_key: role }, actorId);
  await updateAuthUserRoleMetadata(userId, role);
  const afterRoles = await fetchRemainingRoles(userId);
  await logUserGovernanceAction({
    actorId,
    actorRole,
    action: "users.role_assign",
    entityTable: "user_roles",
    entityId: `${userId}:${role}`,
    targetUserId: userId,
    beforeState: { roles: beforeRoles },
    afterState: { roles: afterRoles, default_role: role },
    relatedEntityIds: { user_id: userId, role_key: role },
    metadata: { user_id: userId, role_key: role }
  });

  revalidateSettings();
  await invalidateAuthRoleRedisCaches(userId);
  await insertUserNotification({
    recipientId: userId,
    channel: notificationChannelForRole(role),
    title: "Role updated",
    body: `Your account role was changed to ${role}.`,
    entityTable: "user_roles",
    entityId: `${userId}:${role}`,
    actorId,
    payload: {
      event: "users.role_assign",
      before_roles: beforeRoles,
      after_roles: afterRoles,
      role
    },
    dedupeKey: `role-assign:${userId}:${role}`
  });
  await revalidateAfterMutation("user_roles", "notifications");
}

export async function removeManagedUserRoleAction(formData: FormData) {
  const { actorId, actorRole } = await settingsActor();
  const userId = readRequiredString(formData, "user_id", "Role removal");
  const role = assertManageableUserRole(readRequiredString(formData, "role_key", "Role removal"));
  const beforeRoles = await fetchRemainingRoles(userId);

  await deleteUserRoleRecord(userId, role, actorId);
  let remainingRoles = await fetchRemainingRoles(userId);
  if (!remainingRoles.length) {
    await ensureCanonicalRoleRecord("user");
    await upsertUserRoleRecord({ user_id: userId, role_key: "user" }, actorId);
    remainingRoles = ["user"];
  }
  const nextDefaultRole = remainingRoles[0] ?? "user";
  await upsertProfileRecord({ id: userId, default_role: nextDefaultRole, updated_at: new Date().toISOString() }, actorId);
  await updateAuthUserRoleMetadata(userId, nextDefaultRole);
  await logUserGovernanceAction({
    actorId,
    actorRole,
    action: "users.role_remove",
    entityTable: "user_roles",
    entityId: `${userId}:${role}`,
    targetUserId: userId,
    beforeState: { roles: beforeRoles },
    afterState: { roles: remainingRoles, default_role: nextDefaultRole },
    relatedEntityIds: { user_id: userId, role_key: role },
    metadata: { user_id: userId, role_key: role, remaining_roles: remainingRoles },
    severity: "warning"
  });

  revalidateSettings();
  await invalidateAuthRoleRedisCaches(userId);
  await insertUserNotification({
    recipientId: userId,
    channel: notificationChannelForRole(nextDefaultRole),
    title: "Role updated",
    body: `The ${role} role was removed from your account. Your current role is ${nextDefaultRole}.`,
    entityTable: "user_roles",
    entityId: `${userId}:${role}`,
    actorId,
    payload: {
      event: "users.role_remove",
      before_roles: beforeRoles,
      after_roles: remainingRoles,
      removed_role: role,
      default_role: nextDefaultRole
    },
    dedupeKey: `role-remove:${userId}:${role}`
  });
  await revalidateAfterMutation("user_roles", "notifications");
}

export async function disableManagedUserAction(formData: FormData) {
  const { actorId, actorRole } = await settingsActor();
  const userId = readRequiredString(formData, "user_id", "Disable user");
  if (userId === actorId) {
    throw new Error("Admins cannot disable their own active session.");
  }

  const beforeState = await fetchAuthUserGovernanceState(userId);
  const revokedAt = new Date().toISOString();
  await updateAuthUserWithMergedAppMetadata(
    userId,
    {
      governance_status: "disabled",
      disabled_by: actorId,
      disabled_at: revokedAt,
      session_revoked_at: revokedAt
    },
    { ban_duration: "876000h" }
  );
  await upsertProfileRecord(
    {
      id: userId,
      governance_status: "disabled",
      disabled_by: actorId,
      disabled_at: revokedAt,
      session_revoked_at: revokedAt,
      updated_at: revokedAt
    },
    actorId
  );
  const afterState = await fetchAuthUserGovernanceState(userId);

  await logUserGovernanceAction({
    actorId,
    actorRole,
    action: "users.disable",
    entityTable: "profiles",
    entityId: userId,
    targetUserId: userId,
    beforeState,
    afterState,
    relatedEntityIds: { user_id: userId },
    metadata: { user_id: userId },
    severity: "warning"
  });

  await recordAuthActivityEvent({
    action: "auth.session_revoked",
    actorUserId: actorId,
    actorRole,
    authProvider: "supabase",
    severity: "warning",
    metadata: {
      target_user_id: userId,
      before_state: beforeState,
      after_state: afterState,
      mutation_source: "admin.settings.disable"
    }
  }).catch((error) => console.error("[mithron-auth] Failed to log auth.session_revoked.", error));

  revalidateSettings();
  await invalidateAuthRoleRedisCaches(userId);
  await insertUserNotification({
    recipientId: userId,
    channel: "customer",
    title: "Account suspended",
    body: "Your account has been suspended by an administrator.",
    entityTable: "profiles",
    entityId: userId,
    actorId,
    priority: "high",
    payload: {
      event: "users.disable",
      governance_status: "disabled"
    },
    dedupeKey: `users-disable:${userId}:${revokedAt}`
  });
  await revalidateAfterMutation("profiles", "notifications");
}

export async function reactivateManagedUserAction(formData: FormData) {
  const { actorId, actorRole } = await settingsActor();
  const userId = readRequiredString(formData, "user_id", "Reactivate user");
  const roleValue = readOptionalString(formData, "role_key");
  const role = roleValue ? assertManageableUserRole(roleValue) : null;
  const beforeState = await fetchAuthUserGovernanceState(userId);
  const reactivatedAt = new Date().toISOString();
  const reactivated = await updateAuthUserWithMergedAppMetadata(
    userId,
    {
      governance_status: "active",
      reactivated_by: actorId,
      reactivated_at: reactivatedAt,
      ...(role ? { role } : {})
    },
    { ban_duration: "none" }
  );

  if (role) {
    const beforeRoles = await fetchRemainingRoles(userId);
    await ensureCanonicalRoleRecord(role);
    for (const existingRole of beforeRoles) {
      if (existingRole !== role) {
        await deleteUserRoleRecord(userId, existingRole, actorId);
      }
    }
    await upsertManagedProfile({
      userId,
      email: String(reactivated?.email ?? ""),
      displayName: String(reactivated?.user_metadata?.display_name ?? reactivated?.email ?? ""),
      defaultRole: role,
      actorId
    });
    await upsertUserRoleRecord({ user_id: userId, role_key: role }, actorId);
  }
  await upsertProfileRecord(
    {
      id: userId,
      governance_status: "active",
      disabled_by: null,
      disabled_at: null,
      reactivated_by: actorId,
      reactivated_at: reactivatedAt,
      updated_at: reactivatedAt
    },
    actorId
  );
  const afterRoles = await fetchRemainingRoles(userId);
  const afterState = await fetchAuthUserGovernanceState(userId);

  await logUserGovernanceAction({
    actorId,
    actorRole,
    action: "users.reactivate",
    entityTable: "profiles",
    entityId: userId,
    targetUserId: userId,
    beforeState,
    afterState: { ...afterState, roles: afterRoles },
    relatedEntityIds: { user_id: userId, role_key: role },
    metadata: { user_id: userId, role_key: role }
  });

  revalidateSettings();
  await invalidateAuthRoleRedisCaches(userId);
  await insertUserNotification({
    recipientId: userId,
    channel: notificationChannelForRole(role ?? afterRoles[0] ?? "user"),
    title: "Account reactivated",
    body: role
      ? `Your account has been reactivated with the ${role} role.`
      : "Your account has been reactivated by an administrator.",
    entityTable: "profiles",
    entityId: userId,
    actorId,
    payload: {
      event: "users.reactivate",
      governance_status: "active",
      role
    },
    dedupeKey: `users-reactivate:${userId}:${reactivatedAt}`
  });
  await revalidateAfterMutation("profiles", ...(role ? (["user_roles"] as const) : []), "notifications");
}

export async function removeManagedUserAction(formData: FormData) {
  const { actorId, actorRole } = await settingsActor();
  const userId = readRequiredString(formData, "user_id", "Remove user");
  if (userId === actorId) {
    throw new Error("Admins cannot remove their own active account.");
  }

  const beforeState = await fetchAuthUserGovernanceState(userId);
  const beforeRoles = await fetchRemainingRoles(userId);
  const supabase = serviceClient();
  const removedAt = new Date().toISOString();
  for (const role of beforeRoles) {
    await deleteUserRoleRecord(userId, role, actorId);
  }
  await deleteAdminRecord("profiles", "id", userId, actorId);
  const removed = await supabase.auth.admin.deleteUser(userId);
  if (removed.error) {
    throw new Error(`Failed to remove user ${userId}: ${removed.error.message}`);
  }

  await logUserGovernanceAction({
    actorId,
    actorRole,
    action: "users.remove",
    entityTable: "profiles",
    entityId: userId,
    targetUserId: userId,
    beforeState: { ...beforeState, roles: beforeRoles },
    afterState: { removed: true, removed_at: removedAt },
    relatedEntityIds: { user_id: userId },
    metadata: { user_id: userId, removed_at: removedAt },
    severity: "warning"
  });

  revalidateSettings();
}
