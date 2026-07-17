import { ENTERPRISE_STAGE_LABELS, resolveEnterpriseStage } from "@/lib/orders/lifecycle";
import type { OrderTimelineEntry } from "@/services/orders";

export type CustomerTimelineEntry = {
  at: string;
  label: string;
  detail: string | null;
  kind: "enquiry" | "contact" | "order" | "payment";
};

type TimelineSource = Record<string, unknown>;

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function parseEnquiryTimeline(payload: unknown, createdAt?: unknown): CustomerTimelineEntry[] {
  const record = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
  const result: CustomerTimelineEntry[] = [{
    at: text(createdAt, new Date(0).toISOString()),
    label: "Enquiry submitted",
    detail: null,
    kind: "enquiry"
  }];
  for (const entry of readArray(record.timeline)) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const action = text(row.action, text(row.event));
    const label = action === "converted" ? "Converted to order" : action === "contacted" || action === "qualified" ? "Under review" : action || "Update";
    result.push({ at: text(row.at, new Date().toISOString()), label, detail: text(row.summary, text(row.note)) || null, kind: "enquiry" });
  }
  return result;
}

function parseOrderTimeline(order: TimelineSource): CustomerTimelineEntry[] {
  const timeline = readArray(order.timeline) as OrderTimelineEntry[];
  if (!timeline.length) {
    return [{ at: text(order.created_at, new Date().toISOString()), label: ENTERPRISE_STAGE_LABELS[resolveEnterpriseStage(order)], detail: null, kind: "order" }];
  }
  return timeline.map((entry) => ({
    at: text(entry.at, new Date().toISOString()),
    label: ENTERPRISE_STAGE_LABELS[resolveEnterpriseStage({ ...order, status: entry.status || order.status })],
    detail: entry.note ?? (text(entry.event) || null),
    kind: entry.event?.toLowerCase().includes("payment") ? "payment" : "order"
  }));
}

export function buildCustomerTimeline(input: {
  enquiry?: TimelineSource | null;
  contactRequest?: TimelineSource | null;
  order?: TimelineSource | null;
}): CustomerTimelineEntry[] {
  const entries: CustomerTimelineEntry[] = [];
  if (input.enquiry) entries.push(...parseEnquiryTimeline(input.enquiry.payload ?? input.enquiry, input.enquiry.created_at));
  if (input.contactRequest) {
    entries.push({ at: text(input.contactRequest.created_at, new Date().toISOString()), label: "Consultation request submitted", detail: text(input.contactRequest.subject), kind: "contact" });
    const payload = input.contactRequest.payload;
    const payloadRecord = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
    for (const entry of readArray(payloadRecord.timeline)) {
      if (!entry || typeof entry !== "object") continue;
      const row = entry as Record<string, unknown>;
      entries.push({ at: text(row.at, new Date().toISOString()), label: text(row.action) === "converted" ? "Converted to order" : "Under review", detail: text(row.summary) || null, kind: "contact" });
    }
  }
  if (input.order) entries.push(...parseOrderTimeline(input.order));
  return entries.filter((entry) => entry.at).sort((left, right) => new Date(left.at).getTime() - new Date(right.at).getTime());
}
