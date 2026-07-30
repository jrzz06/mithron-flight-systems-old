import { Rate, Trend, Counter } from "k6/metrics";

/** Page (SSR/HTML) end-to-end latency */
export const pageLatency = new Trend("mithron_page_latency", true);

/** JSON API end-to-end latency (Next route handlers) */
export const apiLatency = new Trend("mithron_api_latency", true);

/**
 * Best-effort Supabase/pooler proxy: /api/health pings PostgREST.
 * Not true query latency (app has no Server-Timing), but tracks DB reachability cost.
 */
export const supabaseProxyLatency = new Trend("mithron_supabase_proxy_latency", true);

/** Cart pricing POST (catalog + tax path — DB read pressure) */
export const cartPricingLatency = new Trend("mithron_cart_pricing_latency", true);

/** Journey outcome rates */
export const journeyFailRate = new Rate("mithron_journey_fail_rate");
export const rateLimited = new Counter("mithron_http_429");
export const browserJourneys = new Counter("mithron_journey_browser");
export const cartJourneys = new Counter("mithron_journey_cart");
export const writePressureJourneys = new Counter("mithron_journey_write_pressure");
