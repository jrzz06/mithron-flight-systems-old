/**
 * Mithron production-grade k6 suite (Next.js storefront + Supabase).
 *
 * Scenarios (pick one via -e SCENARIO=…):
 *   average — ramp 100 VUs / 2m, hold 5m          (baseline SLAs)
 *   spike   — 10 → 500 VUs in 15s, hold 1m        (requires CONFIRM_SPIKE=1)
 *   soak    — 50 VUs for 30m                      (requires CONFIRM_SOAK=1)
 *
 * Weighted journeys:
 *   70% browser  — /, /api/catalog/search?q=drone, /products, PDP, /api/products/summary
 *   20% cart     — PDP + POST /api/cart/pricing
 *   10% write    — safe dry probes (pricing + checkout dry 400 + admin 401 + health)
 *
 * SLAs: http_req_duration p(99)<1500 ; http_req_failed rate<0.01
 *
 * Run examples — see tools/k6/README.md
 */
import { assertSafetyGates, BASE_URL, SCENARIO, TARGET } from "./lib/config.js";
import { weightedUserJourney } from "./lib/journeys.js";
import { buildReports } from "./lib/report.js";

assertSafetyGates();

const THRESHOLDS = {
  http_req_duration: ["p(99)<1500"],
  http_req_failed: ["rate<0.01"],
  mithron_journey_fail_rate: ["rate<0.05"],
  checks: ["rate>0.95"]
};

const SCENARIOS = {
  /** ~45s wiring check — not an SLA gate */
  validate: {
    executor: "ramping-vus",
    startVUs: 0,
    stages: [
      { duration: "10s", target: 5 },
      { duration: "20s", target: 5 },
      { duration: "10s", target: 0 }
    ],
    gracefulRampDown: "10s",
    tags: { scenario: "validate" }
  },
  average: {
    executor: "ramping-vus",
    startVUs: 0,
    stages: [
      { duration: "2m", target: 100 },
      { duration: "5m", target: 100 },
      { duration: "1m", target: 0 }
    ],
    gracefulRampDown: "30s",
    tags: { scenario: "average" }
  },
  spike: {
    executor: "ramping-vus",
    startVUs: 10,
    stages: [
      { duration: "15s", target: 500 },
      { duration: "1m", target: 500 },
      { duration: "30s", target: 0 }
    ],
    gracefulRampDown: "30s",
    tags: { scenario: "spike" }
  },
  soak: {
    executor: "constant-vus",
    vus: 50,
    duration: "30m",
    gracefulStop: "1m",
    tags: { scenario: "soak" }
  }
};

if (!SCENARIOS[SCENARIO]) {
  throw new Error(`Unknown SCENARIO="${SCENARIO}". Use validate | average | spike | soak.`);
}

const activeThresholds =
  SCENARIO === "validate"
    ? {
        // Wiring only — local Redis/SSR often exceeds production SLAs.
        http_req_failed: ["rate<0.05"],
        checks: ["rate>0.9"]
      }
    : THRESHOLDS;

export const options = {
  scenarios: {
    [SCENARIO]: SCENARIOS[SCENARIO]
  },
  thresholds: activeThresholds,
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max"],
  userAgent: "mithron-k6-suite/1.0"
};

export default function () {
  weightedUserJourney();
}

export function handleSummary(data) {
  return buildReports(data, {
    scenario: SCENARIO,
    target: TARGET,
    baseUrl: BASE_URL,
    thresholds: activeThresholds
  });
}

export function setup() {
  console.log(`Mithron k6 suite · scenario=${SCENARIO} · target=${TARGET} · BASE_URL=${BASE_URL}`);
  console.log(
    "Routes: real catalog/search + cart/pricing + pages. No fictional /api/products. No destructive admin writes."
  );
  return { startedAt: Date.now() };
}
