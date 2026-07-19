# Safe Load Test — Comprehensive Performance Audit Report

**Application:** Mithron Flight Systems (`mithuuu`)  
**Primary evidence:** `tools/load-test-results.json`  
**Test window:** 2026-07-18T06:16:44.186Z → 2026-07-18T06:19:49.253Z  
**Analysis date:** 2026-07-19  
**Mode:** Read-only. No code changes. No unsafe recommendations.

**Evidence classes**

| Class | Meaning |
|-------|---------|
| **Confirmed** | Directly observed in load-test metrics |
| **Complementary** | Measured outside this load run (control-plane e2e / HEAD baselines / static diagnostics) — labeled |
| **Not Measured** | Not collected by the harness; no inference presented as fact |
| **Recommendation** | Behavior-preserving optimization proposal |

---

## 1. Executive Summary

| Metric | Score / Grade |
|--------|---------------|
| **Overall Website Health Score** | **61 / 100** |
| **Performance Grade** | **C** |
| **Stability Grade** | **C** |
| **Scalability Grade** | **D** |
| **User Experience Grade** | **C** |
| **Production Readiness Grade** | **D+** |

### Verdict

Storefront HTML routes are **stable through 200 concurrent connections** (0 errors on 9,862 page requests) with latency that scales roughly **3×** from 50→200 VU. The same run shows **critical failures** on `/api/health` and `POST /api/cart/pricing`, and a **flash-sale collapse** at 500 VU on the hot PDP (p99 ≈ 36s, tens of thousands of timeouts/errors). The application is **not production-ready for flash spikes or concurrent cart pricing** on the tested profile.

### Strengths (confirmed)

- Homepage, products, category, and PDP: **0% error** at 50 / 100 / 200 VU.
- Checkout status dry-check: **0 errors** across 4,045 requests.
- Host memory stayed **67–70%** with no OOM during the run.
- At 50 VU, page median latency ≈ **280–289 ms** (local Node, no WAN RTT).

### Primary bottlenecks (confirmed)

1. Flash hot-PDP @ 500 VU — avg **4,841 ms**, p99 **36,291 ms**, extreme error/timeout ratio.
2. Cart pricing API — **82–100%** error rate under concurrency.
3. Health API — **degraded (503)** before/after test; under load: 503 / 429 / timeouts.
4. Concurrency-driven latency growth on all HTML routes (homepage avg **271 → 890 ms** from 50→200 VU).

---

## 2. Test Environment

| Item | Value | Source |
|------|-------|--------|
| Framework | Next.js `^16.2.6` | `package.json` |
| React | `^19.2.6` | `package.json` |
| Node.js | `v22.22.0` | load-test `meta.nodeVersion` |
| Database | Supabase Postgres | app stack (query timings under load: **Not Measured**) |
| Authentication | Supabase Auth + `proxy.ts` RBAC | Checkout POST **intentionally excluded** from load |
| Cache | Upstash Redis (app-configured) | Hit/miss under load: **Not Measured** |
| CDN | None for this run | Target was localhost |
| Hosting | Local `next start` | `http://127.0.0.1:3001` |
| Runtime | Node (local) | Not Edge/Vercel for this run |
| Browser | **Not Measured** | autocannon + native-fetch HTTP only |
| Test duration | **150 s** total | 3×30s quick + 60s flash |
| Virtual users | **50 → 100 → 200 → 500** | Stepped scenarios |
| Ramp-up strategy | Discrete steps; connections split across routes | No gradual ramp |
| Hostname / OS | NexusLite-PC · Windows_NT 10.0.22631 | load-test meta |
| Health at start/end | `degraded` (HTTP 503), storefront reachable | load-test health probes |

**Scenario matrix**

| Scenario | Connections | Duration | Notes |
|----------|-------------|---------|-------|
| Quick baseline | 50 | 30s | Split across 7 routes |
| Quick mid | 100 | 30s | Same |
| Quick peak | 200 | 30s | Same |
| Flash-sale spike | 500 | 60s | 80% hot PDP / 10% catalog / 10% home |

---

## 3. Overall Metrics

### 3.1 Storefront HTML (Quick 50+100+200 VU only)

