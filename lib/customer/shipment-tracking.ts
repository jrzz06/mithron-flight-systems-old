export type CustomerShipmentTracking = {
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
};

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
  if (!value) return null;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return null;
}

function readString(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

export function parseShipmentTracking(tracking: unknown): CustomerShipmentTracking | null {
  const record = parseJsonRecord(tracking);
  if (!record) return null;

  const carrier = readString(record, "carrier", "carrier_name");
  const trackingNumber = readString(record, "tracking_number", "tracking", "trackingNumber");
  const trackingUrl = readString(record, "tracking_url", "trackingUrl");

  if (!carrier && !trackingNumber && !trackingUrl) return null;

  return { carrier, trackingNumber, trackingUrl };
}
