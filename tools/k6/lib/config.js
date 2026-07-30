/**
 * Shared environment & safety gates for Mithron k6 suite.
 * Prompt endpoints like /api/products do NOT exist — see ROUTES map below.
 */
export const BASE_URL = String(__ENV.BASE_URL || __ENV.LOAD_TEST_BASE_URL || "http://127.0.0.1:3000").replace(
  /\/$/,
  ""
);

/** Known catalog PDP used by existing load tooling. */
export const HOT_SLUG = __ENV.HOT_SLUG || "source-agri-kisan-drone-small-8-liter";
export const HOT_PDP = `/product/${HOT_SLUG}`;
export const CATEGORY_PATH = "/category/agri-drones";

/**
 * Real route map (verified against app/api + storefront pages).
 * Prompt → Actual
 * GET /api/products?query=drone → GET /api/catalog/search?q=drone  (rate limit ~120/min/IP)
 * GET /api/products/[id]        → GET /product/:slug  OR  /api/products/summary?slug=
 * POST /api/cart                → POST /api/cart/pricing (public pricing; account cart needs auth)
 * Admin PUT writes              → dry probes only unless ALLOW_WRITES=1 (never mutate prod catalog)
 */
export const ROUTES = {
  home: "/",
  productsPage: "/products",
  category: CATEGORY_PATH,
  productPage: HOT_PDP,
  catalogSearch: (q = "drone") => `/api/catalog/search?q=${encodeURIComponent(q)}&limit=8`,
  productSummary: (slug = HOT_SLUG) => `/api/products/summary?slug=${encodeURIComponent(slug)}`,
  health: "/api/health",
  cartPricing: "/api/cart/pricing",
  checkoutStatusDry: "/api/checkout/status",
  adminCatalog: "/api/admin/catalog/products?limit=20"
};

export const CART_PRICING_BODY = JSON.stringify({
  items: [{ productSlug: HOT_SLUG, bundleId: "standard", quantity: 1 }]
});

export const SCENARIO = String(__ENV.SCENARIO || "average").toLowerCase();
export const TARGET = String(__ENV.TARGET || "local").toLowerCase(); // local | preview | production

/** Spike / soak can exhaust Supabase pooler + Vercel — require explicit confirm. */
export function assertSafetyGates() {
  if (SCENARIO === "spike" && __ENV.CONFIRM_SPIKE !== "1") {
    throw new Error(
      'Spike test (→500 VUs) blocked. Re-run with -e CONFIRM_SPIKE=1 after you accept pooler/rate-limit risk.'
    );
  }
  if (SCENARIO === "soak" && __ENV.CONFIRM_SOAK !== "1") {
    throw new Error(
      "Soak test (50 VUs × 30m) blocked. Re-run with -e CONFIRM_SOAK=1."
    );
  }
  if (TARGET === "production" && (SCENARIO === "spike" || SCENARIO === "soak") && __ENV.CONFIRM_PRODUCTION !== "1") {
    throw new Error(
      "Refusing spike/soak against TARGET=production without -e CONFIRM_PRODUCTION=1."
    );
  }
}

export const THINK = {
  short: () => Number(__ENV.THINK_SHORT || 0.5),
  medium: () => Number(__ENV.THINK_MEDIUM || 1),
  long: () => Number(__ENV.THINK_LONG || 2)
};
