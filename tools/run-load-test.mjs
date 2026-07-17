/**
 * 10-minute load & stress test for Mithron storefront.
 * Three phases (~200s each): 100, 500, 1000 concurrent connections.
 * Uses autocannon via npx (no permanent install required).
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const __dir = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dir, "load-test-results.json");
const BASE = process.env.LOAD_TEST_BASE_URL ?? "http://127.0.0.1:3000";

const ROUTES = [
  { path: "/", label: "Homepage" },
  { path: "/api/health", label: "Health API" },
  { path: "/products", label: "Product catalog" },
  { path: "/agriculture", label: "Category page" },
  {
    path: "/product/source-agri-kisan-drone-small-8-liter",
    label: "Product detail"
  }
];

const SCENARIOS = [
  { connections: 100, durationSec: 200, label: "Baseline (100 concurrent users)" },
  { connections: 500, durationSec: 200, label: "Production (500 concurrent users)" },
  { connections: 1000, durationSec: 200, label: "Peak stress (1000 concurrent users)" }
];

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

function runAutocannon(url, connections, durationSec) {
  return new Promise((resolve, reject) => {
    const args = [
      "--yes",
      "autocannon",
      "-c",
      String(connections),
      "-d",
      String(durationSec),
      "-j",
      url
    ];
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

async function runNativeLoad(url, connections, durationSec) {
  const latencies = [];
  let errors = 0;
  let successes = 0;
  const endAt = Date.now() + durationSec * 1000;
  let stop = false;

  async function worker() {
    while (!stop && Date.now() < endAt) {
      const started = performance.now();
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(30_000),
          headers: { Accept: "text/html,application/json" }
        });
        latencies.push(performance.now() - started);
        if (response.ok) successes += 1;
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

async function runLoad(url, connections, durationSec) {
  try {
    const raw = await runAutocannon(url, connections, durationSec);
    return { engine: "autocannon", raw, summary: summarizeAutocannon(raw) };
  } catch (autocannonError) {
    console.warn(`autocannon failed for ${url} (${connections} conn): ${autocannonError.message}`);
    console.warn("Falling back to native fetch load generator (capped at 256 workers).");
    const raw = await runNativeLoad(url, connections, durationSec);
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

async function main() {
  console.log(`Mithron load test → ${BASE}`);
  console.log(`Total duration: ~${SCENARIOS.reduce((s, x) => s + x.durationSec, 0)}s across ${SCENARIOS.length} scenarios\n`);

  const health = await checkHealth();
  if (!health.up) {
    console.error("Server is not reachable. Start with: npm run build && npm run start");
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
      totalDurationSec: SCENARIOS.reduce((s, x) => s + x.durationSec, 0),
      routes: ROUTES,
      scenarios: SCENARIOS.map(({ connections, durationSec, label }) => ({ connections, durationSec, label }))
    },
    healthAtStart: health,
    systemSamples: [sampleSystemMetrics()],
    scenarios: [],
    errors: []
  };

  for (const scenario of SCENARIOS) {
    console.log(`\n=== ${scenario.label} (${scenario.durationSec}s) ===`);
    const scenarioResult = {
      label: scenario.label,
      connections: scenario.connections,
      durationSec: scenario.durationSec,
      startedAt: new Date().toISOString(),
      routes: {}
    };

    // Run all routes in parallel so each scenario stays at durationSec (total ~10 min).
    // Split total concurrency across routes when running in parallel.
    const connectionsPerRoute = Math.max(1, Math.floor(scenario.connections / ROUTES.length));
    console.log(`  (${connectionsPerRoute} connections per route × ${ROUTES.length} routes = ${connectionsPerRoute * ROUTES.length} effective)`);

    const routeOutcomes = await Promise.all(
      ROUTES.map(async (route) => {
        const url = `${BASE}${route.path}`;
        process.stdout.write(`  starting ${route.label} (${route.path})... `);
        try {
          const outcome = await runLoad(url, connectionsPerRoute, scenario.durationSec);
          console.log(
            `done — ${outcome.summary.throughputReqPerSec?.toFixed?.(1) ?? outcome.summary.throughputReqPerSec} req/s, ` +
              `p95 ${outcome.summary.latencyMs.p95}ms, err ${outcome.summary.errorRatePct}%`
          );
          return {
            path: route.path,
            data: { label: route.label, url, ...outcome }
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

  results.finishedAt = new Date().toISOString();
  results.healthAtEnd = await checkHealth();

  mkdirSync(__dir, { recursive: true });
  writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
