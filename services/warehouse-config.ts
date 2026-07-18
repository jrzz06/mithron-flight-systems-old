import { cache } from "react";
import { getSupabaseAdminConfig } from "@/lib/env";
import { listActiveWarehouses } from "@/services/warehouses";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

type EnvSource = Record<string, string | undefined>;

export type WarehouseConfiguration = {
  defaultWarehouseCode: string;
  checkoutWarehouseCode: string;
  supplierIntakeWarehouseCode: string;
  autoReserveOnAllocate: boolean;
  stockDeductionTrigger: "packed" | "dispatched";
  defaultCarrier: string;
  barcodePrefix: string;
  printerName: string;
  labelWidthMm: number;
  requireItemScan: boolean;
};

type WarehouseConfigurationRow = {
  default_warehouse_code?: string | null;
  checkout_warehouse_code?: string | null;
  supplier_intake_warehouse_code?: string | null;
  auto_reserve_on_allocate?: boolean | null;
  stock_deduction_trigger?: string | null;
  default_carrier?: string | null;
  barcode_prefix?: string | null;
  printer_name?: string | null;
  label_width_mm?: number | null;
  require_item_scan?: boolean | null;
};

function normalizeStockDeductionTrigger(_value: string | null | undefined): "packed" | "dispatched" {
  return "dispatched";
}

function headers(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`
  };
}

function buildFallbackWarehouseConfiguration(
  env: EnvSource,
  row: WarehouseConfigurationRow | null = null
): WarehouseConfiguration {
  const envCode = readEnvWarehouseFallback(env);
  return {
    defaultWarehouseCode: envCode,
    checkoutWarehouseCode: envCode,
    supplierIntakeWarehouseCode: envCode,
    autoReserveOnAllocate: false,
    stockDeductionTrigger: normalizeStockDeductionTrigger(row?.stock_deduction_trigger),
    defaultCarrier: row?.default_carrier?.trim() || "Mithron Field",
    barcodePrefix: row?.barcode_prefix?.trim() || "MTH-",
    printerName: row?.printer_name?.trim() || "",
    labelWidthMm: Number(row?.label_width_mm ?? 100) || 100,
    requireItemScan: row?.require_item_scan !== false
  };
}

async function loadWarehouseConfigurationRow(env: EnvSource = process.env): Promise<WarehouseConfigurationRow | null> {
  const config = getSupabaseAdminConfig(env);
  if (!config.configured) return null;

  try {
    const response = await fetchWithTimeout(
      `${config.url}/rest/v1/warehouse_configuration?id=eq.global&select=default_warehouse_code,checkout_warehouse_code,supplier_intake_warehouse_code,auto_reserve_on_allocate,stock_deduction_trigger,default_carrier,barcode_prefix,printer_name,label_width_mm,require_item_scan&limit=1`,
      { headers: headers(config.serviceRoleKey), cache: "no-store" }
    );
    if (!response.ok) return null;
    const rows = (await response.json()) as WarehouseConfigurationRow[];
    return rows[0] ?? null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[warehouse-config] Failed to load warehouse_configuration: ${message}`);
    return null;
  }
}

function readEnvWarehouseFallback(env: EnvSource) {
  return env.DEFAULT_WAREHOUSE_CODE?.trim() || "";
}

