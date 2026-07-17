import type { SimpleInventoryRow, SimpleInventoryStatus } from "@/services/simple-inventory-view";
import { stockStatusFromQuantity } from "@/services/inventory";

type RawCsvRow = Record<string, string>;

export const CSV_IMPORT_SOURCE_TAG = "uploaded_csv";
export const CSV_IMPORT_SOURCE_TAGS = ["uploaded_csv", "legacy_csv_import", "wix_inventory_csv"] as const;

export function isInternalAvailabilityTag(value: string) {
  return (CSV_IMPORT_SOURCE_TAGS as readonly string[]).includes(value);
}

const WIX_AVAILABILITY_ALIASES: Record<string, string> = {
  instock: "In stock",
  "in stock": "In stock",
  available: "In stock",
  outofstock: "Out of stock",
  "out of stock": "Out of stock",
  out_of_stock: "Out of stock",
  lowstock: "Low stock",
  "low stock": "Low stock",
  low_stock: "Low stock",
  unknown: "In stock"
};

export function customerFacingAvailability(value: string | null | undefined, fallback = "In stock") {
  const trimmed = String(value ?? "").trim();
  if (!trimmed || isInternalAvailabilityTag(trimmed)) return fallback;
  const normalized = WIX_AVAILABILITY_ALIASES[trimmed.toLowerCase()];
  return normalized ?? trimmed;
}

export type InventoryCsvRecord = {
  productName: string;
  productSlug: string;
  sku: string;
  stock: number;
  stockStatus: SimpleInventoryStatus;
  category: string;
  imageUrl: string | null;
  totalValue: number;
  unitPrice: number;
  sourceRow: number;
};

export type InventoryCsvMappingResult = {
  records: InventoryCsvRecord[];
  warnings: string[];
  errors: string[];
  duplicateSkus: string[];
  generatedSkus: string[];
};

export type InventorySnapshot = {
  productCount: number;
  stockUnits: number;
  totalValue: number;
  availableCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  archivedCount: number;
};

export function csvCell(value: unknown) {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replaceAll("\"", "\"\"")}"`;
}

function normalizeHeader(value: string) {
  return value.replace(/^\uFEFF/, "").trim();
}

function slugify(value: string, fallback: string) {
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || fallback;
}

function generatedSkuFor(productName: string, rowNumber: number) {
  return slugify(productName, `CSV-ROW-${rowNumber}`).toUpperCase();
}