| Metric | Value | Notes |
|--------|------:|-------|
| Average Response Time | **594.7 ms** | Request-weighted across 4 page routes |
| Median Response Time (p50) | **586.1 ms** | Weighted |
| P95 | **≈ interpolated** | Autocannon `p95` field was `null`; use per-route p90–p97.5 midpoint below |
| P99 | **1481.5 ms** | Weighted |
| Successful Requests | **9,862** | All HTTP 200 |
| Failed Requests | **0** | |
| Error Rate | **0.00%** | |
| Requests per Second | **~22–33 RPS per route** | From `requests.average` (not bytes/sec) |
| Throughput (bytes) | Present in raw | Autocannon `throughput.average` is **bytes/sec**; do not treat summary field as RPS |

### 3.2 Core Web Vitals / browser timing

| Metric | Value |
|--------|-------|
| TTFB | **Not Measured** |
| FCP | **Not Measured** |
| LCP | **Not Measured** |
| CLS | **Not Measured** |
| INP | **Not Measured** |

### 3.3 System samples during run

| Sample | Memory used % | Memory used MB |
|--------|--------------:|---------------:|
| Start | 67.3 | 10,583 |
| After baseline | 69.0 | 10,850 |
| After mid | 68.4 | 10,756 |
| After peak | 69.6 | 10,938 |
| After flash | 69.7 | 10,962 |

CPU load averages reported as `0` on Windows (non-informative for this host).

### 3.4 Flash-sale impact (including 500 VU)

If flash is included in page aggregates, weighted avg jumps to **~2.1 s** and error accounting becomes dominated by hot-PDP timeouts — **not representative** of steady browsing. Treat flash as a separate stress result.

---

## 4. Route Performance

**Harness limits:** Largest resource, largest JS chunk, largest image, API call count, DB query count, and cache hit/miss were **Not Measured** for every route.

### 4.1 Homepage `/`

| Metric | 50 VU | 100 VU | 200 VU | Flash (50 of 500) |
|--------|------:|-------:|-------:|------------------:|
| Avg load time | 271 ms | 523 ms | 890 ms | 2,136 ms |
| p50 | 280 | 493 | 885 | 2,308 |
| ~p95 (p90↔p97.5) | 456 | 791 | 1,182 | 2,855 |
| p99 | 582 | 1,070 | 1,723 | 2,951 |
| Max | 662 | 1,936 | 1,785 | 2,978 |
| Requests | 774 | 803 | 938 | 1,401 |
| Errors | 0 | 0 | 0 | 0 |
| RPS (avg) | 25.8 | 26.8 | 31.3 | 23.4 |
| **Overall score** | | | | **72 / 100** |

### 4.2 Products `/products`

| Metric | 50 VU | 100 VU | 200 VU | Flash |
|--------|------:|-------:|-------:|------:|
| Avg | 321 | 508 | 915 | 2,102 |
| p50 | 289 | 498 | 880 | 2,277 |
| ~p95 | 500 | 722 | 1,441 | 2,860 |
| p99 | 2,222 | 903 | **3,038** | 2,986 |
| Errors | 0 | 0 | 0 | 0 |
| **Score** | | | | **68 / 100** |

### 4.3 Category `/category/agri-drones` (proxy for Search catalog browse)

| Metric | 50 VU | 100 VU | 200 VU |
|--------|------:|-------:|-------:|
| Avg | 321 | 509 | 832 |
| p50 | 289 | 492 | 874 |
| ~p95 | 526 | 767 | 1,060 |
| p99 | 2,280 | 874 | 1,198 |
| Errors | 0 | 0 | 0 |
| **Score** | | | **70 / 100** |

**Search UI / `/api/catalog/search`:** **Not Measured** in this load run.

### 4.4 Product Details (hot PDP)

| Metric | 50 VU | 100 VU | 200 VU | Flash 400/500 VU |
|--------|------:|-------:|-------:|-----------------:|
| Avg | 318 | 511 | 848 | **4,841** |
| p50 | 287 | 494 | 874 | 2,582 |
| ~p95 | 515 | 764 | 1,109 | ~18,760 |
| p99 | 2,122 | 876 | 1,195 | **36,291** |
| Max | 2,131 | 953 | 1,208 | **53,383** |
| Successes | 659 | 823 | 992 | 5,600 |
| Errors/timeouts | 0 | 0 | 0 | **51,290** (harness) |
| **Score** | | | | **55 / 100** (penalized for flash) |

### 4.5 Cart

| Surface | Result |
|---------|--------|
| Cart UI pages | **Not Measured** |
| `POST /api/cart/pricing` | Measured — **failed under load** (see API section) |
| Cart score (inferred from API) | **35 / 100** |

