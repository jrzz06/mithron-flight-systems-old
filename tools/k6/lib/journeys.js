import { sleep, group } from "k6";
import {
  CART_PRICING_BODY,
  HOT_SLUG,
  ROUTES,
  THINK
} from "./config.js";
import { request } from "./http.js";
import {
  browserJourneys,
  cartJourneys,
  cartPricingLatency,
  journeyFailRate,
  writePressureJourneys
} from "./metrics.js";

/**
 * 70% — Browser: homepage → catalog search API → product detail (page + slim summary).
 * Maps prompt /api/products?query=… → /api/catalog/search?q=…
 * Maps prompt /api/products/[id] → /product/:slug + /api/products/summary?slug=
 */
export function browserJourney() {
  browserJourneys.add(1);
  let failed = false;

  group("browser", () => {
    const home = request(ROUTES.home, { kind: "page", name: "home", okStatuses: [200] });
    if (!home.ok) failed = true;
    sleep(THINK.short());

    // Prefer search API (real catalog path). Accept 429 under spike from shared IP.
    const search = request(ROUTES.catalogSearch("drone"), {
      kind: "api",
      name: "catalog_search",
      okStatuses: [200, 429]
    });
    if (!search.ok) failed = true;
    sleep(THINK.medium());

    // Listing page (prompt's "product listings" — NOT /api/products)
    const listing = request(ROUTES.productsPage, {
      kind: "page",
      name: "products_page",
      okStatuses: [200]
    });
    if (!listing.ok) failed = true;
    sleep(THINK.short());

    const pdp = request(ROUTES.productPage, {
      kind: "page",
      name: "product_detail_page",
      okStatuses: [200]
    });
    if (!pdp.ok) failed = true;
    sleep(THINK.short());

    const summary = request(ROUTES.productSummary(HOT_SLUG), {
      kind: "api",
      name: "product_summary",
      okStatuses: [200, 404, 429]
    });
    if (!summary.ok) failed = true;
  });

  journeyFailRate.add(failed);
  sleep(THINK.medium());
}

/**
 * 20% — Cart users: view PDP, then POST public cart pricing (real storefront path).
 * Prompt POST /api/cart → POST /api/cart/pricing (authenticated /api/account/cart is NOT used).
 */
export function cartJourney() {
  cartJourneys.add(1);
  let failed = false;

  group("cart", () => {
    const pdp = request(ROUTES.productPage, {
      kind: "page",
      name: "cart_pdp",
      okStatuses: [200]
    });
    if (!pdp.ok) failed = true;
    sleep(THINK.short());

    const pricing = request(ROUTES.cartPricing, {
      method: "POST",
      body: CART_PRICING_BODY,
      headers: { "Content-Type": "application/json" },
      kind: "api",
      name: "cart_pricing",
      okStatuses: [200, 429],
      trend: cartPricingLatency
    });
    if (!pricing.ok) failed = true;
  });

  journeyFailRate.add(failed);
  sleep(THINK.medium());
}

/**
 * 10% — High-write / control-plane pressure WITHOUT mutating catalog or placing orders.
 *
 * Safe by default:
 * - POST /api/cart/pricing (DB read + coalesce under concurrency)
 * - GET /api/checkout/status (missing orderId → 400; proves route + rate limiter)
 * - GET /api/admin/catalog/products (expects 401 without session — auth gate under load)
 * - GET /api/health (Supabase pooler reachability proxy)
 *
 * Destructive admin PUT/POST catalog writes are intentionally omitted.
 * Set ALLOW_WRITES=1 only with a dedicated staging project + auth cookies (not implemented here).
 */
export function writePressureJourney() {
  writePressureJourneys.add(1);
  let failed = false;

  group("write_pressure_safe", () => {
    const pricing = request(ROUTES.cartPricing, {
      method: "POST",
      body: CART_PRICING_BODY,
      headers: { "Content-Type": "application/json" },
      kind: "api",
      name: "write_cart_pricing",
      okStatuses: [200, 429],
      trend: cartPricingLatency
    });
    if (!pricing.ok) failed = true;
    sleep(THINK.short());

    const checkoutDry = request(ROUTES.checkoutStatusDry, {
      kind: "api",
      name: "checkout_status_dry",
      okStatuses: [400, 429]
    });
    if (!checkoutDry.ok) failed = true;
    sleep(THINK.short());

    const adminGate = request(ROUTES.adminCatalog, {
      kind: "api",
      name: "admin_catalog_unauth",
      okStatuses: [401, 403, 429]
    });
    if (!adminGate.ok) failed = true;
    sleep(THINK.short());

    const health = request(ROUTES.health, {
      kind: "supabase_proxy",
      name: "health_supabase_proxy",
      okStatuses: [200, 503]
    });
    if (!health.ok) failed = true;
  });

  journeyFailRate.add(failed);
  sleep(THINK.long());
}

/** Light read-only pass to warm ISR pages + edge-cached APIs before SLA measurement. */
export function warmupJourney() {
  group("warmup", () => {
    request(ROUTES.home, { kind: "page", name: "warmup_home", okStatuses: [200] });
    sleep(THINK.short());
    request(ROUTES.catalogSearch("drone"), {
      kind: "api",
      name: "warmup_catalog_search",
      okStatuses: [200, 429]
    });
    sleep(THINK.short());
    request(ROUTES.productsPage, { kind: "page", name: "warmup_products", okStatuses: [200] });
    sleep(THINK.short());
    request(ROUTES.productPage, { kind: "page", name: "warmup_pdp", okStatuses: [200] });
    sleep(THINK.short());
    request(ROUTES.productSummary(HOT_SLUG), {
      kind: "api",
      name: "warmup_product_summary",
      okStatuses: [200, 404, 429]
    });
  });
  sleep(THINK.medium());
}

/** Weighted mix: 70% browser / 20% cart / 10% write-pressure */
export function weightedUserJourney() {
  const roll = Math.random();
  if (roll < 0.7) browserJourney();
  else if (roll < 0.9) cartJourney();
  else writePressureJourney();
}
