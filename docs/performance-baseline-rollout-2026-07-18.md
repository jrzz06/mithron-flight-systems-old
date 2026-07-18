# Performance baseline — rollout start — 2026-07-18

Fresh Stage-0 snapshot before landing the uncommitted optimization pass
(`perf/production-safe-rollout-review`).

## Method

- **Production URL:** `https://final-mithron-deploy.vercel.app`
- **Latency:** GET round-trip (Windows client → Vercel), 3 samples per storefront
  route, 2 samples for admin/health. Includes WAN RTT; first sample often cold.
- **Redis:** read-only `DBSIZE` + `SCAN` + `TTL` against production Upstash
  (credentials from `.env.local`). **No writes / deletes / flushes.**
- **Admin routes:** unauthenticated — expect `307` to login (edge redirect only).

## Production GET latency (2026-07-18)

| Route | Status | Avg ms | Samples (ms) |
| --- | --- | ---: | --- |
| `/` | 200 | 4264 | 8674, 1925, 2193 |
| `/products` | 200 | 2927 | 5113, 1502, 2167 |
| `/category/agri-drones` | 200 | 2151 | 3575, 1414, 1466 |
| `/product/agrione-x1` | 200 | 977 | 910, 1075, 945 |
| `/cart` | 200 | 988 | 889, 1169, 905 |
| `/checkout` | 200 | 1064 | 886, 1223, 1083 |
| `/login` | 200 | 565 | 506, 447, 742 |
| `/admin` | 307 | 294 | 307, 280 |
| `/admin/orders` | 307 | 210 | 220, 199 |
| `/admin/products` | 307 | 206 | 210, 201 |
| `/api/health` | **503** | 1253 | 1676, 831 |

Notes:
- Homepage first sample (~8.7s) is cold-path dominated; warm samples ~2s.
- Admin numbers are redirect-only (no authenticated dashboard SSR measured).
- `/api/health` returning **503** means readiness currently reports degraded
  (DB and/or Redis check failing for unauthenticated/shallow probe — investigate
  in Batch 4).

## Comparison to earlier 2026-07-18 HEAD baseline

| Route | Earlier HEAD ~ | This GET avg |
| --- | ---: | ---: |
| `/` | 3004 | 4264 |
| `/products` | 824 | 2927 |
| `/category/agri-drones` | 423 | 2151 |
| `/product/agrione-x1` | 453 | 977 |

GET vs HEAD and time-of-day variance explain the gap; treat this table as the
**authoritative before** for this rollout.

## Redis (read-only) snapshot

| Metric | Value |
| --- | --- |
| `DBSIZE` | 359 |
| Sampled keys | 358 |
| `catalog:*` | 4 |
| `cms:*` | 2 |
| `ratelimit:*` | 352 |

### TTL samples (representative)

| Key | TTL |
| --- | ---: |
| `catalog:category:agri-drones:v1` | 17s |
| `catalog:showroom:v1` | 8s |
| `cms:homepage:v1` | 13s |
| `cms:shell:v1` | 10s |
| `ratelimit:account-addresses:*` (many) | **-1 (no expiry)** |
| `ratelimit:account-cart-write:*` (many) | **-1 (no expiry)** |

**Finding:** Catalog/CMS keys expire correctly (short TTL). A large share of
`ratelimit:*` keys have `TTL = -1`, which will grow memory over time — flag for
Batch 5 / ops (likely `@upstash/ratelimit` analytics keys or missing EXPIRE on
a fallback path). Do **not** flush production Redis in this pass.

## Local optimized (uncommitted) prior directional signal

From [`performance-test-results-2026-07-18.md`](./performance-test-results-2026-07-18.md)
(local vs prod, network-biased):

| Route | PROD HTML bytes | LOCAL_OPT HTML bytes | Change |
| --- | ---: | ---: | ---: |
| `/` | 484,402 | 446,786 | −7.8% |
| `/products` | 576,344 | 509,494 | −11.6% |
| `/category/agri-drones` | 286,536 | 223,788 | −21.9% |
| `/product/agrione-x1` | 143,758 | 83,169 | −42.1% |

Local before/after load test (Batch 6) will replace directional numbers with
fair same-host p95/p99.

## Rollback levers

- Vercel prior-deployment re-promote
- `git revert` per one-stage commit on the feature branch
- Additive DB migrations with paired drop/rollback SQL