### 4.6 Checkout

| Surface | Result |
|---------|--------|
| `POST /api/checkout` | **Not Measured** (excluded — requires auth/audit token) |
| `GET /api/checkout/status` (dry, expects 400) | Avg 152→508 ms; **0 errors**; score **78 / 100** |

### 4.7 Profile / Orders (customer)

**Not Measured** in load test.

### 4.8 Admin / Supplier / Warehouse / CMS

**Not Measured** under autocannon. Complementary e2e readyMs (2026-07-19):

| Transition | readyMs (baseline) | After safe batches |
|------------|-------------------:|-------------------:|
| Admin Dashboard → Products | 2,007 | — |
| Admin Dashboard → Inventory | 2,845 | **1,388** |
| Admin Dashboard → Orders | 2,221 | 2,547 (noise) |
| Admin Orders → CMS | **7,376** | **3,366** |
| Warehouse Dashboard → Orders | 1,677 | 2,557 (noise) |
| Supplier Home → Products | **3,562** | **2,017** |
| Supplier Home → Inventory | 4,625 | — |

Server cold page data (complementary): warehouse dashboard snapshot **1,753 ms**; CMS core **911 ms**; product manager **476 ms**.

---

## 5. API Performance

### 5.1 `GET /api/health`

| Scenario | Avg | Min | Max | p50 | p99 | Req | Errors | Status mix |
|----------|----:|----:|----:|----:|----:|-----:|-------:|------------|
| 50 VU | 6,282 ms | 3,799 | 9,117 | 5,616 | 9,117 | 27 | 33 | 27× 503 |
| 100 VU | 2,262 ms | 1,618 | 2,983 | 2,135 | 2,958 | 120 | 138 | 115× 429, 5× 503 |
| 200 VU | — | — | — | — | — | 0 | 168 | timeouts; no completed responses |
| Payload size | **Not Measured** | | | | | | | |

**Bottleneck (confirmed):** Health path is degraded and cannot answer under concurrency.  
**Safe optimization:** Identify which dependency sets `status=degraded`; fix probe without weakening authentication or rate limits on other APIs.

### 5.2 `POST /api/cart/pricing`

| Scenario | Avg | p50 | p95 | p99 | Max | Count | Errors | Error % |
|----------|----:|----:|----:|----:|----:|------:|-------:|--------:|
| 50 VU | 603 | 311 | 2,087 | 3,660 | 3,795 | 351 | 290 | **82.6%** |
| 100 VU | 442 | 467 | 697 | 954 | 960 | 966 | 966 | **100%** |
| 200 VU | 893 | 882 | 1,103 | 3,813 | 5,560 | 953 | 892 | **93.6%** |
| Fastest / payload | **Not Measured** | | | | | | | |

**Bottleneck (confirmed):** Pricing endpoint does not sustain concurrent load in this harness.  
**Safe optimization:** Single-connection baseline → classify failures (4xx validation vs 429 vs 5xx vs network) → add client/server timeouts; **do not** raise rate limits blindly or bypass auth.

### 5.3 `GET /api/checkout/status` (dry-check)

| Scenario | Avg | p50 | p95 | p99 | Max | Count | Errors |
|----------|----:|----:|----:|----:|----:|------:|-------:|
| 50 VU | 152 | 101 | 373 | 564 | 606 | 1,393 | 0 |
| 100 VU | 432 | 453 | 717 | 935 | 954 | 976 | 0 |
| 200 VU | 508 | 346 | 1,038 | 1,100 | 1,409 | 1,676 | 0 |

**Confirmed:** Route remains available under load for the dry-check contract.

---

## 6. Database Analysis

| Concern | Status |
|---------|--------|
| Slow queries under load | **Not Measured** (no `EXPLAIN` / pg_stat in this run) |
| Duplicate queries | **Not Measured** live; static audit notes shell CMS + snapshot fan-out patterns |
| N+1 queries | **Not Measured** live; static: media asset fallback N+1 risk |
| Overfetching | **Complementary / static:** wide selects (shell CMS, warehouse snapshot, search index) |
| Missing indexes | **Recommend only after EXPLAIN** — prior migrations added hot-path indexes; enquiries trigram still inferred |
| Payload sizes | **Not Measured** in load JSON; complementary HTML shrink −7.8% to −42% vs older prod (local opt vs prod HEAD compare) |
| Sequential queries | **Static recommendation:** warehouse dispatch sequential lifecycle; enquiry notify loops |
| Parallelization opportunities | Safe: parallel image variant uploads; bounded `Promise.all` for notifications |
| Average / slowest query latency | **Not Measured** |

