/**
 * 10-minute load & stress test for Mithron storefront.
 * Three phases (~200s each): 100, 500, 1000 concurrent connections.
 * Uses autocannon via npx (no permanent install required).
 *
 * Extended scenarios (Phase 2):
 * - Cart pricing POST (/api/cart/pricing)
 * - Checkout dry/health checks (POST /api/checkout needs auth + cart — not hammered;
 *   GET /api/checkout/status without orderId → 400 proves the route is live)
 * - Flash-sale 80/20 weighted single hot PDP spike
 *
 * Full run against production Preview:
 *   $env:LOAD_TEST_BASE_URL="https://your-preview.vercel.app"; node tools/run-load-test.mjs
 * Local smoke (structure only): node tools/run-load-test.mjs --help
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const __dir = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dir, "load-test-results.json");
const BASE = process.env.LOAD_TEST_BASE_URL ?? "http://127.0.0.1:3000";

const HOT_PDP = "/product/source-agri-kisan-drone-small-8-liter";

/** Default storefront routes exercised under each concurrency scenario. */
const ROUTES = [
  { path: "/", label: "Homepage", method: "GET" },
  { path: "/api/health", label: "Health API", method: "GET" },
  { path: "/products", label: "Product catalog", method: "GET" },
  { path: "/category/agri-drones", label: "Category page (agri-drones)", method: "GET" },
  { path: HOT_PDP, label: "Product detail", method: "GET" },
  {
    path: "/api/cart/pricing",
    label: "Cart pricing POST",
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      items: [{ productSlug: "source-agri-kisan-drone-small-8-liter", bundleId: "standard", quantity: 1 }]
    })
  },
  {
    path: "/api/checkout/status",
    label: "Checkout status dry-check (expects 400 without orderId)",
    method: "GET",
    /**
     * POST /api/checkout requires signed-in session or guest audit token + full cart payload.
     * Do not load-test authenticated checkout POST without credentials — use this dry GET
     * (missing orderId → 400) plus /api/health to prove checkout surface availability.
     */
    acceptStatuses: [400]
  }
];

/**
 * Flash-sale spike: 80% of connections hit one hot PDP; 20% split across catalog/home.
 * Enable with LOAD_TEST_FLASH_SALE=1 or --flash-sale.
 */
const FLASH_SALE_ROUTES = [
  { path: HOT_PDP, label: "Flash hot PDP (80%)", method: "GET", weight: 0.8 },
  { path: "/products", label: "Flash catalog (10%)", method: "GET", weight: 0.1 },
  { path: "/", label: "Flash homepage (10%)", method: "GET", weight: 0.1 }
];

const SCENARIOS = [
  { connections: 100, durationSec: 200, label: "Baseline (100 concurrent users)" },
  { connections: 500, durationSec: 200, label: "Production (500 concurrent users)" },
  { connections: 1000, durationSec: 200, label: "Peak stress (1000 concurrent users)" }
];

