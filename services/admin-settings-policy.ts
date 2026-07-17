import { cache } from "react";
import { unstable_cache } from "next/cache";
import { getSupabaseAdminConfig } from "@/lib/env";

type EnvSource = Record<string, string | undefined>;
type JsonRecord = Record<string, unknown>;

function readSection(payload: JsonRecord, key: string) {
  const value = payload[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function enabled(value: unknown, fallback = true) {
  return typeof value === "boolean" ? value : fallback;
}

async function loadAdminSettingsPayload(env: EnvSource = process.env) {
  const { getCachedAdminSettingsPayload } = await import("@/services/admin-settings-cache");
  const row = await getCachedAdminSettingsPayload();
  const payload = row?.payload;
  return payload && typeof payload === "object" && !Array.isArray(payload) ? payload as JsonRecord : {};
}

export type AdminSettingsPolicy = {
  warehouseAlertsEnabled: boolean;
  orderAlertsEnabled: boolean;
  cmsPublishAlertsEnabled: boolean;
  adminLoginAlertsEnabled: boolean;
  emailNotificationsEnabled: boolean;
  realtimeUpdatesEnabled: boolean;
  draftModeEnabled: boolean;
  instantPublishEnabled: boolean;
  sectionVisibilityControlsEnabled: boolean;
  queryCachingEnabled: boolean;
  lowBandwidthModeEnabled: boolean;
  defaultWarehouseCode: string;
  sessionTimeoutMinutes: number;
  passwordResetEnabled: boolean;
  allowedAdminDomains: string[];
};

export function assertAdminEmailDomainAllowed(email: string, policy: AdminSettingsPolicy) {
  if (!policy.allowedAdminDomains.length) return;
  const domain = email.split("@")[1]?.trim().toLowerCase() ?? "";
  if (!domain || !policy.allowedAdminDomains.includes(domain)) {
    throw new Error(`Email domain "${domain || "unknown"}" is not allowed for admin-managed accounts.`);
  }
}

export function assertPasswordResetPolicyAllowed(policy: AdminSettingsPolicy) {
  if (!policy.passwordResetEnabled) {
    throw new Error("Password reset is disabled in admin security settings.");
  }
}

export function assertCmsPublishPolicyAllowed(policy: AdminSettingsPolicy) {
  if (!policy.draftModeEnabled && !policy.instantPublishEnabled) {
    throw new Error("CMS publishing is disabled. Enable draft mode or instant publish in admin settings.");
  }
}

export function assertSectionVisibilityPolicyAllowed(policy: AdminSettingsPolicy) {
  if (!policy.sectionVisibilityControlsEnabled) {
    throw new Error("Section visibility controls are disabled in admin CMS settings.");
  }
}

function defaultAdminSettingsPolicy(env: EnvSource): AdminSettingsPolicy {
  const warehouseCode = env.DEFAULT_WAREHOUSE_CODE?.trim() || "";
  return {
    warehouseAlertsEnabled: true,
    orderAlertsEnabled: true,
    cmsPublishAlertsEnabled: true,
    adminLoginAlertsEnabled: true,
    emailNotificationsEnabled: false,
    realtimeUpdatesEnabled: true,
    draftModeEnabled: true,
    instantPublishEnabled: false,
    sectionVisibilityControlsEnabled: true,
    queryCachingEnabled: true,
    lowBandwidthModeEnabled: false,
    defaultWarehouseCode: warehouseCode,
    sessionTimeoutMinutes: 60,
    passwordResetEnabled: true,
    allowedAdminDomains: []
  };
}

async function resolveAdminSettingsPolicy(env: EnvSource = process.env): Promise<AdminSettingsPolicy> {
  const payload = await loadAdminSettingsPayload(env);
  const notifications = readSection(payload, "notifications");
  const performance = readSection(payload, "performance");
  const cms = readSection(payload, "cms");
  const security = readSection(payload, "security");
  const domains = String(security.allowed_admin_domains ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  const warehouse = readSection(payload, "warehouse");
  let warehouseConfig: Awaited<ReturnType<typeof import("@/services/warehouse-config").getWarehouseConfiguration>>;
  try {
    warehouseConfig = await import("@/services/warehouse-config").then((module) => module.getWarehouseConfiguration(env));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[admin-settings-policy] Failed to resolve warehouse configuration: ${message}`);
    warehouseConfig = {
      defaultWarehouseCode: env.DEFAULT_WAREHOUSE_CODE?.trim() || "",
      checkoutWarehouseCode: env.DEFAULT_WAREHOUSE_CODE?.trim() || "",
      supplierIntakeWarehouseCode: env.DEFAULT_WAREHOUSE_CODE?.trim() || "",
      autoReserveOnAllocate: true,
      defaultCarrier: "Mithron Field",
      barcodePrefix: "MTH-",
      printerName: "",
      labelWidthMm: 100,
      requireItemScan: true,
      stockDeductionTrigger: "dispatched"
    };
  }
  const configuredDefault = String(warehouse.default_warehouse_code ?? "").trim();

  return {
    warehouseAlertsEnabled: enabled(notifications.warehouse_alerts, true),
    orderAlertsEnabled: enabled(notifications.order_alerts, true),
    cmsPublishAlertsEnabled: enabled(notifications.cms_publish_alerts, true),
    adminLoginAlertsEnabled: enabled(notifications.admin_login_alerts, true),
    emailNotificationsEnabled: enabled(notifications.email_notifications, false),
    realtimeUpdatesEnabled: enabled(performance.realtime_updates, true),
    draftModeEnabled: enabled(cms.draft_mode, true),
    instantPublishEnabled: enabled(cms.instant_publish, false),
    sectionVisibilityControlsEnabled: enabled(cms.section_visibility_controls, true),
    queryCachingEnabled: enabled(performance.query_caching, true),
    lowBandwidthModeEnabled: enabled(performance.low_bandwidth_mode, false),
    defaultWarehouseCode: configuredDefault || warehouseConfig.defaultWarehouseCode,
    sessionTimeoutMinutes: Number(security.session_timeout_minutes ?? 60) || 60,
    passwordResetEnabled: enabled(security.password_reset_enabled, true),
    allowedAdminDomains: domains
  };
}

const loadAdminSettingsPolicyCached = unstable_cache(
  async () => resolveAdminSettingsPolicy(process.env),
  ["admin-settings-policy"],
  { revalidate: 30, tags: ["admin-settings"] }
);

export const getAdminSettingsPolicy = cache(async (env: EnvSource = process.env): Promise<AdminSettingsPolicy> => {
  try {
    if (env !== process.env) {
      return await resolveAdminSettingsPolicy(env);
    }
    try {
      return await loadAdminSettingsPolicyCached();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("incrementalCache missing")) {
        return await resolveAdminSettingsPolicy(env);
      }
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[admin-settings-policy] Failed to load admin settings policy: ${message}`);
    return defaultAdminSettingsPolicy(env);
  }
});