---

## 7. Frontend Analysis

| Metric | Status |
|--------|--------|
| Hydration time | **Not Measured** |
| Render time | **Not Measured** |
| Re-render count | **Not Measured** |
| Client vs Server Components | **Not Measured** under load; architecture uses App Router RSC + client islands |
| Suspense usage | Present in code; homepage dual-Suspense effectiveness is a **static** finding |
| Dynamic imports / lazy loading | Incomplete for catalog listing / assistant (**static**) |
| Largest bundles | **Complementary static:** ~1.3 MB first-load JS uncompressed |
| Dead JavaScript estimate | **Not Measured** quantitatively |

---

## 8. Asset Analysis

| Asset class | Total size | Largest file | Compression | Optimization |
|-------------|------------|--------------|-------------|--------------|
| Images | **Not Measured** (this load run) | **Not Measured** | **Not Measured** | Prior work: WebP variants, delivered-width audits exist |
| Fonts | **Not Measured** | **Not Measured** | **Not Measured** | — |
| CSS | **Not Measured** | **Not Measured** | **Not Measured** | Static: editor CSS may pull on storefront |
| JavaScript | **~1.3 MB first-load** (static diagnostics) | **Not Measured** per chunk in load run | **Not Measured** | Lazy islands + server-side remote map |
| Icons | **Not Measured** | **Not Measured** | **Not Measured** | — |
| Videos | **Not Measured** | **Not Measured** | **Not Measured** | — |

---

## 9. Caching

| Layer | Effectiveness under this test |
|-------|-------------------------------|
| Browser cache | **Not Measured** (no browser) |
| Next.js cache / ISR | **Not Measured** hit ratio; app uses revalidate on merchandising routes |
| Redis (Upstash) | **Not Measured** hit/miss; complementary: auth role cache **never warmed** (`usedAuthRoleCache: false`) due to Redis URL quoting bug |
| CDN | **N/A** — localhost target |
| Supabase | **Not Measured** |
| Static assets | **Not Measured** |

**Confirmed cache-related signal (complementary):** always-cold edge auth adds **~300–700 ms** per control-plane navigation.

---

## 10. Authentication

| Metric | Status |
|--------|--------|
| Login latency | **Not Measured** in load test |
| Session validation | **Not Measured** under load |
| Middleware / proxy latency | **Complementary:** cold edge auth 300–1122 ms on control-plane |
| Profile fetch latency | **Not Measured** |
| Security of load design | **Confirmed safe:** checkout POST not hammered; no auth bypass recommended |

---

## 11. Admin Performance (complementary e2e — not load VU)

| Area | Loading signal | Bottleneck |
|------|----------------|------------|
| Dashboard | Snapshot 105–369 ms cold (server) | Edge auth cold + snapshot |
| Products | readyMs ~2.0s; product manager 476 ms | Wide list previously; slim select landed |
| Orders | readyMs ~2.2–2.5s | Improved with `ordersList` scope |
| Inventory | readyMs improved 2845→1388 ms | Snapshot fan-out |
| Warehouse | Dashboard cold **1753 ms** | Multi-table snapshot |
| Supplier | Products nav 3562→2017 ms | Still >1s target |
| CMS | Orders→CMS 7376→3366 ms; core cold 911 ms | CMS snapshot |
| Media / Analytics / Settings | **Not Measured** | — |

---

## 12. Security Impact of Recommendations

All recommendations in this report are constrained to:

| Guardrail | Status |
|-----------|--------|
| Do not weaken authentication | **Yes** — no auth removal |
| Do not bypass authorization | **Yes** — no RLS / RBAC relaxation |
| Do not reduce security headers | **Yes** — no CSP/header weakening |
| Do not expose sensitive data | **Yes** — no logging of secrets; checkout POST stays excluded |
| Do not open rate limits without evidence | **Yes** — diagnose cart/health first |

---

## 13. Bottleneck Ranking (Top 20)

