# Redis & CDN Performance Audit (Mithron)

**Date:** 2026-07-24  
**Scope:** Admin, Customer (storefront), Supplier, Warehouse panels  
**Constraint:** Zero cross-panel cache leakage; Customer price/stock freshness ≤ agreed TTL window; staging-verified before prod.

## Architecture summary

| Panel | Routes | Rendering | Redis domains |
|-------|--------|-----------|---------------|
| Customer | `app/(storefront)/*` | ISR (tuned) | `catalog:*`, `cms:*`, `product:*` |
| Admin | `app/admin/*` | `force-dynamic` + `private, no-store` | `cp:*`, `metrics:admin-nav:*`, `auth:role:*` |
| Supplier | `app/supplier/*` | `force-dynamic` + `private, no-store` | `metrics:supplier-nav:{id}`, `auth:role:*` |
| Warehouse | `app/warehouse/*` | `force-dynamic` + `private, no-store` | `cp:warehouse-snapshot:*`, `metrics:warehouse-nav:*` |

Shared Redis: **Upstash REST** (not self-hosted). Eviction/persistence are platform-managed — do not invent Redis.conf changes. Jobs use Inngest / cron locks, not durable Redis queues.

Co-location: Vercel Functions `iad1` ↔ Upstash `us-east-1` — see [redis-colocate-iad1-runbook.md](./redis-colocate-iad1-runbook.md).

## Redis inventory (TTLs)

| Workload | Key pattern | TTL | Stampede |
|----------|-------------|-----|----------|
| Catalog search index | `catalog:search-index:v1` | 120s | single-flight |
| Showroom / category | `catalog:showroom:*`, `catalog:category:*` | 45s | yes |
| Product row | `catalog:product-row:*` | 60s | yes |
| **Product core (price/stock summary)** | `product:core:*` | **45s** | yes |
| **Product page (PDP coalesce)** | `product:page:*` | **45s** | yes |
| Cart pricing | `catalog:cart-pricing:*` | 30s | yes |
| CMS / homepage | `cms:homepage\|shell\|hero` | 60s | yes; incomplete not cached |
| Auth role | `auth:role:{userId}:{sessionIat}` | 30s | role/disabled only |
| Control plane | `cp:*` | loader + Next ~30s | selective invalidate |
| Nav metrics | `metrics:{panel}-nav*` | short | panel-scoped |
| Rate limits | `ratelimit:*` | window | Postgres fallback |
| Locks | `lock:*`, `idempotency:*` | seconds–minutes | cron fail-closed |
| OTP / email burst | `otp:cooldown:*`, `email:burst:*` | 30–60s | cooldown only |

**Allowed key prefixes** (contract): `catalog:`, `cms:`, `product:`, `auth:`, `metrics:`, `cp:`, `ratelimit`, `lock:`, `otp:`, `email:`, `idempotency:`, `gemini:` — enforced by tests via `isAllowedRedisCacheKeyPrefix`.

### Sensitive data

- Sessions live in **Supabase cookies**, not Redis.
- Auth Redis cache stores **role + disabled flags only** — not tokens/PII.
- Cart pricing is fingerprint-keyed, short TTL — not user-id keyed.
- Panel dashboards must never be CDN-cached (headers + `force-dynamic`).

## CDN inventory

| Surface | Cache | Notes |
|---------|-------|-------|
| `/cdn-media/*` | `s-maxage=86400` + SWR 1d | Edge media proxy; **prefer new storage path on replace** to avoid stale overwrite |
| `/optimized|/media|/assets` | 1y immutable | Hashed/static only |
| `next/image` | AVIF/WebP, min TTL 30d | OK |
| Storefront HTML | ISR **30s** on product/category/products | Tag revalidate remains primary |
| Admin/Supplier/Warehouse/Account/Operations | `private, no-store` | Defense-in-depth |
| `/api/catalog/search?intent=index` | `s-maxage=60` | Public index only |
| Other catalog search intents | `private, no-store` | No edge cache |

## Cross-panel safety

| Scenario | Behavior |
|----------|----------|
| Admin/Supplier product write | `revalidateCatalogSurfaces` → Next tags + Redis catalog/product delete |
| Warehouse stock write | Catalog revalidate + warehouse `cp:warehouse-snapshot` invalidate — **distinct keys** |
| Auth user A vs B | Distinct `auth:role:{userId}:{iat}` |
| Invalidate product X | Must not delete `cp:warehouse-snapshot:*` or `metrics:supplier-nav:*` |

Shared `catalog:*` / `product:*` is intentional (single Customer-facing truth). Do not split into `customer:catalog` if Admin must invalidate the same keys.

## Before / after targets

| Metric | Before | After target |
|--------|--------|--------------|
| Redis GET RTT (co-located warm) | 20–60ms | Keep &lt;50ms p50 |
| Storefront catalog Redis hit ratio | variable | ≥85% warm traffic |
| Customer price/stock freshness (happy path) | invalidate + ≤90s Redis | invalidate + ≤**45s** Redis / ≤**30s** ISR |
| DB load on warm catalog/CMS | high on miss | −40–60% vs uncached |
| CDN image TTFB vs origin Storage | origin-bound | −40–70% on warm edge |
| Cross-panel collisions | 0 known | 0 — prefix + tests |

## Rollout order

1. Measure: authenticated `/api/health` `redis.latencyMs`; soak `getRedisTimingStats()`.
2. CDN/panel `no-store` headers + catalog search intent headers + `/cdn-media` 1d edge TTL.
3. Namespace allowlist tests (no key rename big-bang).
4. Product Redis TTL 45s + product/category ISR 30s.
5. Staging checklist below → production.

## Risk & rollback

| Change | Risk | Rollback |
|--------|------|----------|
| Panel `no-store` headers | Negligible | Revert `next.config.ts` headers |
| `/cdn-media` 7d→1d s-maxage | Slightly more Storage bandwidth | Restore 604800 |
| Product TTL 90→45 | More DB on miss storms; SF mitigates | Restore 90 in `services/catalog.ts` |
| ISR 60→30 (product/category) | More regenerations | Restore `revalidate = 60` |
| Upstash rotate | Cold cache | Restore prior REST URL/token (runbook) |

## Staging checklist (gate)

1. Redis `latencyMs` &lt; 100 warm; circuit not flapping.
2. Customer homepage + PDP warm hit (timing / stats).
3. Admin price edit → Redis keys gone → Customer PDP within 45s window.
4. Warehouse stock edit → warehouse UI refresh; Customer availability updated; Admin not served warehouse payload keys.
5. Supplier update → Customer catalog invalidate; only that supplier’s nav metrics cleared.
6. `/admin`, `/supplier`, `/warehouse`, `/account` responses include `Cache-Control: private, no-store`.
7. Concurrent Admin + Warehouse SKU update: no cross-key overwrite; at most brief stale within TTL.
8. Media replace uses **new path** or is visible within 1d edge TTL.
9. Rollback drill: promote previous Vercel deployment; `/api/health` green.

## Observability

- Process stats: `getRedisTimingStats()` (hits/misses/timeouts/buckets) in [`lib/redis-client.ts`](../lib/redis-client.ts).
- Weekly cron: `/api/admin/prune-redis-ttls` (immortal `ratelimit:*` keys).
- Authenticated health probe for Redis latency (see co-locate runbook).
