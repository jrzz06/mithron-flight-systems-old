import { retryAsync } from "@/lib/retry";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type JsonRecord = Record<string, JsonValue>;

export type ObservabilityDeliveryState = "VERIFIED" | "FALLBACK" | "FAILED";

type BaseObservabilityEvent = {
  id: string;
  timestamp: string;
  route: string;
  deliveryState: ObservabilityDeliveryState;
};

export type AnalyticsEvent = BaseObservabilityEvent & {
  type: "analytics";
  name: string;
  properties: JsonRecord;
};

export type ClientErrorEvent = BaseObservabilityEvent & {
  type: "client-error";
  name: string;
  message: string;
  digest?: string;
  stack?: string;
};

export type WebVitalEvent = BaseObservabilityEvent & {
  type: "web-vital";
  name: string;
  value: number;
  rating?: string;
};

type ObservabilityEvent = AnalyticsEvent | ClientErrorEvent | WebVitalEvent;

type ClientErrorInput = {
  name?: string;
  message: string;
  digest?: string;
  stack?: string;
  route?: string;
};

type WebVitalInput = {
  name: string;
  value: number;
  rating?: string;
};

const maxQueueLength = 50;
const fallbackEventName = "mithron:observability-fallback";
const deliveryEndpoint = process.env.NEXT_PUBLIC_OBSERVABILITY_ENDPOINT?.trim() || "";
const observabilityQueue: ObservabilityEvent[] = [];

function eventId(prefix: string) {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${randomPart}`;
}

function currentRoute() {
  if (typeof window === "undefined") return "server";
  return `${window.location.pathname}${window.location.search}`;
}

function sanitizeJsonValue(value: unknown, depth = 0): JsonValue {
  if (depth > 3) return "[truncated]";
  if (value === null) return null;
  if (typeof value === "string") return value.slice(0, 500);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeJsonValue(item, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 30)
        .map(([key, nested]) => [key, sanitizeJsonValue(nested, depth + 1)])
    );
  }
  return String(value);
}

function sanitizeProperties(properties: Record<string, unknown> = {}): JsonRecord {
  return sanitizeJsonValue(properties) as JsonRecord;
}

function enqueue(event: ObservabilityEvent) {
  observabilityQueue.push(event);
  if (observabilityQueue.length > maxQueueLength) {
    observabilityQueue.splice(0, observabilityQueue.length - maxQueueLength);
  }
}

function dispatchFallback(events: ObservabilityEvent[]) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(fallbackEventName, { detail: { events } }));
}

function deliver(events: ObservabilityEvent[]): ObservabilityDeliveryState {
  if (!events.length) return "VERIFIED";
  if (!deliveryEndpoint || typeof window === "undefined") {
    dispatchFallback(events);
    return "FALLBACK";
  }

  const body = JSON.stringify({ events });

  try {
    if (navigator.sendBeacon) {
      const sent = navigator.sendBeacon(deliveryEndpoint, new Blob([body], { type: "application/json" }));
      return sent ? "VERIFIED" : "FAILED";
    }
  } catch {
    return "FAILED";
  }

  void retryAsync(
    async () => {
      const response = await fetch(deliveryEndpoint, {
        method: "POST",
        body,
        keepalive: true,
        headers: {
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        throw new Error(`Observability delivery failed with HTTP ${response.status}.`);
      }
    },
    {
      attempts: 2,
      delayMs: 200,
      onRetry: () => {
        dispatchFallback(events.map((event) => ({ ...event, deliveryState: "FALLBACK" })));
      }
    }
  ).catch(() => {
    dispatchFallback(events.map((event) => ({ ...event, deliveryState: "FAILED" })));
  });

  return "VERIFIED";
}

export function recordAnalyticsEvent(name: string, properties: Record<string, unknown> = {}, route = currentRoute()) {
  const event: AnalyticsEvent = {
    id: eventId("analytics"),
    timestamp: new Date().toISOString(),
    route,
    deliveryState: deliveryEndpoint ? "VERIFIED" : "FALLBACK",
    type: "analytics",
    name,
    properties: sanitizeProperties(properties)
  };
  enqueue(event);
  return event;
}

export function recordClientError(input: ClientErrorInput) {
  const event: ClientErrorEvent = {
    id: eventId("client-error"),
    timestamp: new Date().toISOString(),
    route: input.route ?? currentRoute(),
    deliveryState: deliveryEndpoint ? "VERIFIED" : "FALLBACK",
    type: "client-error",
    name: input.name ?? "ClientError",
    message: input.message.slice(0, 1000),
    digest: input.digest,
    stack: input.stack?.slice(0, 4000)
  };
  enqueue(event);
  return event;
}

export function recordWebVital(metric: WebVitalInput) {
  const event: WebVitalEvent = {
    id: eventId("web-vital"),
    timestamp: new Date().toISOString(),
    route: currentRoute(),
    deliveryState: deliveryEndpoint ? "VERIFIED" : "FALLBACK",
    type: "web-vital",
    name: metric.name,
    value: metric.value,
    rating: metric.rating
  };
  enqueue(event);
  return event;
}

export function flushObservabilityQueue() {
  const events = observabilityQueue.splice(0, observabilityQueue.length);
  return deliver(events);
}

export function getObservabilityQueueSnapshot() {
  return [...observabilityQueue];
}
