import { sanitizeProductPreviewText } from "./product-preview-text.ts";
import { isMeasurableTechnicalValue, isPollutedSpecEntry } from "./wix/semantic-content-parser.ts";

const SPEC_TOKEN_PATTERN = /(?:UAV Type|UAV Category|Endurance|Range|Maximum|Operating|Wind Resistance|All-Up-Weight|Payload|Battery|Flight Time)/i;

const KNOWN_SPEC_LABELS = [
  "Operating Altitude",
  "Maximum Operating Altitude",
  "Maximum All-Up-Weight",
  "Maximum Takeoff Weight",
  "Wind Resistance",
  "Maximum Speed",
  "Range (LoS)",
  "Range",
  "Endurance",
  "UAV Category",
  "UAV Type",
  "Payload Capacity",
  "Payload",
  "Battery Cell Configuration",
  "Battery Charging Time",
  "Battery Capacity",
  "Nominal Capacity (mAh)",
  "Nominal Voltage (V)",
  "Battery",
  "Flight Time",
  "Model",
  "Brand",
  "Dimensions",
  "Weight",
  "Material",
  "Operating Voltage",
  "Power Consumption",
  "Compatibility",
  "Operating Temperature",
  "Working Temperature",
  "Protection Rating",
  "IP Rating",
  "Warranty",
  "Country of Origin",
  "Certifications",
  "Storage",
  "Camera",
  "Sensor",
  "Resolution",
  "Transmission Range",
  "Max Transmission Range",
  "Spray Tank",
  "Liquid Spray Tank",
  "Spreader Tank",
  "Spreader Tank Capacity",
  "Spreader Radius",
  "Spray Swath",
  "Spray Width",
  "Nozzles",
  "Tank Capacity",
  "Input Voltage",
  "Discharge",
  "Shipping Weight",
  "Shipping Dimensions"
];

const SPEC_DISPLAY_ORDER = [
  "Model",
  "Brand",
  "Dimensions",
  "Weight",
  "Material",
  "Operating Voltage",
  "Power Consumption",
  "Compatibility",
  "Operating Temperature",
  "Working Temperature",
  "Protection Rating",
  "IP Rating",
  "Warranty",
  "Country of Origin",
  "Certifications",
  "UAV Type",
  "UAV Category",
  "Endurance",
  "Range (LoS)",
  "Range",
  "Maximum All-Up-Weight",
  "Maximum Takeoff Weight",
  "Wind Resistance",
  "Maximum Speed",
  "Operating Altitude",
  "Maximum Operating Altitude",
  "Payload Capacity",
  "Payload",
  "Battery Capacity",
  "Battery Cell Configuration",
  "Battery Charging Time",
  "Nominal Capacity (mAh)",
  "Nominal Voltage (V)",
  "Battery",
  "Flight Time",
  "Spray Tank",
  "Liquid Spray Tank",
  "Spreader Tank",
  "Spreader Tank Capacity",
  "Spreader Radius",
  "Spray Swath",
  "Spray Width",
  "Nozzles",
  "Tank Capacity",
  "Storage",
  "Camera",
  "Sensor",
  "Resolution",
  "Transmission Range",
  "Max Transmission Range",
  "Input Voltage",
  "Discharge",
  "Shipping Weight",
  "Shipping Dimensions"
];

function stripTrailingColon(label: string) {
  return label.trim().replace(/:\s*$/, "");
}

export function canonicalSpecLabel(label: string) {
  const cleaned = stripTrailingColon(label);
  const match = KNOWN_SPEC_LABELS.find((known) => known.toLowerCase() === cleaned.toLowerCase());
  return match ?? cleaned;
}

/**
 * Canonicalizes a stored specs record: collapses stray corrupted keys (trailing
 * colons, mismatched case) into their canonical label, keeping whichever value
 * looks more complete on collision, and strips trailing numbered-list noise
 * from every value. Keys in `preserveKeys` (e.g. internal bookkeeping fields
 * like "Source"/"Currency") are copied through unchanged.
 */
export function canonicalizeSpecRecord(
  specs: Record<string, string>,
  options?: { preserveKeys?: Set<string> }
) {
  const preserveKeys = options?.preserveKeys ?? new Set<string>();
  const canonicalized: Record<string, string> = {};

  for (const [rawKey, rawValue] of Object.entries(specs)) {
    if (preserveKeys.has(rawKey)) {
      canonicalized[rawKey] = rawValue;
      continue;
    }

    const key = canonicalSpecLabel(rawKey);
    const value = stripTrailingListNoise(String(rawValue ?? "").trim());
    if (!key || !value) continue;

    const existing = canonicalized[key];
    if (!existing || existing.length < value.length) {
      canonicalized[key] = value;
    }
  }

  return canonicalized;
}

