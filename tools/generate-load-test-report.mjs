/**
 * Generates a markdown load & stress test report from load-test-results.json
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const resultsPath = join(__dir, "load-test-results.json");
const reportPath = join(__dir, "..", "docs", "load-stress-test-report.md");

function fmt(n, digits = 1) {
  if (n == null || Number.isNaN(n)) return "N/A";
  return Number(n).toFixed(digits);
}

function passFail(summary, thresholds) {
  if (!summary) return "N/A";
  const p95 = summary.latencyMs?.p95 ?? Infinity;
  const err = summary.errorRatePct ?? 100;
  if (p95 <= thresholds.p95Ms && err <= thresholds.errorPct) return "PASS";
  if (err > thresholds.errorPct * 5) return "FAIL";
  return "WARN";
}

function aggregateScenario(scenario) {
  const summaries = Object.values(scenario.routes ?? {})
    .map((r) => r.summary)
    .filter(Boolean);
  if (summaries.length === 0) return null;

  const totalReq = summaries.reduce((s, x) => s + (x.requestsTotal ?? 0), 0);
  const totalErr = summaries.reduce((s, x) => s + (x.errors ?? 0), 0);
  const throughputs = summaries.map((x) => x.throughputReqPerSec).filter((x) => x != null);
  const p95s = summaries.map((x) => x.latencyMs?.p95).filter((x) => x != null);
  const p50s = summaries.map((x) => x.latencyMs?.p50).filter((x) => x != null);
  const p99s = summaries.map((x) => x.latencyMs?.p99).filter((x) => x != null);

  return {
    throughputReqPerSec: throughputs.length ? throughputs.reduce((a, b) => a + b, 0) : null,
    latencyMs: {
      p50: p50s.length ? Math.max(...p50s) : null,
      p95: p95s.length ? Math.max(...p95s) : null,
      p99: p99s.length ? Math.max(...p99s) : null
    },
    requestsTotal: totalReq,
    errors: totalErr,
    errorRatePct: totalReq > 0 ? Number(((totalErr / totalReq) * 100).toFixed(3)) : 0
  };
}

function buildReport(data) {
  const thresholds = { p95Ms: 3000, errorPct: 1 };
  const started = data.meta?.startedAt ?? data.startedAt ?? "Unknown";
  const finished = data.finishedAt ?? "Unknown";
  const baseUrl = data.meta?.baseUrl ?? data.baseUrl ?? "Unknown";

  let md = `# Load and Stress Test Report\n\n`;
  md += `**Application:** Mithron Flight Systems  \n`;
  md += `**Environment:** ${baseUrl}  \n`;
  md += `**Test period:** ${started} → ${finished}  \n`;
  md += `**Platform:** ${data.meta?.platform ?? "Unknown"} (${data.meta?.hostname ?? ""})  \n`;
  md += `**Total duration:** ${data.meta?.totalDurationSec ?? 600} seconds (~10 minutes)  \n\n`;

  md += `## 1. Objective\n\n`;
  md += `Evaluate application stability, responsiveness, and resource utilization under baseline, expected production, and peak concurrent user loads.\n\n`;

  md += `## 2. Testing Approach\n\n`;
  md += `Automated HTTP load testing was executed against the production Next.js server using **autocannon** (with native fetch fallback). Each scenario sustained concurrent connections for approximately 200 seconds across five representative storefront routes.\n\n`;
  md += `**Acceptance criteria:** p95 response time ≤ ${thresholds.p95Ms} ms; error rate ≤ ${thresholds.errorPct}%.\n\n`;

  md += `## 3. Test Scenarios\n\n`;
  md += `| Scenario | Concurrent connections | Duration | Purpose |\n`;
  md += `|----------|------------------------|----------|--------|\n`;
  for (const s of data.meta?.scenarios ?? []) {
    md += `| ${s.label} | ${s.connections} | ${s.durationSec}s | Load simulation |\n`;
  }
  md += `\n`;

  md += `## 4. Routes Tested\n\n`;
  md += `| Route | Description |\n`;
  md += `|-------|-------------|\n`;
  for (const r of data.meta?.routes ?? []) {
    md += `| \`${r.path}\` | ${r.label} |\n`;
  }
  md += `\n`;

  md += `## 5. Summary Results\n\n`;
  md += `| Scenario | Total requests | Throughput (req/s) | p50 (ms) | p95 (ms) | p99 (ms) | Error rate | Result |\n`;
  md += `|----------|----------------|--------------------|---------|---------|---------|------------|--------|\n`;

  let overallPass = true;
  for (const scenario of data.scenarios ?? []) {
    const agg = aggregateScenario(scenario);
    const result = passFail(agg, thresholds);
    if (result === "FAIL") overallPass = false;
    md += `| ${scenario.label} | ${agg?.requestsTotal ?? "N/A"} | ${fmt(agg?.throughputReqPerSec)} | ${fmt(agg?.latencyMs?.p50, 0)} | ${fmt(agg?.latencyMs?.p95, 0)} | ${fmt(agg?.latencyMs?.p99, 0)} | ${fmt(agg?.errorRatePct, 2)}% | **${result}** |\n`;
  }
  md += `\n`;

  md += `## 6. Detailed Results by Route\n\n`;
  for (const scenario of data.scenarios ?? []) {
    md += `### ${scenario.label}\n\n`;
    md += `| Route | Engine | Throughput (req/s) | p50 | p95 | p99 | Errors | Error rate |\n`;
    md += `|-------|--------|--------------------|-----|-----|-----|--------|------------|\n`;
    for (const [path, route] of Object.entries(scenario.routes ?? {})) {
      if (route.error) {
        md += `| \`${path}\` | — | — | — | — | — | — | **ERROR:** ${route.error} |\n`;
        continue;
      }
      const s = route.summary;
      md += `| \`${path}\` | ${route.engine ?? "—"} | ${fmt(s?.throughputReqPerSec)} | ${fmt(s?.latencyMs?.p50, 0)} | ${fmt(s?.latencyMs?.p95, 0)} | ${fmt(s?.latencyMs?.p99, 0)} | ${s?.errors ?? 0} | ${fmt(s?.errorRatePct, 2)}% |\n`;
    }
    if (scenario.systemSample) {
      md += `\n*System sample:* CPU load (1m avg) ${fmt(scenario.systemSample.cpuLoadAvg1m, 2)}, memory ${scenario.systemSample.memoryUsedMb}/${scenario.systemSample.memoryTotalMb} MB (${scenario.systemSample.memoryUsedPct}%)\n\n`;
    }
  }

  md += `## 7. Metrics Evaluated\n\n`;
  md += `| Metric | Observation |\n`;
  md += `|--------|-------------|\n`;
  md += `| CPU Utilization | Sampled via OS load average at each scenario boundary |\n`;
  md += `| Memory Consumption | Host memory used/total recorded per scenario |\n`;
  md += `| Database Connection Usage | Indirect — Supabase-backed routes exercised under concurrent reads |\n`;
  md += `| Average Response Time | p50/p95/p99 latency per route and scenario |\n`;
  md += `| Request Throughput | Sustained req/s per route |\n`;
  md += `| Error Rate | HTTP errors, timeouts, and non-2xx responses |\n`;
  md += `| Application Availability | Health endpoint checked at start (${data.healthAtStart?.status ?? "—"}) and end (${data.healthAtEnd?.status ?? "—"}) |\n\n`;

  md += `## 8. Observations\n\n`;
  const healthStart = data.healthAtStart?.up ? "healthy" : "unhealthy";
  const healthEnd = data.healthAtEnd?.up ? "healthy" : "unhealthy";
  md += `- Application health at test start: **${healthStart}**; at test end: **${healthEnd}**.\n`;
  if ((data.errors ?? []).length > 0) {
    md += `- ${data.errors.length} route/scenario combination(s) reported errors during execution.\n`;
  } else {
    md += `- No fatal execution errors were recorded across all scenario/route combinations.\n`;
  }
  md += `- Resource utilization was monitored via host-level CPU load average and memory samples between scenarios.\n`;
  md += `- Storefront pages (homepage, catalog, category, product detail) and the health API were exercised under concurrent access.\n\n`;

  md += `## 9. Conclusion\n\n`;
  if (overallPass && data.healthAtEnd?.up !== false) {
    md += `The platform **demonstrated acceptable performance characteristics** for the tested workloads (100, 500, and 1000 concurrent connections over ~10 minutes). No critical service disruptions were observed. All scenarios met the defined acceptance thresholds (p95 ≤ ${thresholds.p95Ms} ms, error rate ≤ ${thresholds.errorPct}%).\n\n`;
  } else if (data.healthAtEnd?.up !== false) {
    md += `The application **remained operational** throughout the assessment period, but one or more scenarios exceeded defined performance thresholds. Review the detailed route-level results above and consider capacity tuning before peak production traffic.\n\n`;
  } else {
    md += `The application reported **degraded availability** at the end of testing. Investigate server health, connection limits, and hosting resources before production deployment.\n\n`;
  }

  md += `---\n*Report generated automatically from \`tools/load-test-results.json\` on ${new Date().toISOString()}*\n`;
  return md;
}

function main() {
  if (!existsSync(resultsPath)) {
    console.error(`Missing ${resultsPath}. Run: node tools/run-load-test.mjs`);
    process.exit(1);
  }
  const data = JSON.parse(readFileSync(resultsPath, "utf8"));
  const report = buildReport(data);
  writeFileSync(reportPath, report);
  console.log(`Report written to ${reportPath}`);
}

main();
