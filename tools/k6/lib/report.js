/**
 * Write JSON + HTML summary under tools/k6/results/
 */
export function buildReports(data, meta) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const base = `tools/k6/results/${meta.scenario}-${ts}`;

  const p99 = data.metrics.http_req_duration?.values?.["p(99)"];
  const p95 = data.metrics.http_req_duration?.values?.["p(95)"];
  const fail = data.metrics.http_req_failed?.values?.rate;
  const apiP99 = data.metrics.mithron_api_latency?.values?.["p(99)"];
  const pageP99 = data.metrics.mithron_page_latency?.values?.["p(99)"];
  const sbP99 = data.metrics.mithron_supabase_proxy_latency?.values?.["p(99)"];
  const r429 = data.metrics.mithron_http_429?.values?.count ?? 0;

  const summary = {
    generatedAt: new Date().toISOString(),
    baseUrl: meta.baseUrl,
    scenario: meta.scenario,
    target: meta.target,
    thresholds: meta.thresholds,
    http: {
      p95_ms: p95 ?? null,
      p99_ms: p99 ?? null,
      failed_rate: fail ?? null,
      requests: data.metrics.http_reqs?.values?.count ?? null
    },
    custom: {
      page_p99_ms: pageP99 ?? null,
      api_p99_ms: apiP99 ?? null,
      supabase_proxy_p99_ms: sbP99 ?? null,
      http_429_count: r429,
      journey_fail_rate: data.metrics.mithron_journey_fail_rate?.values?.rate ?? null
    },
    checks: data.root_group?.checks ?? null,
    raw_metrics: data.metrics
  };

  const hasP99Sla = Boolean(meta.thresholds?.http_req_duration);
  const failBudget = hasP99Sla ? 0.01 : 0.05;
  const passP99 = !hasP99Sla || (p99 != null && p99 < 1500);
  const passFail = fail == null || fail < failBudget;
  const overall = passP99 && passFail ? "PASS" : "FAIL";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Mithron k6 — ${meta.scenario} — ${overall}</title>
  <style>
    body{font-family:ui-sans-serif,system-ui,sans-serif;margin:2rem;background:#0b1220;color:#e8eef7}
    h1{font-size:1.4rem} .ok{color:#34d399}.bad{color:#f87171}
    table{border-collapse:collapse;width:100%;max-width:720px;margin-top:1rem}
    th,td{border:1px solid #243044;padding:.55rem .75rem;text-align:left}
    th{background:#152033} code{background:#152033;padding:.1rem .35rem;border-radius:4px}
    .muted{color:#94a3b8;font-size:.9rem}
  </style>
</head>
<body>
  <h1>Mithron k6 load report — <span class="${overall === "PASS" ? "ok" : "bad"}">${overall}</span></h1>
  <p class="muted">${summary.generatedAt} · scenario=<code>${meta.scenario}</code> · target=<code>${meta.target}</code></p>
  <p><code>${meta.baseUrl}</code></p>
  <table>
    <tr><th>Metric</th><th>Value</th><th>SLA</th></tr>
    <tr><td>http_req_duration p99</td><td>${fmt(p99)} ms</td><td>&lt; 1500 ms</td></tr>
    <tr><td>http_req_duration p95</td><td>${fmt(p95)} ms</td><td>—</td></tr>
    <tr><td>http_req_failed</td><td>${pct(fail)}</td><td>&lt; 1%</td></tr>
    <tr><td>Page latency p99</td><td>${fmt(pageP99)} ms</td><td>custom</td></tr>
    <tr><td>API latency p99</td><td>${fmt(apiP99)} ms</td><td>custom</td></tr>
    <tr><td>Supabase proxy (/api/health) p99</td><td>${fmt(sbP99)} ms</td><td>custom</td></tr>
    <tr><td>HTTP 429 count</td><td>${r429}</td><td>watch pooler / rate limits</td></tr>
  </table>
  <p class="muted">True Supabase SQL timing is not exposed by the app; health ping is the public proxy for pooler reachability.</p>
</body>
</html>`;

  return {
    [`${base}.summary.json`]: JSON.stringify(summary, null, 2),
    [`${base}.report.html`]: html,
    stdout: [
      "",
      `Mithron k6 [${meta.scenario}] → ${overall}`,
      `BASE_URL=${meta.baseUrl}`,
      `http p99=${fmt(p99)}ms (SLA <1500) | failed=${pct(fail)} (SLA <1%)`,
      `page p99=${fmt(pageP99)}ms | api p99=${fmt(apiP99)}ms | supabase_proxy p99=${fmt(sbP99)}ms | 429s=${r429}`,
      `Wrote ${base}.summary.json and ${base}.report.html`,
      ""
    ].join("\n")
  };
}

function fmt(n) {
  return n == null || Number.isNaN(n) ? "n/a" : Number(n).toFixed(1);
}

function pct(rate) {
  return rate == null ? "n/a" : `${(rate * 100).toFixed(2)}%`;
}
