import http from "k6/http";
import { check } from "k6";
import { BASE_URL } from "./config.js";
import { apiLatency, pageLatency, rateLimited, supabaseProxyLatency } from "./metrics.js";

/**
 * @param {string} path
 * @param {{
 *   method?: string,
 *   body?: string | null,
 *   headers?: Record<string, string>,
 *   okStatuses?: number[],
 *   kind?: 'page' | 'api' | 'supabase_proxy' | 'none',
 *   name?: string,
 *   trend?: import('k6/metrics').Trend
 * }} [opts]
 */
export function request(path, opts = {}) {
  const {
    method = "GET",
    body = null,
    headers = {},
    okStatuses = [200],
    kind = "api",
    name = path,
    trend
  } = opts;

  const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;
  const params = {
    tags: { name, endpoint: path.split("?")[0], kind },
    headers: {
      Accept: kind === "page" ? "text/html,application/xhtml+xml" : "application/json",
      "User-Agent": "mithron-k6-suite/1.0",
      "Cache-Control": "no-cache",
      ...headers
    },
    responseCallback: http.expectedStatuses(...okStatuses)
  };

  const res =
    method === "POST"
      ? http.post(url, body, params)
      : method === "PUT"
        ? http.put(url, body, params)
        : http.get(url, params);

  if (res.status === 429) rateLimited.add(1);

  if (trend) trend.add(res.timings.duration);
  else if (kind === "page") pageLatency.add(res.timings.duration);
  else if (kind === "api") apiLatency.add(res.timings.duration);
  else if (kind === "supabase_proxy") supabaseProxyLatency.add(res.timings.duration);

  const ok = check(res, {
    [`${name} status`]: (r) => okStatuses.includes(r.status)
  });

  return { res, ok };
}
