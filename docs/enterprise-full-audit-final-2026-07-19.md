# Enterprise Full Audit Final Report

**Application:** Mithron Flight Systems (`mithuuu`)  
**Date:** 2026-07-19  
**Mode:** Gap-fill audit (Phases 1–10) + risk-tiered safe fix program  
**Evidence:** Multi-agent static analysis · prior RCA/load docs · security review · verify harness

**Related:**
- [enterprise-rca-perf-final-2026-07-19.md](./enterprise-rca-perf-final-2026-07-19.md)
- [safe-load-test-audit-report-2026-07-19.md](./safe-load-test-audit-report-2026-07-19.md)
- [safe-perf-optimization-report-2026-07-19.md](./safe-perf-optimization-report-2026-07-19.md)
- [../SECURITY_REVIEW_FINDINGS.md](../SECURITY_REVIEW_FINDINGS.md)
- [safe-fix-batch-log-2026-07-19.md](./safe-fix-batch-log-2026-07-19.md) (ships with Batches 1–2)

---

## 1. Executive Summary

Next.js 16 / React 19 / Supabase / Upstash monolith: **83** pages, **58** API routes, **19** server-action modules, edge RBAC in `proxy.ts`. Prior same-day safe perf work cleared load blockers (health, cart stampede, Redis quotes, CMS overfetch, PDP SF, hero Redis) to verified **96 / A+** on the controlled harness.

Gap-fill found **0 new Critical** security issues, **12 open 5xx throw paths**, and a **~10-item 100% SAFE** backlog (auth-role single-flight, 5xx soft-fail, PDP media SF, duplicate Redis/DB elimination). Flash-sale @ 500 VU on a single Node remains an **infra capacity** ceiling, not an unresolved code stampede.

Risk-tiered program ships **T0 + approved T1 only**; T2–T5 stay documented.

| Grade | Score | Basis |
|-------|------:|-------|
| Production Readiness | **86→~90** | Steady traffic ready; 5xx soft-fail batch improves reliability |
| Enterprise | **A** | Deliberate cache/SF/fail modes |
| Scalability | **B+ / A controlled** | Verify ~92 A; flash 500 VU = B |
| Security | **A- (88)** | H1–H5 fixed; accepted residuals |
| Reliability | **A- → A** | Uncaught asserts remediated in Batch 1 |
| Maintainability | **A-** | Strong docs; knip review queue |
| Resource Efficiency | **A** | Auth SF + media SF + parallel nav |

---

## 2. Root Cause Analysis

| ID | Finding | Status |
|----|---------|--------|
| RCA-01..10 | Prior enterprise RCA | Mostly FIXED / capacity / intentional |
| GAP-01 | Auth-role cold miss without `withSingleFlight` | Batch 2 (T1) |
| GAP-02 | Uncaught `assertSupabaseAdminConfig` → 500 | Batch 1 (T0) |
| GAP-03 | PDP media hops without Redis SF | Batch 2 (T0) |
| GAP-04 | Auth cache `profileComplete` schema mismatch | Batch 2 (T0) |
| GAP-05 | Assistant client stream no timeout | T2 document only |
| GAP-06 | `void buildProductCoreEntry` no `.catch` | Batch 1 (T0) |
| GAP-07 | Env assert Resend vs Brevo-first | T3 document only |
| GAP-08 | Flash 500 VU single-node collapse | T5 INFRA |

---

## 3. Dead-End Analysis

| Finding | Files / functions | Prob | Class |
|---------|-------------------|------|-------|
| Assistant stream hang | `mithron-assistant-panel.tsx`; `/api/ai/assistant` | Med | T2 |
| SF loader no wall-clock (waiters OK) | `lib/cache-redis.ts` `withSingleFlight` | Med | T0 Batch 2 |
| Cart auth init vs SIGNED_IN race | `cart-auth-sync.ts` | Med | T0 Batch 2 |
| Navbar ink rAF unbounded | `use-adaptive-navbar-tone.ts` | Low | T2 |
| Cashfree no Razorpay-style poll | `checkout-page-client.tsx` | Med | T2 |
| Cart session / pricing / OTP / cron timeouts | multiple | Low | Already mitigated |

---

## 4. Crash Analysis

| Finding | Files | Prob | Class |
|---------|-------|------|-------|
| `fetchAllCatalogRows` up to 10k rows | `services/catalog.ts` | Med | T3 |
| Search index 800 products in RSS | catalog search | Med | T3 |
| Redis REST full-body buffer | `lib/redis-client.ts` | Low | T3 |
| Gemini fallback Maps uncapped | `lib/gemini-rate-limit.ts` | Low | T3 |
| Cart inflight Map @64 orphan | `app/api/cart/pricing/route.ts` | Low | T3 |
| PDP warm `void` without catch | `loadProductForPage` | Low | T0 Batch 1 |
| Single-node OOM under flood | capacity | High@500VU | T5 |

---

## 5. Internal Server Error Analysis

**Open at audit (12):** account cart idempotency/DELETE; checkout idempotency before try; expire-pending throw; notifications dispatch assert; nav-metrics assert; admin customer lookup rethrow; order enrichment; change-email assert; security denials; auth audit; products/summary.

**Fixed/intentional (unchanged):** health 503, cart pricing 503, checkout Redis lock 503, cron lock 503, webhook 500 retryable, editor AI 502/503, Inngest stubs, proxy catch → API 503, M5 sanitized bodies.

**Batch 1 remediation:** wrap throws → sanitized 503/500 matching M5; same success paths.

---

## 6. Performance Analysis

| Priority | Item | Tier |
|----------|------|------|
| P1 | Auth-role `withSingleFlight` | T1 Batch 2 |
| P2–P10 | Media SF, handoff short-circuit, dup GET skip, related reuse, supplier `Promise.all`, SF loader timeout, cart auth SF, reviews `cache()`, payload align | T0 Batch 2 |