async function listActiveWarehouseCodesSafe(env: EnvSource) {
  try {
    const warehouses = await listActiveWarehouses(env);
    return warehouses.map((warehouse) => warehouse.code.trim()).filter(Boolean);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[warehouse-config] Failed to load active warehouses: ${message}`);
    return [];
  }
}

async function resolveConfiguredWarehouseCode(
  preferred: string | null | undefined,
  env: EnvSource
) {
  const normalized = preferred?.trim();
  if (normalized) return normalized;

  const envDefault = readEnvWarehouseFallback(env);
  if (envDefault) return envDefault;

  const codes = await listActiveWarehouseCodesSafe(env);
  const first = codes[0]?.trim();
  if (first) return first;

  return "";
}

export const getWarehouseConfiguration = cache(async (env: EnvSource = process.env): Promise<WarehouseConfiguration> => {
  try {
    const row = await loadWarehouseConfigurationRow(env);
    const defaultWarehouseCode = await resolveConfiguredWarehouseCode(row?.default_warehouse_code, env);
    const checkoutWarehouseCode = await resolveConfiguredWarehouseCode(
      row?.checkout_warehouse_code ?? defaultWarehouseCode,
      env
    );
    const supplierIntakeWarehouseCode = await resolveConfiguredWarehouseCode(
      row?.supplier_intake_warehouse_code ?? defaultWarehouseCode,
      env
    );

    return {
      defaultWarehouseCode: defaultWarehouseCode || readEnvWarehouseFallback(env),
      checkoutWarehouseCode: checkoutWarehouseCode || defaultWarehouseCode || readEnvWarehouseFallback(env),
      supplierIntakeWarehouseCode: supplierIntakeWarehouseCode || defaultWarehouseCode || readEnvWarehouseFallback(env),
      autoReserveOnAllocate: false,
      stockDeductionTrigger: normalizeStockDeductionTrigger(row?.stock_deduction_trigger),
      defaultCarrier: row?.default_carrier?.trim() || "Mithron Field",
      barcodePrefix: row?.barcode_prefix?.trim() || "MTH-",
      printerName: row?.printer_name?.trim() || "",
      labelWidthMm: Number(row?.label_width_mm ?? 100) || 100,
      requireItemScan: row?.require_item_scan !== false
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[warehouse-config] Failed to resolve warehouse configuration: ${message}`);
    return buildFallbackWarehouseConfiguration(env);
  }
});

export async function getDefaultWarehouseCode(env: EnvSource = process.env) {
  const config = await getWarehouseConfiguration(env);
  return config.defaultWarehouseCode;
}

export async function getCheckoutWarehouseCode(env: EnvSource = process.env) {
  const config = await getWarehouseConfiguration(env);
  return config.checkoutWarehouseCode;
}

export async function getSupplierIntakeWarehouseCode(env: EnvSource = process.env) {
  const config = await getWarehouseConfiguration(env);
  return config.supplierIntakeWarehouseCode;
}

export type WarehouseConfigurationInput = {
  defaultWarehouseCode: string;
  checkoutWarehouseCode: string;
  supplierIntakeWarehouseCode: string;
  autoReserveOnAllocate: boolean;
  stockDeductionTrigger: "packed" | "dispatched";
  defaultCarrier: string;
  barcodePrefix: string;
  printerName: string;
  labelWidthMm: number;
  requireItemScan: boolean;
};

export function parseWarehouseConfigurationFormData(formData: FormData): WarehouseConfigurationInput {
  const labelWidth = Number(formData.get("label_width_mm") ?? "100");
  const trigger = String(formData.get("stock_deduction_trigger") ?? "dispatched").trim().toLowerCase();
  return {
    defaultWarehouseCode: String(formData.get("default_warehouse_code") ?? "").trim(),
    checkoutWarehouseCode: String(formData.get("checkout_warehouse_code") ?? "").trim(),
    supplierIntakeWarehouseCode: String(formData.get("supplier_intake_warehouse_code") ?? "").trim(),
    autoReserveOnAllocate: false,
    stockDeductionTrigger: trigger === "packed" ? "packed" : "dispatched",
    defaultCarrier: String(formData.get("default_carrier") ?? "Mithron Field").trim() || "Mithron Field",
    barcodePrefix: String(formData.get("barcode_prefix") ?? "MTH-").trim() || "MTH-",
    printerName: String(formData.get("printer_name") ?? "").trim(),
    labelWidthMm: Number.isFinite(labelWidth) && labelWidth > 0 ? labelWidth : 100,
    requireItemScan: formData.get("require_item_scan") === "on"
  };
}