function insertKnownSpecBoundaries(text: string) {
  let normalized = text;
  const labels = [...KNOWN_SPEC_LABELS].sort((left, right) => right.length - left.length);

  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    normalized = normalized.replace(new RegExp(`([a-z0-9)])(?=${escaped}:)`, "i"), "$1 ");
  }

  return normalized.replace(/\s+/g, " ").trim();
}

function parseGenericSpecPairs(normalized: string) {
  const pattern = /(?:^|[\n\r]+|(?<=[.!?]\s)|(?<=\s)(?=\d+(?:\.\d+)?\s*[KMG]?))((?:\d+(?:\.\d+)?\s*[KMG]?(?:\s+|(?=[A-Za-z]))?)?[A-Za-z][^\n:.]{1,40}?):\s*/g;
  const matches = [...normalized.matchAll(pattern)];
  if (matches.length < 2) return {};

  const pairs: Record<string, string> = {};
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const key = canonicalSpecLabel(match[1] ?? "");
    if (!key) continue;

    const start = (match.index ?? 0) + match[0].length;
    const end = index + 1 < matches.length ? (matches[index + 1].index ?? normalized.length) : normalized.length;
    const value = stripTrailingListNoise(normalized.slice(start, end).trim());
    if (value && !isPollutedSpecEntry(key, value)) pairs[key] = value;
  }

  return pairs;
}

export function formatAvailability(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "In stock";
  if (/^instock$/i.test(trimmed.replace(/\s+/g, ""))) return "In stock";
  if (/^outofstock$/i.test(trimmed.replace(/\s+/g, ""))) return "Out of stock";
  return trimmed;
}

export function isSpecLikeBlob(text: string) {
  const clean = sanitizeProductPreviewText(text);
  if (!clean) return false;

  const colonMatches = clean.match(/[A-Za-z][A-Za-z0-9\s\-\/\(\)]{0,48}:\s*/g) ?? [];
  if (colonMatches.length >= 3) return true;
  if (SPEC_TOKEN_PATTERN.test(clean) && colonMatches.length >= 2) return true;

  const dashMatches =
    clean.match(/\b(?:UAV|Endurance|Range|Maximum|Operating|Payload|Battery|Weight|Dimensions|Flight|Wind)[^\n–-]{0,40}[-–]/g) ?? [];
  if (dashMatches.length >= 2) return true;

  return false;
}

export function parseInlineSpecPairs(text: string, options?: { knownLabelsOnly?: boolean }) {
  const normalized = insertKnownSpecBoundaries(sanitizeProductPreviewText(text));
  if (!normalized) return {};

  const labels = [...KNOWN_SPEC_LABELS].sort((left, right) => right.length - left.length);
  const pattern = new RegExp(
    `(${labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}):\\s*`,
    "gi"
  );

  const matches = [...normalized.matchAll(pattern)];
  if (!matches.length) return options?.knownLabelsOnly ? {} : parseGenericSpecPairs(normalized);

  const pairs: Record<string, string> = {};
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const key = canonicalSpecLabel(match[1] ?? "");
    if (!key) continue;

    const start = (match.index ?? 0) + match[0].length;
    const end = index + 1 < matches.length ? (matches[index + 1].index ?? normalized.length) : normalized.length;
    const value = stripTrailingListNoise(normalized.slice(start, end).trim());
    if (value) pairs[key] = value;
  }

  if (Object.keys(pairs).length) return pairs;
  return options?.knownLabelsOnly ? {} : parseGenericSpecPairs(normalized);
}

export function sortSpecEntries(entries: Array<[string, string]>) {
  const rank = (key: string) => {
    const normalized = key.trim().toLowerCase();
    const ordered = SPEC_DISPLAY_ORDER.findIndex((item) => item.toLowerCase() === normalized);
    return ordered >= 0 ? ordered : SPEC_DISPLAY_ORDER.length + normalized.charCodeAt(0);
  };

  return [...entries].sort(([leftKey], [rightKey]) => rank(leftKey) - rank(rightKey));
}

const HIGHLIGHT_VALUE_MAX = 56;

function dedupeSpecEntries(entries: Array<[string, string]>) {
  const seen = new Map<string, string>();
  for (const [key, value] of entries) {
    const normalizedKey = canonicalSpecLabel(key);
    const trimmedValue = value.trim();
    if (!normalizedKey || !trimmedValue) continue;
    if (!seen.has(normalizedKey) || seen.get(normalizedKey)!.length < trimmedValue.length) {
      seen.set(normalizedKey, trimmedValue);
    }
  }
  return [...seen.entries()];
}

