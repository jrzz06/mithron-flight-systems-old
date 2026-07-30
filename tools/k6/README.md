# Mithron k6 load suite

Production-oriented scenarios for the Next.js storefront + Supabase backend.

## Important: prompt routes vs real routes

| Prompt (wrong) | Actual Mithron route |
|---|---|
| `GET /api/products?query=drone` | `GET /api/catalog/search?q=drone` |
| `GET /api/products/[id]` | `GET /product/:slug` + `GET /api/products/summary?slug=` |
| `POST /api/cart` | `POST /api/cart/pricing` (public). Account cart needs auth. |
| Admin PUT catalog writes | **Not executed** — dry probes only (`401` admin gate, checkout dry `400`, health) |

Destructive admin writes and checkout POSTs are intentionally omitted to protect production data and pooler quotas.

## Prerequisites

```bash
k6 version   # install: https://grafana.com/docs/k6/latest/set-up/install-k6/
```

Local: `npm run dev` (or `npm run start` after build).  
Vercel: use a **Preview** URL first; production only when intentional.

## Scenarios

| `SCENARIO` | Profile | Safety gate |
|---|---|---|
| `validate` | 5 VUs × ~40s | none (wiring) |
| `average` | ramp 100 / 2m, hold 5m | none |
| `spike` | 10 → 500 in 15s, hold 1m | `CONFIRM_SPIKE=1` (+ `CONFIRM_PRODUCTION=1` if `TARGET=production`) |
| `soak` | 50 VUs × 30m | `CONFIRM_SOAK=1` (+ `CONFIRM_PRODUCTION=1` if production) |

SLAs (average / spike / soak): `p(99)<1500ms`, `http_req_failed<1%`.

Custom metrics: `mithron_page_latency`, `mithron_api_latency`, `mithron_supabase_proxy_latency` (via `/api/health` PostgREST ping), `mithron_cart_pricing_latency`, `mithron_http_429`.

## Weighted journey (every VU iteration)

- **70% browsers** — `/` → catalog search → `/products` → PDP → product summary  
- **20% cart** — PDP → `POST /api/cart/pricing`  
- **10% write-pressure (safe)** — pricing + checkout dry + unauth admin + health  

## Run — local

```powershell
# quick wiring check
k6 run -e SCENARIO=validate -e TARGET=local -e BASE_URL=http://127.0.0.1:3000 tools/k6/suite.js

# average load (≈8 minutes)
k6 run -e SCENARIO=average -e TARGET=local -e BASE_URL=http://127.0.0.1:3000 tools/k6/suite.js

# npm aliases
npm run test:load:k6:validate
npm run test:load:k6:average
```

## Run — Vercel preview / production

```powershell
# Preview (preferred)
k6 run -e SCENARIO=average -e TARGET=preview -e BASE_URL=https://YOUR-PREVIEW.vercel.app tools/k6/suite.js

# Canonical production alias (average only unless confirmed)
k6 run -e SCENARIO=average -e TARGET=production -e BASE_URL=https://final-mithron-deploy.vercel.app tools/k6/suite.js

# Spike (dangerous for free-tier Supabase / shared IP rate limits)
k6 run -e SCENARIO=spike -e TARGET=preview -e CONFIRM_SPIKE=1 -e BASE_URL=https://YOUR-PREVIEW.vercel.app tools/k6/suite.js

# Soak
k6 run -e SCENARIO=soak -e TARGET=preview -e CONFIRM_SOAK=1 -e BASE_URL=https://YOUR-PREVIEW.vercel.app tools/k6/suite.js
```

## Reports (JSON + HTML)

Each run writes under `tools/k6/results/`:

- `*-summary.json` — machine-readable metrics  
- `*-report.html` — open in a browser  

Also export k6’s own summary JSON:

```powershell
k6 run -e SCENARIO=average -e BASE_URL=http://127.0.0.1:3000 `
  --summary-export=tools/k6/results/k6-summary-export.json `
  --out json=tools/k6/results/k6-raw-points.json `
  tools/k6/suite.js
```

`--out json=` is a **point stream** (large). Prefer `--summary-export` + the HTML file from `handleSummary`.

## Rate-limit expectations

From a **single client IP**, Redis-backed limits will return **429** under spike (e.g. catalog search ~120/min, cart pricing ~60/min). The suite treats many of those as accepted statuses for journey checks, but they still inflate `mithron_http_429` and can affect `http_req_failed` depending on `expectedStatuses`. Watch 429 counts when judging pooler vs app rate limits.
