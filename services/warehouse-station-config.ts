export type WarehouseStationConfig = {
  printerName: string;
  labelWidthMm: number;
  barcodePrefix: string;
  autoPrintPackingSlip: boolean;
  requireItemScan: boolean;
  defaultCarrier: string;
};

export const WAREHOUSE_STATION_CONFIG_STORAGE_KEY = "mithron.warehouse.station-config";

export function defaultWarehouseStationConfig(): WarehouseStationConfig {
  return {
    printerName: "",
    labelWidthMm: 100,
    barcodePrefix: "MTH-",
    autoPrintPackingSlip: false,
    requireItemScan: true,
    defaultCarrier: "Mithron Field"
  };
}

export function parseWarehouseStationConfig(value: unknown): WarehouseStationConfig {
  const defaults = defaultWarehouseStationConfig();
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaults;
  const record = value as Record<string, unknown>;
  const labelWidth = Number(record.labelWidthMm ?? defaults.labelWidthMm);
  return {
    printerName: typeof record.printerName === "string" ? record.printerName.trim() : defaults.printerName,
    labelWidthMm: Number.isFinite(labelWidth) && labelWidth > 0 ? labelWidth : defaults.labelWidthMm,
    barcodePrefix: typeof record.barcodePrefix === "string" ? record.barcodePrefix.trim() : defaults.barcodePrefix,
    autoPrintPackingSlip: typeof record.autoPrintPackingSlip === "boolean" ? record.autoPrintPackingSlip : defaults.autoPrintPackingSlip,
    requireItemScan: typeof record.requireItemScan === "boolean" ? record.requireItemScan : defaults.requireItemScan,
    defaultCarrier: typeof record.defaultCarrier === "string" && record.defaultCarrier.trim()
      ? record.defaultCarrier.trim()
      : defaults.defaultCarrier
  };
}

function parseWarehouseStationConfigFromFormData(formData: FormData): WarehouseStationConfig {
  const labelWidth = Number(formData.get("label_width_mm") ?? "100");
  return {
    printerName: String(formData.get("printer_name") ?? "").trim(),
    labelWidthMm: Number.isFinite(labelWidth) && labelWidth > 0 ? labelWidth : 100,
    barcodePrefix: String(formData.get("barcode_prefix") ?? "MTH-").trim(),
    autoPrintPackingSlip: formData.get("auto_print_packing_slip") === "on",
    requireItemScan: formData.get("require_item_scan") === "on",
    defaultCarrier: String(formData.get("default_carrier") ?? "Mithron Field").trim() || "Mithron Field"
  };
}

export function serializeWarehouseStationConfig(config: WarehouseStationConfig) {
  return JSON.stringify(config);
}
