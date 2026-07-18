# Phase 2 Infra Recommendations — 2026-07-18

Code remediations from Production Hardening Phase 2 are in the application. The items below still need human ops / provisioning.

## Circuit breaker (opossum) — not added this pass

**Decision:** Do not add `opossum` (or similar) in this pass.

**Why:**
- Timeouts are now applied uniformly via `fetchWithTimeout` / `supabaseFetch` / AbortSignal budgets.
- Fail-closed Redis locks and distributed rate limits already reject on backend outage for abuse-sensitive paths.
- A process-wide circuit breaker needs careful per-dependency configuration (Supabase vs Razorpay vs Gemini), shared state across serverless isolates, and observability hooks we do not yet have provisioned.
- Adding opossum without a shared store would flake per-instance and risk false opens during cold starts.

**Follow-up:** After Preview load tests, evaluate a Redis-backed breaker only for payment webhooks and Gemini if error rates justify it.

## QStash / Inngest provisioning

Phase 2 adds `scheduleBackgroundWork()` in `lib/jobs/queue-provider.ts` — fire-and-forget / `after()` deferred work when durable queues are not configured. Notification email and order-confirmation email no longer block webhook/hot paths.

**To provision durable delivery:**

1. Choose provider: set `MITHRON_JOB_QUEUE_PROVIDER=qstash` or `inngest`.
2. **QStash:** create Upstash QStash token → `QSTASH_TOKEN`; wire signing secrets; confirm `/api/jobs/qstash` is deployed.
3. **Inngest:** set `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY`; confirm `/api/inngest` is deployed.
4. Move `scheduleBackgroundWork` callers (notification email, order confirmation email) to enqueue durable jobs once the provider is live.
5. Verify retries and dead-letter monitoring in the provider dashboard.

Until then, deferred work is best-effort within the serverless isolate (logged on failure).

## CDN — media origin

Set the public media CDN origin so storefront assets bypass origin bandwidth:

```bash
# Vercel project env (Production + Preview)
NEXT_PUBLIC_MEDIA_CDN_ORIGIN=https://your-cdn-host.example
```

Redeploy after setting. Confirm product/catalog images resolve through the CDN host in Network tab.

## Database migrations (20260818*)

Three migrations dated `20260818*` should be applied after dry-run:

```powershell
cd d:\mithuuu\mithuuu
npm run db:push:dry-run
# review SQL output, then:
npm run db:push
```

Do not skip dry-run on production-linked projects.

## Extended load test against Preview

Tooling lives in `tools/run-load-test.mjs` and `tools/generate-load-test-report.mjs`.

```powershell
# Help / scenario notes
node tools/run-load-test.mjs --help

# Full run against Vercel Preview (required for meaningful results)
$env:LOAD_TEST_BASE_URL = "https://YOUR-PREVIEW.vercel.app"
$env:LOAD_TEST_FLASH_SALE = "1"
node tools/run-load-test.mjs
node tools/generate-load-test-report.mjs
```

**Included scenarios:** homepage, health, catalog, `/category/agri-drones`, PDP, cart pricing POST, checkout status dry-check (expects 400 without `orderId`), optional flash-sale 80/20 hot-PDP spike.

**Not load-tested:** `POST /api/checkout` (needs auth/audit token + cart body). Use dry-check + health instead.

Local full run needs `npm run build && npm run start` first; without a live server the script exits early (by design).

## Expected score after code pass vs remaining gap

| Area | After Phase 2 code | Remaining gap (ops) |
|------|--------------------|---------------------|
| Hung external I/O | Bounded with timeouts | Monitor p95 timeout/error rates |
| Checkout idempotency | Fail-closed Redis lock | Redis must be provisioned in production |
| Distributed rate limits | Fail-closed (+ Postgres fallback) | Keep Upstash Redis healthy |
| Admin list scale | Server pagination/filters | Tune page sizes; watch PostgREST plans |
| Load evidence | Tooling ready | Run against Preview; attach report |
| Notifications / email | Off hot path (deferred) | QStash/Inngest for durable retries |
| Circuit breakers | Not added | Optional post-load-test |
| Media CDN | Code expects env | Set `NEXT_PUBLIC_MEDIA_CDN_ORIGIN` |
| Migrations | Code assumes schema | `db:push` for 20260818* |

**Rough readiness:** application hardening is largely complete for Flipkart/Amazon-class timeout/fail-closed/pagination concerns. Remaining production risk is **ops completeness** (Redis, CDN, migrations, Preview load proof, durable job queue)—not missing code paths from this pass.

## Synthetic health cron

`vercel.json` includes `*/5 * * * *` → `/api/health`.

- Unauthenticated cron still receives `{ status: "ok" | "degraded" }` (shallow).
- For rich diagnostics, set `HEALTH_CHECK_SECRET` to match Vercel’s `CRON_SECRET` bearer (or a dedicated secret accepted by `authorizeBearerSecret`).
- Confirm in Vercel → Cron Jobs that the schedule is active after deploy.
