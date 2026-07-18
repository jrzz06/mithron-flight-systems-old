# Production-safe rollout — final report — 2026-07-18

Branch: [`perf/production-safe-rollout-review`](https://github.com/jrzz06/mithron-flight-systems-old/pull/1)  
Base: `de5864a` (`main`)  
PR: https://github.com/jrzz06/mithron-flight-systems-old/pull/1

## What shipped (code)

| Batch | Result |
| --- | --- |
| 0 Baseline | Production GET latency + Redis SCAN captured |
| 1 Verify | `typecheck` pass, `build` pass, 81/81 targeted vitest pass |
| 2 Branch + PR | 8 logical commits + follow-up stability commit |
| 3 Migrations | **Dry-run OK — apply blocked pending your explicit go-ahead** |
| 4 Gaps | Redis health probe, webhook fail-claim, SoftErrorBoundary expansion |
| 5 Redis audit | Read-only; TTL=-1 ratelimit keys flagged (no flush) |
| 6 Load test | Local before/after quick+flash (see below) |
| 7 Report | This document |

### Key safety fixes

- Checkout idempotency: Redis unavailable → **503** (fail-closed)
- Rate limits: production fail-closed (no silent in-memory)
- Failed payment webhooks: claim `event_id` **before** reconcile
- `/api/health`: pings **Supabase + Redis**; 503 when Redis required but down
- SoftErrorBoundary on cart/search/assistant/hero/shelves/testimonials/admin orders

### Checkout RPC atomicity (verified)

`create_checkout_order` remains a single PL/pgSQL transaction (order + items + `reserve_checkout_stock`). Post-RPC gateway intent + payment row are still multi-step with cancel compensation (documented, not rewritten).

### External I/O timeouts

Audit found **no missing timeouts** on Razorpay/Cashfree/Brevo/Resend/MailerSend/Gemini/Groq/OpenRouter/Cerebras callers.

## Baseline — production GET (before deploy)

| Route | Avg ms (3 samples) |
| --- | ---: |
| `/` | 4264 |
| `/products` | 2927 |
| `/category/agri-drones` | 2151 |
| `/product/agrione-x1` | 977 |
| `/cart` | 988 |
| `/checkout` | 1064 |
| `/api/health` | **503** degraded |

Source: [`docs/performance-baseline-rollout-2026-07-18.md`](./performance-baseline-rollout-2026-07-18.md)

## Local load test — peak 200 concurrent (p50 / p99)

| Route | Before p50→After | Before p99→After |
| --- | --- | --- |
| `/` | 1046 → **885** | 3414 → **1723** |
| `/category/agri-drones` | 1028 → **874** | 1986 → **1198** |
| Hot PDP | 1021 → **874** | 1408 → **1195** |
| Checkout status p95 | 1278 → **1038** | — |
| Cart pricing p95 | 1408 → **1103** | — |

Full tables: [`docs/load-test-before-after-2026-07-18.md`](./load-test-before-after-2026-07-18.md)

## Redis (production, read-only)

| Metric | Value |
| --- | --- |
| DBSIZE | 359 |
| catalog / cms / ratelimit | 4 / 2 / 352 |
| Issue | Many `ratelimit:*` keys have **TTL=-1** (memory growth risk) |

Do **not** flush. Ops: expire orphaned immortal keys after review. Details: [`docs/redis-audit-rollout-2026-07-18.md`](./redis-audit-rollout-2026-07-18.md)

## Migrations — awaiting your go-ahead

Dry-run against project `ictnoydmxlywwxwnugal` succeeded. Would apply:

1. `20260818000100_perf_metrics_rpcs.sql` — metrics RPCs  
2. `20260818000200_enquiries_trgm_indexes.sql` — pg_trgm GIN indexes  
3. `20260818000300_rls_auth_uid_initplan.sql` — `(select auth.uid())` initplan wraps  

**To apply (you must confirm in chat first):**

```powershell
cd d:\mithuuu\mithuuu
npm run db:push
```

## Ops-only action list (you run these)

```powershell
# 1) Media CDN (Vercel Production + Preview env)
# NEXT_PUBLIC_MEDIA_CDN_ORIGIN=https://your-cdn-host.example

# 2) Durable jobs (pick one)
# MITHRON_JOB_QUEUE_PROVIDER=qstash   # + QSTASH_TOKEN
# or MITHRON_JOB_QUEUE_PROVIDER=inngest # + INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY

# 3) Fair network load test on Preview (after PR Preview deploys)
$env:LOAD_TEST_BASE_URL = "https://YOUR-PREVIEW.vercel.app"
$env:LOAD_TEST_FLASH_SALE = "1"
# omit LOAD_TEST_QUICK for full 100/500/1000 × 200s
node tools/run-load-test.mjs --flash-sale
node tools/generate-load-test-report.mjs

# 4) Upstash dashboard: hit ratio, memory, immortal ratelimit keys

# 5) Health cron secret (optional rich diagnostics)
# HEALTH_CHECK_SECRET=<same as CRON_SECRET bearer>
```

## Explicit non-goals honored

- No push to `main`
- No DB apply without confirmation
- No Redis writes/deletes/flushes
- No load test against production URL
- No business-logic rewrites

## Suggested next message from you

Reply **`apply migrations`** to run `npm run db:push`, or **`skip migrations`** to close Batch 3 without applying.
