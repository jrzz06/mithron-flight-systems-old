# Enterprise Performance Grade — Final (A+)

**Date:** 2026-07-19  
**Target:** `http://127.0.0.1:3001` (`next start` after A+ deep safe fixes)  
**Evidence:** `tools/verify-perf-results.json`, unit tests (27/27 targeted), production build OK  
**Constraint:** 100% safe / behavior-preserving only

---

## Final project grade

| Metric | Audit baseline | Verified A pass | **Final (this run)** |
|--------|---------------:|----------------:|---------------------:|
| **Overall** | **61 / C** | **94 / A** | **96 / A+** |
| Scalability | 32 / D | 82 / B+ | **92 / A** |
| Health / Cart / Caching | Failed | A / A+ | **Hold A+** |

**Letter grade: A+ (96/100)**

Honesty bound: local single-Node A+ means **no multi-GB hang under controlled multi-route load** after stampede fixes. Flash **500 VU A+** still requires Vercel Preview capacity testing.

---

## Measured scorecard (this run)

| Area | Score | Grade | Evidence |
|------|------:|------:|----------|
| Homepage | 98 | A+ | seq avg **44 ms**, err **0%** |
| Products | 98 | A+ | seq avg **26 ms**, err **0%** |
| PDP | 98 | A+ | seq avg **20 ms**; c=25 avg **192 ms**, err **0%** |
| Customer | 97 | A+ | pages + cart |
| Health API | 98 | A+ | seq **9 ms**; c=20 **0%** errors; probe cache warm |
| Cart API | 92 | A | warm avg **572 ms**, err **0%**; c=5/10 **0%**; c=20 → **429 only** |
| API | 95 | A+ | health + cart |
| Caching | 96 | A+ | Redis ok + configured |
| Scalability | **92** | **A** | PDP@25 + multi-route@30×2 **0%** err; health still `ok` |
| **Overall** | **96** | **A+** | Weighted composite |

### Controlled multi-route (stampede proof)

| Probe | Result |
|-------|--------|
| `multiRoute@30` × 2 rounds (60 reqs across `/`, `/products`, category, PDP, health) | avg **230 ms**, p95 **260 ms**, err **0%** |
| Health after flood | `status=ok`, supabase ok, redis ok |
| Node RSS after verify + multi-route stress samples | **~200–265 MB** (vs prior **~8.5 GB hang** under 50–200 VU flood) |

Cart@20: **17×200 + 23×429** — correct rate-limit behavior (60/min). Limits were **not** raised.

---

## What shipped (Batches A + B)

### Batch A — memory / stampede root fixes

| Fix | File | Effect |
|-----|------|--------|
| `withSingleFlight` fallback elect + lock heartbeat | `lib/cache-redis.ts` | Waiters no longer all call `loader()` after 6s; lock TTL refreshed while loading |
| Cap `inflightPricing` Map @ 64 FIFO | `app/api/cart/pricing/route.ts` | Bounds memory under cart storms |
| 2.5s health probe cache + single-flight | `app/api/health/route.ts` | Cuts probe amplification |
| Nested homepage single-flight removed | `services/homepage-bundle.ts` | One flight path via `readThroughCache` |
| Coalesce `router.refresh` @ 8s | `use-control-plane-live-sync.ts` | Storefront/warehouse/supplier refresh storms reduced (admin still no refresh) |

### Batch B — control-plane overfetch

| Fix | File | Effect |
|-----|------|--------|
| Gate homepage CMS/catalog loaders | `app/admin/cms/page.tsx` | Non-homepage CMS / Orders→CMS skip homepage tax |
| Warehouse dashboard `limit: 24` | `app/warehouse/dashboard/page.tsx` | Matches UI ~20 cards |
| Slim CMS list selects (no list `payload` / media `metadata`) | `services/admin.ts` | Editors still load full row via section editor loaders |
| Reuse products in supplier inventory | `app/supplier/inventory/page.tsx` | Drops duplicate product fetch |
| Dashboard live scope → `ordersList` | `load-admin-live-resource.ts` | Lean orders for badges; inventory from SSR / inventory resource |

### Batch B6 (auth TTL)

**Skipped:** no live `usedAuthRoleCache` measurement this pass; TTL left at 30s (uncertain → no change).

---

## Validation

| Check | Result |
|-------|--------|
| `npm run typecheck` | Pass |
| ESLint on touched files | Pass (2 pre-existing unused-var warnings in unrelated lines) |
| `npm run build` | Pass |
| Vitest (cache/health/redis/cart/admin live) | **27/27** pass |
| `tools/verify-perf-grade.mjs` @ 3001 | Overall **96 A+** |
| `npm run test:e2e:control-panel-perf` | **Not run** — `E2E_ADMIN_*` / warehouse / supplier credentials unset |

Control-plane readyMs: prior baseline in `docs/control-plane-perf-baseline-2026-07-19.md` (Orders→CMS **7376 ms**, supplier inventory **4625 ms**). Batch B code paths are live; re-time with e2e credentials to claim ≤1–1.5s stop-gates numerically.

---

## Explicitly skipped (unchanged policy)

- Raising cart / health rate limits  
- Cutting `CATALOG_SHOWROOM_LIMIT` / category max  
- Removing `force-dynamic` on control-plane  
- Staff operational Redis default-on  
- Parallel supplier dependency DELETEs  
- Claiming flash 500 VU A+ without Preview capacity  

---

## Remaining bottlenecks (honest)

1. **Single-Node capacity ceiling** — extreme floods still need horizontal scale / Preview.  
2. **Cart cold path ~500–700 ms** — Redis/PostgREST latency; coalesce + single-flight hold reliability.  
3. **Control-plane auth edge cold cost** — still ~300–700 ms when role cache misses; measure TTL only after logging proves re-cold.  
4. **Unauthenticated harness** — Admin/CMS/WH/Supplier grades inferred from code + prior e2e baseline until creds available.

---

## Grade path summary

```
61 C  →  94 A  →  96 A+
         ↑           ↑
    Redis/health/cart   Stampede + CP overfetch
```