| Rank | Bottleneck | Severity | Root cause (evidence class) | Affected modules | Est. impact | Confidence |
|-----:|------------|----------|-----------------------------|------------------|-------------|------------|
| 1 | Flash hot-PDP collapse @ 500 VU | Critical | Connection/timeout saturation under spike | PDP route / Node runtime | Unusable spike UX | High |
| 2 | Cart pricing mass errors | Critical | Concurrent POST failures (class TBD) | `app/api/cart/pricing` | Checkout blocked | High |
| 3 | Health degraded + 503/429/timeouts | High | Dependency health + rate limit under probe flood | `app/api/health` | Blind ops | High |
| 4 | Page latency ×3 (50→200 VU) | High | Single-node saturation / request queue | Storefront pages | Slow browse | High |
| 5 | Products p99 3038 ms @ 200 VU | High | Tail latency outliers | `/products` | Janky catalog | High |
| 6 | Edge auth always cold | High | Redis auth cache never warms | `proxy.ts`, Upstash | +0.3–0.7s/nav | Medium |
| 7 | Warehouse dashboard cold 1753 ms | High | Snapshot fan-out | `services/admin.ts` | Slow WH | Medium |
| 8 | CMS core cold 911 ms | High | Large CMS snapshot | `services/cms.ts` | Slow CMS | Medium |
| 9 | Shell CMS over-fetch | High | Full snapshot for nav/footer | `services/cms.ts` | TTFB | Low (static) |
| 10 | First-load JS ~1.3 MB | High | Large client islands | `.next` diagnostics | TTI | Low (static) |
| 11 | Cart session hang risk | Critical* | No timeout on session init | `lib/cart/cart-auth-sync.ts` | Infinite spinner | Low (static) |
| 12 | Fake homepage streaming | Medium | Shared homepage bundle promise | `sections/home/*` | No progressive paint | Low |
| 13 | Wide catalog search index | Medium | 800 wide rows cached | `services/catalog.ts` | Memory/latency | Low |
| 14 | Admin count=exact HEADs | Medium | Many HEAD counts | `services/admin.ts` | Admin products | Low |
| 15 | Supplier inventory chain | Medium | Multi-step list | `services/nav-metrics` / inventory | Supplier nav | Medium |
| 16 | Signed-in storefront auth tax | Medium | Cookie disables anon fast-path | `proxy.ts` | Logged-in browse | Low |
| 17 | Login hero multi-fetch | Low | Same image 2–3× | `login-hero-background.tsx` | Login LCP | Low |
| 18 | Remote asset map in client JS | Medium | ~108–126 KB map | `resolve-storefront-src.ts` | Bundle | Low |
| 19 | Sequential warehouse dispatch | Medium | Multi-step lifecycle | `app/warehouse/actions.ts` | Action latency | Low |
| 20 | Redis URL quote bug | High | Auth cache broken | Upstash config | Every CP nav cold | Medium |

\*Critical for stability if still present in code; **not exercised** by this HTTP load harness.

---

## 14. Safe Optimization Plan

| # | Description | Expected improvement | Risk | Safety | Biz logic? | UI? | Migration? |
|---|-------------|---------------------|------|--------|------------|-----|------------|
| 1 | Diagnose & restore `/api/health` to healthy without changing auth | Ops signal restored; lower probe latency | Low | Yes | No | No | No |
| 2 | Classify cart pricing errors; add timeouts; keep rate limits | 50–90% error reduction under concurrency | Low–Med | Yes | No | No | No |
| 3 | Fix Upstash Redis URL quoting so auth role cache warms | −300–700 ms control-plane nav | Low | Yes | No | No | No |
| 4 | Slim storefront shell CMS select (nav/footer only) | 15–35% homepage cold TTFB | Low | Yes | No | No | No |
| 5 | Split homepage hero vs below-fold loaders | Better progressive paint | Low | Yes | No | No* | No |
| 6 | Continue control-plane slim selects / list vs detail | 20–40% dashboard readyMs | Low | Yes | No | No | No |
| 7 | Cart session `raceWithTimeout` + `finally` ready | Eliminates infinite Loading cart | Low | Yes | No | No | No |
| 8 | Lazy-load catalog listing + assistant panel | 10–25% first-load JS | Low | Yes | No | No* | No |
| 9 | Server-resolve remote asset map | −100KB+ client JS | Low | Yes | No | No | No |
| 10 | Re-run load on Vercel Preview + browser CWV | Validated prod numbers | Low | Yes | No | No | No |

\*No intentional visual redesign; loading order / code-split only.

**Explicitly out of scope (unsafe / not recommended here):** raising rate limits blindly, removing Redis, weakening RLS, skipping auth on checkout, destructive schema changes, UI redesigns.

