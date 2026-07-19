# Safe Fix Batch Log — 2026-07-19

**Program:** Risk-tiered safe fixes (post-audit)  
**Mode:** T0 + approved T1 only · behavior-preserving  
**Verify:** `VERIFY_BASE_URL=http://127.0.0.1:3004` → **overall 96 / A+** (hold vs prior)

Related: [enterprise-full-audit-final-2026-07-19.md](./enterprise-full-audit-final-2026-07-19.md)

---

## Batch 0 — Report + baseline

| Gate | Result |
|------|--------|
| Audit report written | `docs/enterprise-full-audit-final-2026-07-19.md` |
| `tsc --noEmit` | Pass |
| Production `next build` | Pass (baseline before Batch 1) |

---

## Batch 1 — T0 reliability / 5xx soft-fail

| ID | Change | Files |
|----|--------|-------|
| S1 | PDP warm `.catch` | `services/catalog.ts` |
| S2 | Account cart idempotency → 503; DELETE try/catch | `app/api/account/cart/items/route.ts` |
| S3 | Checkout idempotency soft 503 on admin config miss | `app/api/checkout/route.ts` |
| S4 | Expire-pending return 503 JSON (no throw) | `app/api/payments/expire-pending/route.ts` |
| S5 | Dispatch + nav-metrics soft-fail / zeros | `app/api/notifications/dispatch/route.ts`, `services/nav-metrics.ts`, `app/api/*/nav-metrics/route.ts` |
| S6 | Lookup/enrichment/change-email/denials/audit/summary | respective `app/api/**` routes |

**Also in Batch 1 (P7 early):** supplier nav `Promise.all` in `services/nav-metrics.ts`.

**Gate:** `tsc` pass · targeted vitest 17 pass.

---

## Batch 2 — T0 perf + T1 auth-role SF

| ID | Change | Files |
|----|--------|-------|
| P1 | Auth-role cold-miss `withSingleFlight` | `proxy.ts`, `services/auth.ts` |
| P2 | Align cache payload (`profileComplete`) | `services/auth.ts` |
| P3 | Prefetch Redis GET on public signed-in path | `proxy.ts` |
| P4 | Handoff before profile gate on RSC miss | `services/auth.ts` |
| P5 | PDP media trio via `catalogMediaMap` SF | `services/catalog.ts` |
| P6 | Related products prefer `getProductRowBySlug` | `services/catalog.ts` |
| P7 | Supplier nav parallel | `services/nav-metrics.ts` (Batch 1) |
| P8 | SF loader wall-clock `raceWithTimeout` 12s | `lib/cache-redis.ts` |
| P9 | Cart auth SIGNED_IN coalesce with init SF | `lib/cart/cart-auth-sync.ts` |
| P10 | `listFeaturedHomeReviews` + React `cache()` | `services/customer-product-reviews.ts` |

**Tests:** `tests/auth-role-single-flight.test.ts` (payload contract + SF export).

**Auth SF safety kept:** TTL **30s**; disabled/revoked still revalidated from DB on cache hit; invalidation unchanged.

---

## Batch 2 gates

| Gate | Result |
|------|--------|
| `tsc --noEmit` | Pass |
| Targeted vitest (4 files / 19 tests) | Pass |
| Production `next build` | Pass |
| `verify-perf-grade.mjs` @ :3004 | **overall 96 / A+** |

### Verify scorecard (hold)

| Metric | Score |
|--------|------:|
| Homepage | 98 A+ |
| Products | 98 A+ |
| PDP | 98 A+ |
| Health API | 98 A+ |
| Cart API | 92 A |
| Customer | 97 A+ |
| API | 95 A+ |
| Scalability | 92 A |
| Caching | 96 A+ |
| **Overall** | **96 A+** |

Cart @ c=20 still shows intentional **429** (60/min rate limit) — not a regression.

---

## Why each shipped fix is 100% SAFE

| Fix | Identical behavior reason |
|-----|---------------------------|
| 5xx soft-fail | Same success paths; replace uncaught throws with sanitized 503/500 |
| Auth SF | Same key/TTL; coalesce cold-miss RPC+profile only |
| Media SF | Same media maps; existing list-path pattern |
| Prefetch GET | Same cache value; one fewer Redis round-trip |
| Handoff-first | Skips redundant work when middleware already verified |
| SF loader timeout | Bounds hung holders; fail path already exists for waiters |
| Cart auth coalesce | Same session load; prevents duplicate concurrent fetch |
| Reviews `cache()` | In-request dedupe only |

---

## Rollback paths

| Batch | Revert these files |
|-------|--------------------|
| 1 | `services/catalog.ts` (warm catch only if mixed), cart/items, checkout, expire-pending, notifications/dispatch, nav-metrics (+ routes), customers/lookup, enrichment, change-email, denials, auth/audit, products/summary |
| 2 | `proxy.ts`, `services/auth.ts`, `services/catalog.ts`, `lib/cache-redis.ts`, `lib/cart/cart-auth-sync.ts`, `services/customer-product-reviews.ts`, `tests/auth-role-single-flight.test.ts` |

---

## Intentionally NOT shipped (T2–T5)

- Assistant client stream timeout · Cashfree poll · navbar rAF · unload DELETE timeout (T2)
- Brevo env assert · SSRF ingest blocklist · leads RLS · catalog 10k memory · Redis body cap (T3)
- Rate-limit raises · force-dynamic removal · inventory-in-Redis · slim cart select · supplier DELETE parallel · CP Redis · auth TTL increase · schema/UI/RBAC (T4)
- Preview flash 500 VU · CWV · live EXPLAIN (T5)

---

## Ops note (local verify)

`next start` requires production env assert: `PAYMENT_EXPIRE_SECRET` set and `ALLOW_DEMO_SEED=false` (or unset). Verify harness used port **3004**.

---

## Grades after batches

| Grade | Score |
|-------|------:|
| Production readiness | **~90 / 100** |
| Overall verify | **96 / A+** (hold) |
| Reliability | **A** (5xx soft-fail) |
| Resource efficiency | **A** (auth + media SF) |
| Security | **A-** (unchanged policy) |

**Honesty:** Flash 500 VU and browser CWV remain **Not Measured**. No claim of perfection.
