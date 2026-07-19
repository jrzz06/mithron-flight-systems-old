/**
 * HTTP latency baseline for storefront + key APIs.
 * Usage: node tools/measure-action-baseline.mjs
 * Env: BASE_URL (default http://localhost:3000), PROD_URL for production HEAD pass
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { performance } from "node:perf_hooks";

const BASE_URL = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const PROD_URL = (process.env.PROD_URL || "https://final-mithron-deploy.vercel.app").replace(/\/$/, "");
const RUNS = Number(process.env.PERF_RUNS || 3);

const LOCAL_ROUTES = [
  { panel: "customer", action: "homepage_load", method: "GET", path: "/" },
  { panel: "customer", action: "plp_load", method: "GET", path: "/products" },
  { panel: "customer", action: "category_plp_load", method: "GET", path: "/category/agri-drones" },
  { panel: "customer", action: "pdp_load", method: "GET", path: "/product/agrione-x1" },
  { panel: "customer", action: "checkout_page_load", method: "GET", path: "/checkout" },
  { panel: "customer", action: "cart_page_load", method: "GET", path: "/cart" },
  { panel: "customer", action: "contact_page_load", method: "GET", path: "/contact" },
  { panel: "customer", action: "login_page_load", method: "GET", path: "/login" },
  { panel: "customer", action: "search_index", method: "GET", path: "/api/catalog/search?intent=index" },
  { panel: "customer", action: "search_query", method: "GET", path: "/api/catalog/search?q=drone&limit=24" },
  { panel: "customer", action: "cart_pricing", method: "POST", path: "/api/cart/pricing", body: { items: [] } },
  { panel: "customer", action: "health", method: "GET", path: "/api/health" },
  { panel: "admin", action: "admin_dashboard_load", method: "GET", path: "/admin" },
  { panel: "admin", action: "admin_orders_load", method: "GET", path: "/admin/orders" },
  { panel: "admin", action: "admin_leads_load", method: "GET", path: "/admin/leads" },
  { panel: "admin", action: "admin_products_load", method: "GET", path: "/admin/products" },
  { panel: "warehouse", action: "warehouse_fulfillment_load", method: "GET", path: "/warehouse/fulfillment" },
  { panel: "warehouse", action: "warehouse_orders_load", method: "GET", path: "/warehouse/orders" },
  { panel: "supplier", action: "supplier_home_load", method: "GET", path: "/supplier" },
  { panel: "supplier", action: "supplier_products_load", method: "GET", path: "/supplier/products" }
];

const PROD_HEAD_ROUTES = [
  { action: "homepage_head", path: "/" },
  { action: "plp_head", path: "/products" },
  { action: "category_head", path: "/category/agri-drones" },
  { action: "pdp_head", path: "/product/agrione-x1" }
];

function percentile(values, p) {
  if (!values.length) return -1;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

async function timeRequest(base, route) {
  const url = `${base}${route.path}`;
  const started = performance.now();
  let status = 0;
  let ok = false;
  let error = null;
  try {
    const init = {
      method: route.method || "GET",
      redirect: "manual",
      headers: { Accept: "text/html,application/json" }
    };
    if (route.body) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(route.body);
    }
    if (route.method === "HEAD") {
      init.method = "HEAD";
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    const res = await fetch(url, { ...init, signal: controller.signal });
    clearTimeout(timer);
    status = res.status;
    // Consume body for fair timing (except HEAD)
    if (route.method !== "HEAD") {
      await res.arrayBuffer();
    }
    ok = status > 0 && status < 500;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    ok = false;
  }
  const ms = Math.round(performance.now() - started);
  return { ms, status, ok, error, hung: Boolean(error && /abort/i.test(error)) };
}

async function measureRoute(base, route, runs = RUNS) {
  const samples = [];
  for (let i = 0; i < runs; i += 1) {
    samples.push(await timeRequest(base, route));
  }
  const times = samples.map((s) => s.ms);
  const hung = samples.some((s) => s.hung);
  const ok = samples.every((s) => s.ok);
  return {
    panel: route.panel || "customer",
    action: route.action,
    path: route.path,
    avgMs: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
    p95Ms: percentile(times, 0.95),
    minMs: Math.min(...times),
    maxMs: Math.max(...times),
    statuses: samples.map((s) => s.status),
    hung,
    ok,
    errors: samples.map((s) => s.error).filter(Boolean)
  };
}

function budgetFor(action) {
  if (/search/.test(action)) return 200;
  if (/cart_pricing|add_to_cart/.test(action)) return 500;
  if (/checkout_submit/.test(action)) return 1500;
  if (/login/.test(action)) return 800;
  if (/_load|_head|dashboard|orders|leads|products|fulfillment/.test(action)) return 1000;
  return 2000;
}

async function main() {
  console.log(`Measuring local baseline against ${BASE_URL} (${RUNS} runs)...`);
  const local = [];
  for (const route of LOCAL_ROUTES) {
    process.stdout.write(`  ${route.action}... `);
    const row = await measureRoute(BASE_URL, route);
    local.push(row);
    console.log(`${row.avgMs}ms avg / ${row.p95Ms}ms p95 status=${row.statuses.join(",")} hung=${row.hung}`);
  }

  console.log(`\nMeasuring production HEAD against ${PROD_URL}...`);
  const prod = [];
  for (const route of PROD_HEAD_ROUTES) {
    process.stdout.write(`  ${route.action}... `);
    const row = await measureRoute(PROD_URL, { ...route, panel: "customer", method: "HEAD" }, RUNS);
    prod.push(row);
    console.log(`${row.avgMs}ms avg / ${row.p95Ms}ms p95`);
  }

  const payload = {
    capturedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    prodUrl: PROD_URL,
    runs: RUNS,
    local,
    prod
  };

  mkdirSync("docs", { recursive: true });
  writeFileSync("docs/perf-action-baseline-2026-07-18.json", JSON.stringify(payload, null, 2));

  const lines = [
    "# Performance action baseline — 2026-07-18",
    "",
    `Captured: ${payload.capturedAt}`,
    `Local base: \`${BASE_URL}\` (${RUNS} runs)`,
    `Production: \`${PROD_URL}\` (HEAD)`,
    "",
    "## Local interactive / page loads",
    "",
    "| Action | Panel | avg ms | p95 ms | hung? | meets budget? | notes |",
    "| --- | --- | ---: | ---: | --- | --- | --- |"
  ];

  for (const row of local) {
    const budget = budgetFor(row.action);
    const meets = !row.hung && row.avgMs <= budget && row.ok;
    const notes = [
      `status=${row.statuses.join("/")}`,
      row.errors.length ? `errors=${row.errors.join("; ")}` : null,
      `budget=${budget}ms`,
      row.ok ? null : "non-2xx/error (auth redirect expected for panels)"
    ]
      .filter(Boolean)
      .join("; ");
    lines.push(
      `| ${row.action} | ${row.panel} | ${row.avgMs} | ${row.p95Ms} | ${row.hung ? "yes" : "no"} | ${meets ? "Y" : "N"} | ${notes} |`
    );
  }

  lines.push("", "## Production HEAD (TTFB proxy)", "", "| Action | avg ms | p95 ms | hung? |", "| --- | ---: | ---: | --- |");
  for (const row of prod) {
    lines.push(`| ${row.action} | ${row.avgMs} | ${row.p95Ms} | ${row.hung ? "yes" : "no"} |`);
  }

  lines.push(
    "",
    "## Method notes",
    "",
    "- Page loads measured as full GET body download (not browser paint).",
    "- Admin/warehouse/supplier GETs may 302 to login without credentials — treat as redirect latency, not panel SSR.",
    "- Mutation timings (ATC, save, dispatch) require Playwright with auth; see `tests/e2e/action-perf-matrix.spec.ts`.",
    "- Hard hang = request aborted at 30s.",
    ""
  );

  writeFileSync("docs/perf-action-baseline-2026-07-18.md", lines.join("\n"));
  console.log("\nWrote docs/perf-action-baseline-2026-07-18.md and .json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