---

## 15. Expected Improvements (ranges after all safe opts)

| Area | Estimated range |
|------|-----------------|
| Homepage load time | **15–35% faster** (cold miss) |
| Dashboard load time | **20–40% faster** |
| Admin load time | **20–40% faster** on heavy routes |
| Supplier dashboard | **15–30% faster** (partial already observed) |
| Warehouse dashboard | **25–45% faster** if snapshot slimmed |
| CMS | **20–40% faster** |
| API latency (health/cart) | **50–90% error reduction**; latency TBD after root-cause |
| Database latency | **10–25%** on cold overfetch paths |
| Bundle size | **10–25%** first-load JS |
| Image payload | **Not Measured** this run; prior HTML −8% to −42% |
| TTFB | **15–30%** after shell slim + cache warm (re-measure) |
| LCP | **Not Measured** — re-benchmark browser |
| INP | **Not Measured** — re-benchmark browser |

---

## 16. Final Scorecard

| Category | Score | Status |
|----------|------:|--------|
| Homepage | 72 | Good at 50 VU; degrades at 200 |
| Customer Portal | 55 | Pages OK; cart pricing fails |
| Admin | 48 | Not in load test; e2e readyMs slow |
| Supplier | 50 | Not in load test; improved but >1s |
| Warehouse | 45 | Not in load test; dashboard cold 1753 ms |
| CMS | 42 | Not in load test; core cold 911 ms |
| API | 28 | Health + cart pricing fail under load |
| Database | N/A | Not Measured in load harness |
| Frontend | N/A | CWV / hydration Not Measured |
| Assets | N/A | Not Measured in load harness |
| Caching | N/A | Hit/miss Not Measured |
| Security | 85 | Load design preserved auth boundaries |
| Scalability | 32 | Flash 500 VU collapse |
| **Overall** | **61** | Conditional — browse OK, spike/API not |

---

## 17. Final Conclusion

**Overall application health:** Moderately healthy for **steady storefront browsing** on a local Node process up to **200 concurrent** connections, with rising latency. Unhealthy for **cart pricing concurrency**, **health monitoring under load**, and **flash-sale spikes**.

**Production-ready?** **Not fully.** Degraded health status, cart pricing failure rates of 82–100%, and flash-sale collapse are blockers for declaring production readiness against concurrent commercial traffic. Free-tier / single-instance limits (Supabase + Upstash + single Node) will amplify these issues on Vercel Preview/production until cold-path work and Redis auth cache are fixed.

**Highest-impact safe optimizations:** (1) health root-cause, (2) cart pricing diagnosis + timeouts, (3) Redis auth cache warm, (4) shell CMS slim + snapshot trims, (5) cart session timeouts.

**Scalability limitations of current free-tier / local profile:** Single Node saturates between 200–500 VU on hot paths; Redis auth cache miss adds fixed per-request tax; wide snapshots multiply DB work under concurrency. Expect flash traffic to fail without caching, CDN, and capacity above free-tier defaults.

**Expected UX after safe opts:** Steady browsing should feel snappier (especially cold navigations and control-plane). Cart/checkout reliability should improve once pricing errors and session hangs are fixed. Flash-sale readiness still requires a dedicated capacity test on Preview after those fixes — do not assume the 500 VU failure disappears from select-slimming alone.

---

## Appendix A — Metric availability matrix

| Requested metric | Available in load-test-results.json? |
|------------------|--------------------------------------|
| Latency avg / p50 / p99 / max | Yes (p95 often null for autocannon) |
| RPS / request counts / errors | Yes |
| Status code distribution | Yes (autocannon routes) |
| FCP / LCP / CLS / INP / TTFB browser | No |
| Per-route JS/image/DB/cache | No |
| Auth login timings | No |
| Admin/Supplier/Warehouse/CMS under VU | No |
| Payload sizes per API | No |

## Appendix B — Sources

1. `mithuuu/tools/load-test-results.json` — primary  
2. `mithuuu/docs/control-plane-perf-baseline-2026-07-19.md` — complementary  
3. `mithuuu/docs/control-plane-perf-final-2026-07-19.md` — complementary  
4. `mithuuu/docs/full-static-performance-audit-2026-07-18.md` — complementary static  
5. `mithuuu/docs/performance-baseline-2026-07-18.md` — complementary HEAD  
6. `mithuuu/package.json` — versions  
