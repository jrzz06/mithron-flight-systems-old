/**
 * Summarize before/after load-test JSON into a markdown table.
 * Usage: node tools/compare-load-test-results.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const before = JSON.parse(readFileSync(join(__dir, "load-test-results-before.json"), "utf8"));
const after = JSON.parse(readFileSync(join(__dir, "load-test-results-after.json"), "utf8"));

function routeStats(results, path) {
  const rows = [];
  for (const scenario of results.scenarios ?? []) {
    const route = scenario.routes?.[path];
    if (!route?.summary) continue;
    rows.push({
      scenario: scenario.label,
      p50: route.summary.latencyMs?.p50,
      p95: route.summary.latencyMs?.p95,
      p99: route.summary.latencyMs?.p99,
      avg: route.summary.latencyMs?.average,
      err: route.summary.errorRatePct,
      rps: route.summary.throughputReqPerSec
    });
  }
  return rows;
}

const paths = [
  "/",
  "/products",
  "/category/agri-drones",
  "/product/source-agri-kisan-drone-small-8-liter",
  "/api/cart/pricing",
  "/api/health"
];

let md = `# Local load-test before/after — 2026-07-18

**Before:** \`de5864a\` on \`127.0.0.1:3002\`  
**After:** \`perf/production-safe-rollout-review\` on \`127.0.0.1:3001\`  
**Mode:** \`LOAD_TEST_QUICK=1\` (50/100/200 × 30s) + flash-sale 80/20  
**Health:** both reported degraded (allowed); storefront GET 200.

`;

for (const path of paths) {
  md += `\n## \`${path}\`\n\n`;
  md += `| Scenario | Before p95 | After p95 | Before p99 | After p99 | Before err% | After err% |\n`;
  md += `| --- | ---: | ---: | ---: | ---: | ---: | ---: |\n`;
  const b = routeStats(before, path);
  const a = routeStats(after, path);
  const labels = [...new Set([...b.map((r) => r.scenario), ...a.map((r) => r.scenario)])];
  for (const label of labels) {
    const br = b.find((r) => r.scenario === label);
    const ar = a.find((r) => r.scenario === label);
    md += `| ${label} | ${br?.p95?.toFixed?.(0) ?? br?.p95 ?? "—"} | ${ar?.p95?.toFixed?.(0) ?? ar?.p95 ?? "—"} | ${br?.p99?.toFixed?.(0) ?? br?.p99 ?? "—"} | ${ar?.p99?.toFixed?.(0) ?? ar?.p99 ?? "—"} | ${br?.err ?? "—"} | ${ar?.err ?? "—"} |\n`;
  }
}

const out = join(__dir, "..", "docs", "load-test-before-after-2026-07-18.md");
writeFileSync(out, md);
console.log(`Wrote ${out}`);
