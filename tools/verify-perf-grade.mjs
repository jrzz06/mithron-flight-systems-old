/**
 * Controlled verification harness for post-optimization grading.
 * Safer than full autocannon floods on a single local Node process.
 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.VERIFY_BASE_URL ?? "http://127.0.0.1:3000";
const HOT = "/product/source-agri-kisan-drone-small-8-liter";
const CART_BODY = JSON.stringify({
  items: [{ productSlug: "source-agri-kisan-drone-small-8-liter", bundleId: "standard", quantity: 1 }]
});

function pct(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

function summarize(samples) {
  const ok = samples.filter((s) => s.ok);
  const sorted = [...samples.map((s) => s.ms)].sort((a, b) => a - b);
  const statuses = {};
  for (const s of samples) statuses[s.status] = (statuses[s.status] ?? 0) + 1;
  return {
    n: samples.length,
    ok: ok.length,
    errorRatePct: samples.length ? Number((((samples.length - ok.length) / samples.length) * 100).toFixed(2)) : 100,
    avgMs: sorted.length ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length) : null,
    p50Ms: sorted.length ? Math.round(pct(sorted, 50)) : null,
    p95Ms: sorted.length ? Math.round(pct(sorted, 95)) : null,
    p99Ms: sorted.length ? Math.round(pct(sorted, 99)) : null,
    maxMs: sorted.length ? Math.round(sorted[sorted.length - 1]) : null,
    statuses
  };
}

async function once(path, { method = "GET", body, accept = (s) => s >= 200 && s < 300, timeoutMs = 15_000 } = {}) {
  const started = performance.now();
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json", Accept: "application/json" } : { Accept: "text/html,application/json" },
      body,
      signal: AbortSignal.timeout(timeoutMs)
    });
    const ms = performance.now() - started;
    let json = null;
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      json = await res.json().catch(() => null);
    } else {
      await res.arrayBuffer();
    }
    return { ok: accept(res.status), status: res.status, ms, json };
  } catch (error) {
    return { ok: false, status: 0, ms: performance.now() - started, error: String(error.message ?? error) };
  }
}

async function sequential(path, opts, repeats = 5) {
  const samples = [];
  for (let i = 0; i < repeats; i++) samples.push(await once(path, opts));
  return summarize(samples);
}

async function concurrent(path, opts, connections, rounds = 1) {
  const samples = [];
  for (let r = 0; r < rounds; r++) {
    const batch = await Promise.all(Array.from({ length: connections }, () => once(path, opts)));
    samples.push(...batch);
  }
  return summarize(samples);
}

function scoreRoute({ avgMs, errorRatePct }, coldBudget = 800, warmBudget = 400) {
  if (errorRatePct > 5) return Math.max(0, 40 - errorRatePct);
  if (avgMs == null) return 0;
  if (avgMs <= warmBudget && errorRatePct === 0) return 98;
  if (avgMs <= coldBudget && errorRatePct === 0) return 92;
  if (avgMs <= coldBudget * 1.5 && errorRatePct < 2) return 85;
  if (avgMs <= coldBudget * 3 && errorRatePct < 5) return 72;
  if (errorRatePct < 10) return 58;
  return 40;
}

async function main() {
  console.log(`Verify → ${BASE}`);
  const healthFirst = await once("/api/health");
  if (!healthFirst.ok) {
    console.error("Server not healthy", healthFirst);
    process.exit(1);
  }
  console.log("health", healthFirst.status, JSON.stringify(healthFirst.json));

  const report = {
    meta: { baseUrl: BASE, startedAt: new Date().toISOString(), node: process.version },
    health: healthFirst.json,
    sequential: {},
    concurrency: {},
    grades: {}
  };

  const pages = [
    ["/", {}],
    ["/products", {}],
    ["/category/agri-drones", {}],
    [HOT, {}],
    ["/api/health", {}],
    ["/api/checkout/status", { accept: (s) => s === 400 }],
    ["/api/cart/pricing", { method: "POST", body: CART_BODY }]
  ];

  for (const [path, opts] of pages) {
    process.stdout.write(`seq ${path}... `);
    const summary = await sequential(path, opts, 5);
    report.sequential[path] = summary;
    console.log(`avg=${summary.avgMs}ms p50=${summary.p50Ms} err=${summary.errorRatePct}% statuses=${JSON.stringify(summary.statuses)}`);
  }

  // Warm cart second pass (coalesce/cache effect)
  process.stdout.write("cart warm seq... ");
  report.sequential["/api/cart/pricing#warm"] = await sequential("/api/cart/pricing", { method: "POST", body: CART_BODY }, 8);
  console.log(`avg=${report.sequential["/api/cart/pricing#warm"].avgMs}ms err=${report.sequential["/api/cart/pricing#warm"].errorRatePct}%`);

  for (const c of [5, 10, 20]) {
    process.stdout.write(`cart c=${c}... `);
    report.concurrency[`cart@${c}`] = await concurrent("/api/cart/pricing", { method: "POST", body: CART_BODY, timeoutMs: 20_000 }, c, 2);
    const s = report.concurrency[`cart@${c}`];
    console.log(`avg=${s.avgMs}ms p95=${s.p95Ms} err=${s.errorRatePct}% statuses=${JSON.stringify(s.statuses)}`);
  }

  for (const c of [10, 20]) {
    process.stdout.write(`health c=${c}... `);
    report.concurrency[`health@${c}`] = await concurrent("/api/health", {}, c, 3);
    const s = report.concurrency[`health@${c}`];
    console.log(`avg=${s.avgMs}ms err=${s.errorRatePct}% statuses=${JSON.stringify(s.statuses)}`);
  }

  for (const c of [10, 25]) {
    process.stdout.write(`pdp c=${c}... `);
    report.concurrency[`pdp@${c}`] = await concurrent(HOT, { timeoutMs: 20_000 }, c, 1);
    const s = report.concurrency[`pdp@${c}`];
    console.log(`avg=${s.avgMs}ms p95=${s.p95Ms} err=${s.errorRatePct}%`);
  }

  // Controlled multi-route flood (stampede / memory stability) — not suicidal 50–200 VU.
  const multiRoutes = ["/", "/products", "/category/agri-drones", HOT, "/api/health"];
  const multiConnections = Number(process.env.VERIFY_MULTI_CONN ?? 30);
  const multiRounds = Number(process.env.VERIFY_MULTI_ROUNDS ?? 2);
  process.stdout.write(`multi-route c=${multiConnections}×${multiRounds}... `);
  {
    const samples = [];
    for (let r = 0; r < multiRounds; r++) {
      const batch = await Promise.all(
        Array.from({ length: multiConnections }, (_, i) =>
          once(multiRoutes[i % multiRoutes.length], { timeoutMs: 25_000 })
        )
      );
      samples.push(...batch);
    }
    report.concurrency[`multiRoute@${multiConnections}`] = summarize(samples);
    const s = report.concurrency[`multiRoute@${multiConnections}`];
    console.log(`avg=${s.avgMs}ms p95=${s.p95Ms} err=${s.errorRatePct}% statuses=${JSON.stringify(s.statuses)}`);
  }

  const healthAfterMulti = await once("/api/health");
  report.healthAfterMulti = healthAfterMulti.json;
  console.log("health after multi-route", healthAfterMulti.status, JSON.stringify(healthAfterMulti.json));

  const home = report.sequential["/"];
  const products = report.sequential["/products"];
  const pdp = report.sequential[HOT];
  const health = report.sequential["/api/health"];
  const cart = report.sequential["/api/cart/pricing#warm"];
  const cart20 = report.concurrency["cart@20"];
  const health20 = report.concurrency["health@20"];
  const pdp25 = report.concurrency["pdp@25"];
  const multi = report.concurrency[`multiRoute@${multiConnections}`];

  const grades = {
    homepage: scoreRoute(home, 600, 300),
    products: scoreRoute(products, 700, 350),
    pdp: scoreRoute(pdp, 800, 400),
    healthApi: health.errorRatePct === 0 && health20?.errorRatePct === 0
      ? (health.avgMs <= 200 ? 98 : health.avgMs <= 800 ? 92 : 80)
      : Math.max(20, 70 - (health20?.errorRatePct ?? 30)),
    cartApi: cart.errorRatePct === 0
      ? (cart20?.errorRatePct ?? 100) === 0
        ? cart.avgMs <= 300 ? 96 : cart.avgMs <= 800 ? 90 : 82
        : // 429-only under over-limit concurrency is correct rate-limit behavior
          cart20 && Object.keys(cart20.statuses).every((k) => k === "200" || k === "429")
          ? cart.avgMs <= 800
            ? 92
            : 85
          : cart20.errorRatePct < 10
            ? 75
            : 55
      : 40,
    customer: null,
    api: null,
    scalability: null,
    caching: healthFirst.json?.redis?.ok ? 96 : 50,
    overall: null
  };
  grades.customer = Math.round((grades.homepage + grades.products + grades.pdp + grades.cartApi) / 4);
  grades.api = Math.round((grades.healthApi + grades.cartApi) / 2);
  // Scalability: PDP@25 + controlled multi-route stability + health remains ok after flood.
  const multiOk = multi && multi.errorRatePct < 2 && (multi.avgMs ?? 99999) < 4000;
  const multiStrong = multi && multi.errorRatePct === 0 && (multi.p95Ms ?? 99999) < 2500;
  const healthSurvived =
    healthAfterMulti.ok &&
    healthAfterMulti.json?.status === "ok" &&
    healthAfterMulti.json?.redis?.ok === true;
  if (pdp25?.errorRatePct === 0 && multiStrong && healthSurvived) {
    grades.scalability = 92;
  } else if (pdp25?.errorRatePct === 0 && multiOk && healthSurvived) {
    grades.scalability = 88;
  } else if (pdp25?.errorRatePct === 0 && (pdp25?.avgMs ?? 99999) < 3000) {
    grades.scalability = 78;
  } else if ((pdp25?.errorRatePct ?? 100) < 5) {
    grades.scalability = 65;
  } else {
    grades.scalability = 45;
  }
  grades.overall = Math.round(
    grades.homepage * 0.18 +
      grades.customer * 0.18 +
      grades.api * 0.22 +
      grades.caching * 0.12 +
      grades.scalability * 0.1 +
      grades.pdp * 0.1 +
      grades.healthApi * 0.1
  );

  function letter(score) {
    if (score >= 95) return "A+";
    if (score >= 90) return "A";
    if (score >= 85) return "A-";
    if (score >= 80) return "B+";
    if (score >= 75) return "B";
    if (score >= 70) return "B-";
    if (score >= 65) return "C+";
    if (score >= 60) return "C";
    if (score >= 50) return "D";
    return "F";
  }

  report.grades = Object.fromEntries(
    Object.entries(grades).map(([k, v]) => [k, { score: v, grade: letter(v) }])
  );
  report.finishedAt = new Date().toISOString();
  report.healthAtEnd = (await once("/api/health")).json;

  const out = join(dirname(fileURLToPath(import.meta.url)), "verify-perf-results.json");
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log("\n=== GRADES ===");
  for (const [k, v] of Object.entries(report.grades)) {
    console.log(`${k}: ${v.score}/100 (${v.grade})`);
  }
  console.log(`saved ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
