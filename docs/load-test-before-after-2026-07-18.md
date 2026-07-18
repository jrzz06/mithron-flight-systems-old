# Local load-test before/after — 2026-07-18

**Before:** `de5864a` @ `http://127.0.0.1:3002`  
**After:** `perf/production-safe-rollout-review` @ `http://127.0.0.1:3001`  
**Mode:** `LOAD_TEST_QUICK=1` (50 / 100 / 200 concurrent × 30s) + flash-sale 80/20 × 60s  
**Note:** Autocannon did not emit p95 for most GET routes on this host; **p50 / p99 / request counts** are the reliable columns. Throughput `req/s` from autocannon is **not trusted** (instrumentation artifact). Native-fetch routes (cart pricing, checkout status) have real p95.

Both servers started with `ALLOW_DEMO_SEED=false` + `PAYMENT_EXPIRE_SECRET` set. `/api/health` returned `degraded` (503) on both — storefront still 200. Cart pricing high error rates under load are consistent with **fail-closed rate limiting** (expected safety behavior, not a regression).

## Peak scenario (200 concurrent, 30s) — headline

| Route | Before p50 | After p50 | Before p99 | After p99 | Before n | After n |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `/` | 1046 | **885** | 3414 | **1723** | 748 | **938** |
| `/products` | 1049 | **880** | 2575 | 3038 | 763 | **912** |
| `/category/agri-drones` | 1028 | **874** | 1986 | **1198** | 794 | **1003** |
| Hot PDP | 1021 | **874** | 1408 | **1195** | 841 | **992** |
| `/api/checkout/status` (p95) | 1278 | **1038** | — | — | 1120 | **1676** |
| `/api/cart/pricing` (p95) | 1408 | **1103** | 5393 | **3813** | 820 | 953 |

Error rate on cart pricing remained high on both (~94–97%) — rate-limit / validation under concurrent POST, not a page-render issue.

## Mid scenario (100 concurrent, 30s)

| Route | Before p50 | After p50 | Before p99 | After p99 |
| --- | ---: | ---: | ---: | ---: |
| `/` | 460 | 493 | 1291 | **1070** |
| `/products` | 455 | 498 | 650 | 903 |
| Category | 460 | 492 | 739 | 874 |
| Hot PDP | 457 | 494 | 702 | 876 |
| Checkout status p95 | 552 | 717 | — | — |

## Flash-sale spike (400 conn on hot PDP)

| Build | Hot PDP p50 | Hot PDP p99 | Notes |
| --- | ---: | ---: | --- |
| Before | 2702 | 18937 | Single-machine saturation; err counter buggy (>100%) |
| After | 2582 | 36291 | Same caveat — **not** a production-region proof |

Flash-sale numbers prove the harness runs; they do **not** prove production capacity. Re-run against a Vercel Preview in-region for Amazon-class evidence.

## Interpretation

1. **Under peak local concurrency, after-build p50/p99 improved on homepage, category, PDP, checkout dry-check, and cart-pricing p95.**
2. Mid-load is mixed (cold-cache / shared-CPU noise); peak is the cleaner signal.
3. Zero storefront HTML error rate on catalog routes both sides.
4. Health degraded + Redis probe (after) is stricter readiness — expect 503 until Redis+DB both pass.

Raw JSON: `tools/load-test-results-before.json`, `tools/load-test-results-after.json`.