function stripTrailingListNoise(value: string) {
  return value
    .replace(/\)\s*\d+\.?\s*$/, ")")
    .replace(/(?<=[a-z%\])])\s+\d+\.\s*$/i, "")
    .trim();
}

function extractBatteryMetric(text: string): string | null {
  const labeled = text.match(/\bBattery(?:\s*Capacity)?\s*[:\-–]\s*([\d][\d,.]*\s*(?:mAh|Ah|Wh)\b[^\n,.;]{0,24})/i);
  if (labeled?.[1]) return stripTrailingListNoise(labeled[1]);

  const valueThenLabel = text.match(/([\d][\d,.]*\s*(?:mAh|Ah|Wh)\s*(?:Li-?Ion|LiPo|Lithium(?:-Ion)?)?)\s*Battery\b/i);
  if (valueThenLabel?.[1]) return stripTrailingListNoise(valueThenLabel[1]);

  const multiCell = text.match(/(\d+\s*x\s*\d+\s*mAh(?:\s*batteries?)?)/i);
  if (multiCell?.[1]) return stripTrailingListNoise(multiCell[1]);

  return null;
}

function extractLeadingMetrics(text: string): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  const flightTime = text.match(/\b(\d+\s*mins?)\b/i);
  if (flightTime) pairs.push(["Flight Time", flightTime[1]]);
  const speed = text.match(/(?:speeds? up to|up to)\s*(\d+(?:\.\d+)?\s*km\/h)/i);
  if (speed) pairs.push(["Maximum Speed", speed[1]]);
  const battery = extractBatteryMetric(text);
  if (battery) pairs.push(["Battery", battery]);
  const storage = text.match(/(\d+\s*GB\s*SD(?:\s*slot)?)/i);
  if (storage) pairs.push(["Storage", storage[1]]);
  const warranty = text.match(/(\d+[\s-]*Year(?:s)?\s+Warranty)/i);
  if (warranty) pairs.push(["Warranty", warranty[1]]);
  return pairs;
}

function shouldExpandSpecValue(value: string) {
  const trimmed = value.trim();
  return trimmed.length > HIGHLIGHT_VALUE_MAX || isSpecLikeBlob(trimmed);
}

function isKnownSpecLabel(label: string) {
  const normalized = label.trim().toLowerCase();
  return KNOWN_SPEC_LABELS.some((known) => known.toLowerCase() === normalized);
}

export function expandSpecEntries(entries: Array<[string, string]>) {
  const expanded: Array<[string, string]> = [];

  for (const [key, rawValue] of entries) {
    const value = sanitizeProductPreviewText(rawValue).trim();
    if (!value) continue;

    if (isKnownSpecLabel(key) && isSpecLikeBlob(value)) {
      const metrics = extractLeadingMetrics(value).filter(
        ([label, metricValue]) => isKnownSpecLabel(label) || isMeasurableTechnicalValue(metricValue)
      );
      if (metrics.length) {
        expanded.push(...metrics);
        continue;
      }
    }

    if (isPollutedSpecEntry(key, value)) continue;

    const inline = parseInlineSpecPairs(value);
    const inlineEntries = Object.entries(inline).filter(([label, labelValue]) => !isPollutedSpecEntry(label, labelValue));
    if (inlineEntries.length >= 2 && inlineEntries.every(([label]) => isKnownSpecLabel(label))) {
      expanded.push(...inlineEntries);
      continue;
    }

    if (shouldExpandSpecValue(value) && isSpecLikeBlob(value)) {
      const metrics = extractLeadingMetrics(value).filter(
        ([label, metricValue]) => isKnownSpecLabel(label) || isMeasurableTechnicalValue(metricValue)
      );
      if (metrics.length) {
        expanded.push(...metrics);
        continue;
      }
    }

    if (isKnownSpecLabel(key) && isMeasurableTechnicalValue(value)) {
      expanded.push([canonicalSpecLabel(key), stripTrailingListNoise(value)]);
      continue;
    }

    if (isMeasurableTechnicalValue(value) && value.length <= HIGHLIGHT_VALUE_MAX) {
      expanded.push([canonicalSpecLabel(key), stripTrailingListNoise(value)]);
    }
  }

  return dedupeSpecEntries(expanded);
}

export function isHighlightSpecValue(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= HIGHLIGHT_VALUE_MAX;
}
