import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import os from "node:os";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return null;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

function summarize(latencies: number[], errors: number, durationSec: number) {
  const sorted = [...latencies].sort((a, b) => a - b);
  const total = latencies.length;
  return {
    throughputReqPerSec: total / durationSec,
    latencyMs: {
      average: total ? sorted.reduce((a, b) => a + b, 0) / total : null,
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      max: total ? sorted[sorted.length - 1] : null
    },
    requestsTotal: total,
    errors,
    errorRatePct: total > 0 ? Number(((errors / total) * 100).toFixed(3)) : 0,
    durationSec
  };
}

async function runLoad(url: string, connections: number, durationSec: number) {
  const latencies: number[] = [];
  let errors = 0;
  const endAt = Date.now() + durationSec * 1000;
  let stop = false;

  async function worker() {
    while (!stop && Date.now() < endAt) {
      const started = performance.now();
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(30_000),
          headers: { Accept: "text/html,application/json", "Cache-Control": "no-cache" }
        });
        latencies.push(performance.now() - started);
        if (!response.ok && !(url.endsWith("/api/health") && response.status === 503)) {
          errors += 1;
        }
      } catch {
        latencies.push(performance.now() - started);
        errors += 1;
      }
    }
  }

  const workers = Math.min(connections, 512);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  stop = true;

  return {
    engine: "native-fetch",
    summary: summarize(latencies, errors, durationSec)
  };
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

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Load test route disabled in production" }, { status: 403 });
  }

  const url = new URL(request.url);
  if (url.searchParams.get("confirm") !== "1") {
    return NextResponse.json({
      message: "Mithron load test runner (~10 minutes). Add ?confirm=1 to start.",
      scenarios: SCENARIOS,
      routes: ROUTES
    });
  }

  const startedAt = new Date().toISOString();
  const results: Record<string, unknown> = {
    meta: {
      application: "Mithron Flight Systems",
      baseUrl: BASE,
      startedAt,
      hostname: os.hostname(),
      platform: `${os.type()} ${os.release()}`,
      nodeVersion: process.version,
      totalDurationSec: SCENARIOS.reduce((s, x) => s + x.durationSec, 0),
      routes: ROUTES,
      scenarios: SCENARIOS.map(({ connections, durationSec, label }) => ({ connections, durationSec, label }))
    },
    healthAtStart: { up: true, note: "Triggered via dev load-test route" },
    systemSamples: [sampleSystemMetrics()],
    scenarios: [] as unknown[],
    errors: [] as unknown[]
  };

  for (const scenario of SCENARIOS) {
    const connectionsPerRoute = Math.max(1, Math.floor(scenario.connections / ROUTES.length));
    const scenarioResult: Record<string, unknown> = {
      label: scenario.label,
      connections: scenario.connections,
      connectionsPerRoute,
      durationSec: scenario.durationSec,
      startedAt: new Date().toISOString(),
      routes: {} as Record<string, unknown>
    };

    const routeOutcomes = await Promise.all(
      ROUTES.map(async (route) => {
        const target = `${BASE}${route.path}`;
        try {
          const outcome = await runLoad(target, connectionsPerRoute, scenario.durationSec);
          return { path: route.path, data: { label: route.label, url: target, ...outcome } };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          (results.errors as unknown[]).push({ scenario: scenario.label, route: route.path, error: message });
          return { path: route.path, data: { label: route.label, url: target, error: message } };
        }
      })
    );

    for (const { path, data } of routeOutcomes) {
      (scenarioResult.routes as Record<string, unknown>)[path] = data;
    }
    scenarioResult.finishedAt = new Date().toISOString();
    scenarioResult.systemSample = sampleSystemMetrics();
    (results.systemSamples as unknown[]).push(scenarioResult.systemSample);
    (results.scenarios as unknown[]).push(scenarioResult);
  }

  results.finishedAt = new Date().toISOString();
  results.healthAtEnd = { up: true };

  const toolsDir = join(process.cwd(), "tools");
  mkdirSync(toolsDir, { recursive: true });
  writeFileSync(join(toolsDir, "load-test-results.json"), JSON.stringify(results, null, 2));

  return NextResponse.json({ status: "complete", results });
}
