/**
 * Safe, low-impact k6 smoke load test for Mithron (Next.js + Supabase).
 *
 * Why these routes (project-verified):
 * - GET /                     → storefront homepage (app/(storefront)/page.tsx)
 * - GET /products             → product listings page (NOT /api/products — that route does not exist)
 * - GET /category/agri-drones → real category slug used by existing load tooling
 * - GET /product/<hot-slug>   → known catalog PDP
 * - GET /api/health           → shallow public probe (200 ok / 503 degraded)
 *
 * Intentionally NOT tested (unsafe or wrong):
 * - /api/products             → does not exist (would flood 404s)
 * - /api/catalog/search       → Redis rate limit ~120/min/IP (25 VUs would trip 429s)
 * - /api/products/summary     → Redis rate limit ~60/min/IP
 * - POST /api/checkout, auth, admin, upload, payments → side effects / secrets
 *
 * Free-tier-friendly profile: peak 25 VUs (<30), ~45s total, sleep(1) think-time.
 *
 * Run:
 *   k6 run tools/k6/safe-storefront-smoke.js
 *   k6 run -e BASE_URL=https://your-preview.vercel.app tools/k6/safe-storefront-smoke.js
 *   npm run test:load:k6
 */
import http from "k6/http";
import { check, group, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE_URL = String(__ENV.BASE_URL || __ENV.LOAD_TEST_BASE_URL || "http://127.0.0.1:3000").replace(
  /\/$/,
  ""
);

const HOT_PDP = "/product/source-agri-kisan-drone-small-8-liter";

const routeFailRate = new Rate("mithron_route_fail_rate");
const homepageTrend = new Trend("mithron_homepage_ms", true);
const productsTrend = new Trend("mithron_products_ms", true);

export const options = {
  // Soft ceiling: never schedule above 30 VUs.
  stages: [
    { duration: "10s", target: 10 }, // Stage 1: ramp to 10
    { duration: "25s", target: 25 }, // Stage 2: steady at 25
    { duration: "10s", target: 0 } // Stage 3: ramp down
  ],
  thresholds: {
    // User-requested SLOs
    http_req_duration: ["p(95)<800"],
    http_req_failed: ["rate<0.02"],
    // Custom: business checks (status + content), not only transport
    mithron_route_fail_rate: ["rate<0.02"],
    checks: ["rate>0.98"]
  },
  // Keep browser-like headers without downloading huge media trees via HTML only.
  userAgent: "mithron-k6-safe-smoke/1.0",
  insecureSkipTLSVerify: false,
  noConnectionReuse: false,
  discardResponseBodies: false
};

function hit(path, { okStatuses = [200], label, trend } = {}) {
  const url = `${BASE_URL}${path}`;
  const res = http.get(url, {
    tags: { name: label || path, endpoint: path },
    headers: {
      Accept: "text/html,application/json;q=0.9,*/*;q=0.8",
      "Cache-Control": "no-cache"
    },
    // Treat expected statuses as non-failed for http_req_failed (e.g. health 503).
    responseCallback: http.expectedStatuses(...okStatuses)
  });

  if (trend) trend.add(res.timings.duration);

  const ok = check(res, {
    [`${label || path} status ok`]: (r) => okStatuses.includes(r.status),
    [`${label || path} body non-empty`]: (r) => (r.body || "").length > 0
  });

  routeFailRate.add(!ok);
  return res;
}

export default function () {
  group("storefront read path", () => {
    // Homepage
    hit("/", { label: "homepage", trend: homepageTrend });
    sleep(1);

    // Product listings (page route — correct replacement for fictional /api/products)
    hit("/products", { label: "products_catalog", trend: productsTrend });
    sleep(1);

    // Category listing (canonical slug from tools/run-load-test.mjs)
    hit("/category/agri-drones", { label: "category_agri_drones" });
    sleep(1);

    // Product detail
    hit(HOT_PDP, { label: "product_detail" });
    sleep(1);

    // Lightweight dependency probe — allow degraded (503) without counting as http failure
    hit("/api/health", { label: "health_api", okStatuses: [200, 503] });
    sleep(1);
  });
}

export function handleSummary(data) {
  const p95 = data.metrics.http_req_duration?.values?.["p(95)"];
  const failRate = data.metrics.http_req_failed?.values?.rate;
  const lines = [
    "Mithron safe k6 storefront smoke",
    `BASE_URL=${BASE_URL}`,
    `http_req_duration p95=${p95 != null ? `${p95.toFixed(1)}ms` : "n/a"} (threshold <800ms)`,
    `http_req_failed=${failRate != null ? (failRate * 100).toFixed(2) + "%" : "n/a"} (threshold <2%)`,
    "Routes: /, /products, /category/agri-drones, hot PDP, /api/health",
    "Skipped: /api/products (missing), catalog search & summary APIs (rate limits), checkout/auth/admin"
  ];
  return {
    stdout: `\n${lines.join("\n")}\n`
  };
}