function printHelp() {
  console.log(`Mithron load test tooling

Usage:
  node tools/run-load-test.mjs [--help] [--flash-sale] [--smoke]

Env:
  LOAD_TEST_BASE_URL          Target origin (default http://127.0.0.1:3000)
  LOAD_TEST_FLASH_SALE=1      Add flash-sale 80/20 hot-PDP scenario after main phases
  LOAD_TEST_ALLOW_DEGRADED=0  Fail if /api/health is degraded
  LOAD_TEST_SMOKE=1           One short 5s / 10-conn pass (structure smoke only)
  LOAD_TEST_QUICK=1           Three 30s phases at 50/100/200 (local before/after)

Notes:
  - Category route uses /category/agri-drones (not redirect /agriculture).
  - Cart pricing uses POST with a sample line item.
  - Checkout POST is intentionally NOT load-tested (needs auth/audit token + cart).
    Use GET /api/checkout/status dry-check + /api/health instead.
  - Full Preview run: set LOAD_TEST_BASE_URL to the Vercel Preview URL, then run this script,
    then: node tools/generate-load-test-report.mjs
`);
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

function summarizeAutocannon(raw) {
  const lat = raw.latency ?? {};
  const total = raw.requests?.total ?? 0;
  const errors = (raw.errors ?? 0) + (raw.non2xx ?? 0) + (raw.timeouts ?? 0);
  return {
    throughputReqPerSec: raw.throughput?.average ?? raw.throughput?.mean ?? null,
    latencyMs: {
      average: lat.average ?? lat.mean ?? null,
      p50: lat.p50 ?? lat.mean ?? null,
      p95: lat.p95 ?? null,
      p99: lat.p99 ?? null,
      max: lat.max ?? null
    },
    requestsTotal: total,
    errors,
    errorRatePct: total > 0 ? Number(((errors / total) * 100).toFixed(3)) : 0,
    durationSec: raw.duration ?? null,
    timeouts: raw.timeouts ?? 0,
    statusCodeDistribution: raw.statusCodeStats ?? null
  };
}

function runAutocannon(url, connections, durationSec, route = {}) {
  return new Promise((resolve, reject) => {
    const args = [
      "--yes",
      "autocannon",
      "-c",
      String(connections),
      "-d",
      String(durationSec),
      "-j"
    ];
    if (route.method && route.method !== "GET") {
      args.push("-m", route.method);
    }
    if (route.headers) {
      for (const [key, value] of Object.entries(route.headers)) {
        args.push("-H", `${key}=${value}`);
      }
    }
    if (route.body) {
      args.push("-b", route.body);
    }
    args.push(url);
    const child = spawn("npx", args, {
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `autocannon exited with code ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error(`Invalid autocannon JSON: ${stdout.slice(0, 400)}`));
      }
    });
  });
}

async function runNativeLoad(url, connections, durationSec, route = {}) {
  const latencies = [];
  let errors = 0;
  let successes = 0;
  const endAt = Date.now() + durationSec * 1000;
  let stop = false;
  const acceptStatuses = route.acceptStatuses ?? null;

  async function worker() {
    while (!stop && Date.now() < endAt) {
      const started = performance.now();
      try {
        const response = await fetch(url, {
          method: route.method ?? "GET",
          headers: {
            Accept: "text/html,application/json",
            ...(route.headers ?? {})
          },
          body: route.body,
          signal: AbortSignal.timeout(30_000)
        });
        latencies.push(performance.now() - started);
        const ok = acceptStatuses
          ? acceptStatuses.includes(response.status)
          : response.ok;
        if (ok) successes += 1;
        else errors += 1;
      } catch {
        latencies.push(performance.now() - started);
        errors += 1;
      }
    }
  }

  const workers = Array.from({ length: Math.min(connections, 256) }, () => worker());
  await Promise.all(workers);
  stop = true;

  const sorted = [...latencies].sort((a, b) => a - b);
  const total = successes + errors;
  const elapsedSec = durationSec;

  return {
    latency: {
      average: sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0,
      mean: sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0,
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      max: sorted.length ? sorted[sorted.length - 1] : 0
    },
    requests: { total },
    errors,
    non2xx: 0,
    timeouts: 0,
    throughput: { average: total / elapsedSec },
    duration: elapsedSec
  };
}

async function runLoad(url, connections, durationSec, route = {}) {
  // Routes with acceptStatuses (expected non-2xx) always use native so we can score correctly.
  if (route.acceptStatuses?.length || route.method === "POST") {
    const raw = await runNativeLoad(url, connections, durationSec, route);
    return { engine: "native-fetch", raw, summary: summarizeAutocannon(raw) };
  }
  try {
    const raw = await runAutocannon(url, connections, durationSec, route);
    return { engine: "autocannon", raw, summary: summarizeAutocannon(raw) };
  } catch (autocannonError) {
    console.warn(`autocannon failed for ${url} (${connections} conn): ${autocannonError.message}`);
    console.warn("Falling back to native fetch load generator (capped at 256 workers).");
    const raw = await runNativeLoad(url, connections, durationSec, route);
    return { engine: "native-fetch", raw, summary: summarizeAutocannon(raw), fallbackReason: autocannonError.message };
  }
}

async function checkHealth() {
  try {
    const response = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(5000) });
    const body = await response.json().catch(() => ({}));
    const healthStatus = body?.status ?? null;

    let storefrontOk = false;
    try {
      const home = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(10000) });
      storefrontOk = home.ok;
    } catch {
      storefrontOk = false;
    }

    const allowDegraded = process.env.LOAD_TEST_ALLOW_DEGRADED !== "0";
    const up = response.ok || (allowDegraded && storefrontOk && healthStatus === "degraded");

    return {
      up,
      status: response.status,
      healthStatus,
      storefrontOk,
      body,
      note: up && !response.ok ? "Proceeding with degraded health — storefront reachable" : null
    };
  } catch (error) {
    return { up: false, status: null, error: String(error.message ?? error) };
  }
}

function sampleSystemMetrics() {
  const load = os.loadavg();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  return {
    timestamp: new Date().toISOString(),
    cpuLoadAvg1m: load[0],
    cpuLoadAvg5m: load[1],
    memoryUsedMb: Number(((totalMem - freeMem) / 1024 / 1024).toFixed(1)),
    memoryTotalMb: Number((totalMem / 1024 / 1024).toFixed(1)),
    memoryUsedPct: Number((((totalMem - freeMem) / totalMem) * 100).toFixed(1))
  };
}

function allocateWeightedConnections(totalConnections, routes) {
  const weights = routes.map((r) => r.weight ?? 1 / routes.length);
  const weightSum = weights.reduce((a, b) => a + b, 0) || 1;
  return routes.map((route, index) => ({
    ...route,
    connections: Math.max(1, Math.floor((totalConnections * weights[index]) / weightSum))
  }));
}

async function runScenario(scenario, routes, results) {
  console.log(`\n=== ${scenario.label} (${scenario.durationSec}s) ===`);
  const scenarioResult = {
    label: scenario.label,
    connections: scenario.connections,
    durationSec: scenario.durationSec,
    startedAt: new Date().toISOString(),
    routes: {}
  };

  const allocated = allocateWeightedConnections(scenario.connections, routes);
  const effective = allocated.reduce((s, r) => s + r.connections, 0);
  console.log(`  (${effective} effective connections across ${allocated.length} routes)`);

  const routeOutcomes = await Promise.all(
    allocated.map(async (route) => {
      const url = `${BASE}${route.path}`;
      process.stdout.write(`  starting ${route.label} (${route.method ?? "GET"} ${route.path}, c=${route.connections})... `);
      try {
        const outcome = await runLoad(url, route.connections, scenario.durationSec, route);
        console.log(
          `done — ${outcome.summary.throughputReqPerSec?.toFixed?.(1) ?? outcome.summary.throughputReqPerSec} req/s, ` +
            `p95 ${outcome.summary.latencyMs.p95}ms, err ${outcome.summary.errorRatePct}%`
        );
        return {
          path: route.path,
          data: { label: route.label, url, method: route.method ?? "GET", connections: route.connections, ...outcome }
        };
      } catch (error) {
        const message = String(error.message ?? error);
        console.log(`FAILED — ${message}`);
        results.errors.push({ scenario: scenario.label, route: route.path, error: message });
        return { path: route.path, data: { label: route.label, url, error: message } };
      }
    })
  );
  for (const { path, data } of routeOutcomes) {
    scenarioResult.routes[path] = data;
  }

  scenarioResult.finishedAt = new Date().toISOString();
  scenarioResult.systemSample = sampleSystemMetrics();
  results.systemSamples.push(scenarioResult.systemSample);
  results.scenarios.push(scenarioResult);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  const flashSale =
    args.includes("--flash-sale") || process.env.LOAD_TEST_FLASH_SALE === "1";
  const smoke = args.includes("--smoke") || process.env.LOAD_TEST_SMOKE === "1";
  const quick = args.includes("--quick") || process.env.LOAD_TEST_QUICK === "1";

  const scenarios = smoke
    ? [{ connections: 10, durationSec: 5, label: "Smoke (10 concurrent, 5s)" }]
    : quick
      ? [
          { connections: 50, durationSec: 30, label: "Quick baseline (50 concurrent, 30s)" },
          { connections: 100, durationSec: 30, label: "Quick mid (100 concurrent, 30s)" },
          { connections: 200, durationSec: 30, label: "Quick peak (200 concurrent, 30s)" }
        ]
      : [...SCENARIOS];

  console.log(`Mithron load test → ${BASE}`);
  console.log(`Total duration: ~${scenarios.reduce((s, x) => s + x.durationSec, 0)}s across ${scenarios.length} scenarios`);
  if (flashSale) console.log("Flash-sale 80/20 hot-PDP scenario enabled after main phases.\n");
  else console.log("");

  const health = await checkHealth();
  if (!health.up) {
    console.error("Server is not reachable. Start with: npm run build && npm run start");
    console.error("Or set LOAD_TEST_BASE_URL to a Preview URL. Use --help for options.");
    process.exit(1);
  }

  const results = {
    meta: {
      application: "Mithron Flight Systems",
      baseUrl: BASE,
      startedAt: new Date().toISOString(),
      hostname: os.hostname(),
      platform: `${os.type()} ${os.release()}`,
      nodeVersion: process.version,
      totalDurationSec: scenarios.reduce((s, x) => s + x.durationSec, 0) + (flashSale ? 60 : 0),
      routes: ROUTES.map(({ path, label, method }) => ({ path, label, method: method ?? "GET" })),
      scenarios: scenarios.map(({ connections, durationSec, label }) => ({ connections, durationSec, label })),
      notes: [
        "Category route: /category/agri-drones (not /agriculture redirect).",
        "Cart pricing: POST /api/cart/pricing with sample line item.",
        "Checkout POST /api/checkout is NOT load-tested — requires auth/audit token + cart body.",
        "Checkout dry-check: GET /api/checkout/status without orderId (expects 400).",
        flashSale ? "Flash-sale scenario: 80% hot PDP / 10% catalog / 10% homepage." : null
      ].filter(Boolean)
    },
    healthAtStart: health,
    systemSamples: [sampleSystemMetrics()],
    scenarios: [],
    errors: []
  };

  for (const scenario of scenarios) {
    await runScenario(scenario, ROUTES, results);
  }

  if (flashSale) {
    await runScenario(
      {
        connections: smoke ? 20 : 500,
        durationSec: smoke ? 5 : 60,
        label: "Flash-sale spike (80% hot PDP)"
      },
      FLASH_SALE_ROUTES,
      results
    );
  }

  results.finishedAt = new Date().toISOString();
  results.healthAtEnd = await checkHealth();

  mkdirSync(__dir, { recursive: true });
  writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to ${outPath}`);
  console.log("Generate report: node tools/generate-load-test-report.mjs");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