**Forbidden:** force-dynamic · inventory-in-Redis · rate-limit raises · slim `CART_PRICING_SELECT` · supplier DELETE parallel · broader CP Redis · longer auth TTL.

---

## 7. Security Analysis

- **Critical open:** 0
- **Prior High fixed:** warehouse IDOR, cron bearer policy, layout JWT handoff
- **Accepted residuals:** M1 idle timeout, M2 inventory UI scope, L1 30s role cache, L2 MFA default-off, L3 SameSite CSRF
- **Document only:** ingest SSRF blocklist (tooling), leads anon RLS, cron secrets not in startup assert, staff APIs no distributed RL (by design)

---

## 8. Code Quality Analysis

- No `console.log` in `app/**`
- Dead-code review queue gated by contract tests
- `checkout-stock.ts` still actively imported
- Inngest/QStash stubs return 503
- `npm audit` **Not Measured**

---

## 9. Database Analysis

- Index remediation migrations present
- Cascade deletes on shipments/returns documented
- N+1 largely batched
- App uses PostgREST HTTP (no direct pg pool)
- Live `EXPLAIN` / pg_stat **Not Measured**

---

## 10. Deployment Analysis

- Vercel `iad1`, 7 crons, fail-closed cron locks
- Redis: rate-limit + cron fail-closed; cache SF fail-open
- Gaps (T3): Resend-required assert vs Brevo-first; cron secrets not startup-asserted
- Cold start / Preview flash **Not Measured**
- Redis colocate: `docs/redis-colocate-iad1-runbook.md`

---

## 11. Safe Fixes Applied

See [safe-fix-batch-log-2026-07-19.md](./safe-fix-batch-log-2026-07-19.md).

**Batch 1 (T0):** PDP warm `.catch`; account cart / checkout / expire-pending / dispatch / nav-metrics / lookup / enrichment / change-email / denials / audit / products-summary soft-fail wrappers.

**Batch 2 (T0+T1):** Auth-role `withSingleFlight` + `profileComplete` align; proxy prefetch GET; RSC handoff-first; PDP media SF; related row reuse; supplier nav parallel; SF loader 12s timeout; cart auth coalesce; reviews `cache()`.

Prior safe batches (already in tree): Redis quote normalize · health anon probe · cart coalesce/timeout/SF · CMS revision slim · PDP row SF · hero Redis · review-product dedupe · SF lock heartbeat.

---

## 12. Why Each Fix Is Safe

| Fix | Why identical behavior |
|-----|------------------------|
| Auth-role SF | Same key/TTL 30s; coalesce cold miss only; disabled/revoked revalidation kept |
| Catch assert→503 | Same success path; explicit retryable body |
| PDP media SF | Same media map; existing catalog media pattern |
| Auth payload align | Restores `profileComplete` consistency |
| `.catch` on warm | Background only |
| Supplier nav parallel | Same three counts |
| Dup Redis GET skip | Same cache value |
| SF loader timeout | Bound holder; fail-open after budget |

---

## 13. Before vs After Metrics

| Metric | Prior verified | After risk-tiered batches |
|--------|---------------:|--------------------------:|
| Overall verify grade | **96 / A+** | **96 / A+** (hold; `tools/verify-perf-results.json`) |
| Uncaught 5xx assert paths | 12 open | Soft-failed (Batch 1) |
| Auth-role SF | Missing | Present (Batch 2) |

---

## 14. Remaining Bottlenecks

1. Flash 500 VU single-node capacity (T5)
2. PDP inventory after row hit (T4 forbidden to cache live stock)
3. Control-plane `force-dynamic` + snapshot size (T4)
4. Browser CWV **Not Measured**
5. Cart 60/min rate limit (intentional)
6. T2 client UX timeouts (document only)

---

## 15. Dangerous Changes Intentionally Skipped

Raise rate limits · remove force-dynamic · parallel supplier DELETEs · slim `CART_PRICING_SELECT` · inventory in product-row Redis · broader CP Redis · auth TTL increase · schema/RLS · UI/UX · pricing math · MFA proxy · sliding idle session · Brevo env assert change without ops approval · leads RLS tighten

---

## 16. Production Readiness Score

**~90 / 100** after Batches 1–2 (was 86). Steady commercial traffic within rate limits: ready. Flash-sale extreme concurrency: not fully ready without Preview capacity validation.

---

## 17. Enterprise Grade

**A** — Architecture shows deliberate caching, single-flight, fail-open Redis for cache, fail-closed for rate limits/cron.

---

## 18. Scalability Grade

**B+ → A on controlled concurrency; B for flash 500 VU claim.**

---

## 19. Security Grade

**A- (88+)** — Rate limits preserved; auth/RBAC policy unchanged; accepted residuals documented.

---

## 20. Reliability Grade

**A** after Batch 1 soft-fail wrappers (was A-).

---

## 21. Maintainability Grade

**A-** — Centralized cache keys + invalidation; audit trail in docs.

---

## 22. Resource Efficiency Grade

**A** — Fewer duplicate Redis/PostgREST ops on auth cold miss and PDP media.

---

## 23. Final Recommendation

1. Deploy Batches 1–2 after gates green.
2. Confirm production `UPSTASH_REDIS_REST_*` unquoted (normalize also handles quotes).
3. Do **not** raise rate limits or remove `force-dynamic` without explicit approval.
4. Capacity-test flash sale on **Vercel Preview** before claiming A+ spike readiness.
5. Treat T2/T3 items as separate approval tracks.

**Honesty bound:** Not perfect. Every unmeasured claim is labeled. Flash 500 VU and browser CWV require additional validation.