function parseNonNegativeInteger(value: string) {
  const normalized = value.trim();
  if (!normalized) return null;
  const parsed = Number(normalized.replace(/,/g, ""));
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function isLikelyUrl(value: string) {
  if (!value.trim()) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function parseCurrencyValue(value: string) {
  const normalized = value.replace(/[^\d.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function inventoryStatusForQuantity(quantity: number): SimpleInventoryStatus {
  return stockStatusFromQuantity(quantity);
}

export function inventoryStatusLabel(status: SimpleInventoryStatus) {
  if (status === "out_of_stock") return "Out of stock";
  if (status === "archived") return "Archived";
  if (status === "discontinued") return "Discontinued";
  return "In stock";
}

export function parseInventoryCsv(csvText: string): RawCsvRow[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    const next = csvText[index + 1];

    if (char === "\"") {
      if (quoted && next === "\"") {
        field += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === "," && !quoted) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  if (!rows.length) return [];

  const headers = rows[0].map(normalizeHeader);
  return rows.slice(1).map((cells) => {
    const record: RawCsvRow = {};
    headers.forEach((header, index) => {
      record[header] = (cells[index] ?? "").trim();
    });
    return record;
  });
}

export function mapInventoryCsvRows(rows: RawCsvRow[], options: { category?: string } = {}): InventoryCsvMappingResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const records: InventoryCsvRecord[] = [];
  const generatedSkus: string[] = [];
  const skuCounts = new Map<string, number>();
  const generatedSkuCounts = new Map<string, number>();
  const slugCounts = new Map<string, number>();
  const category = options.category?.trim() || "Imported Inventory";

  rows.forEach((row, index) => {
    const sourceRow = index + 2;
    const productName = (row["Product variant"] ?? row["Product name"] ?? row.Name ?? "").trim();
    const baseProductSlug = slugify(productName, `csv-row-${sourceRow}`);
    const slugCount = (slugCounts.get(baseProductSlug) ?? 0) + 1;
    slugCounts.set(baseProductSlug, slugCount);
    const productSlug = slugCount > 1 ? `${baseProductSlug}-${slugCount}` : baseProductSlug;
    const rawStock = row.Inventory ?? row.Stock ?? row["Stock quantity"] ?? "";
    const stock = parseNonNegativeInteger(rawStock);
    const rawSku = (row.SKU ?? row.Sku ?? row.sku ?? "").trim();
    let sku = rawSku || generatedSkuFor(productName, sourceRow);
    const imageCandidate = (row["Product image"] ?? row["Image URL"] ?? row.Image ?? "").trim();
    const totalValue = parseCurrencyValue(row["Total value"] ?? row.Value ?? "");
    if (!rawSku) {
      const generatedCount = (generatedSkuCounts.get(sku) ?? 0) + 1;
      generatedSkuCounts.set(sku, generatedCount);
      if (generatedCount > 1) {
        sku = `${sku}-${generatedCount}`;
      }
    }
    if (!rawSku && generatedSkuCounts.get(generatedSkuFor(productName, sourceRow))! > 1) {
      warnings.push(`Row ${sourceRow}: Generated duplicate SKU adjusted to ${sku}.`);
    }
    skuCounts.set(sku, (skuCounts.get(sku) ?? 0) + 1);

    if (!productName) {
      errors.push(`Row ${sourceRow}: Missing product name.`);
      return;
    }

    if (stock === null) {
      errors.push(`Row ${sourceRow}: Invalid stock "${rawStock || "empty"}".`);
      return;
    }

    if (!rawSku) {
      warnings.push(`Row ${sourceRow}: Missing SKU; generated SKU ${sku}.`);
      generatedSkus.push(sku);
    }
    if (slugCount > 1) {
      warnings.push(`Row ${sourceRow}: Duplicate product slug adjusted to ${productSlug}.`);
    }

    const imageUrl = isLikelyUrl(imageCandidate) ? imageCandidate : null;
    if (imageCandidate && !imageUrl) {
      warnings.push(`Row ${sourceRow}: Invalid image URL ignored.`);
    }

    records.push({
      productName,
      productSlug,
      sku,
      stock,
      stockStatus: inventoryStatusForQuantity(stock),
      category,
      imageUrl,
      totalValue,
      unitPrice: stock > 0 ? Math.round(totalValue / stock) : totalValue,
      sourceRow
    });
  });

  const duplicateSkus = Array.from(skuCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([sku]) => sku)
    .sort();

  duplicateSkus.forEach((sku) => {
    errors.push(`Duplicate SKU "${sku}" found in inventory CSV.`);
  });

  return { records, warnings, errors, duplicateSkus, generatedSkus };
}

export function buildInventorySnapshot(rows: SimpleInventoryRow[]): InventorySnapshot {
  return rows.reduce<InventorySnapshot>((snapshot, row) => {
    snapshot.productCount += 1;
    snapshot.stockUnits += row.quantity;
    snapshot.totalValue += row.inventoryValue;
    if (row.stockStatus === "out_of_stock") snapshot.outOfStockCount += 1;
    if (row.stockStatus === "archived") snapshot.archivedCount += 1;
    if (row.stockStatus === "available") snapshot.availableCount += 1;
    return snapshot;
  }, {
    productCount: 0,
    stockUnits: 0,
    totalValue: 0,
    availableCount: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
    archivedCount: 0
  });
}

export function buildInventoryExportCsv(rows: SimpleInventoryRow[]) {
  const header = [
    "Product image",
    "Product name",
    "SKU",
    "Inventory status",
    "Stock quantity",
    "Category",
    "Price",
    "Inventory value",
    "Updated time"
  ];

  const lines = rows.map((row) => [
    row.productImage ?? "",
    row.productName,
    row.sku,
    inventoryStatusLabel(row.stockStatus),
    row.quantity,
    row.category,
    row.price,
    row.inventoryValue,
    row.lastUpdated ?? ""
  ].map(csvCell).join(","));

  return [header.join(","), ...lines].join("\n");
}
