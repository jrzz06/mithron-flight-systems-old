# Performance baseline — 2026-07-18

Pre-optimization Stage 0 snapshot for the Production-Safe Optimization Rollout.

## Method

- **TTFB proxy:** `HEAD` request round-trip (Windows client → Vercel → response headers).
- **Production URL:** `https://final-mithron-deploy.vercel.app`
- **Sentry:** Client/server configs call `initSentry()` via `@/lib/sentry`; `next.config.ts` wraps with `withSentryConfig`. Runtime DSN depends on env (`SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`) — treat as available for post-deploy regression monitoring when configured.

## Production HEAD latency (2026-07-18 evening remeasure)

| Route | Status | Round-trip |
| --- | --- | --- |
| `/` | 200 | ~802 ms (was ~3004 ms morning) |
| `/products` | 200 | ~970 ms |
| `/category/agri-drones` | 200 | ~516 ms |
| `/product/agrione-x1` | 200 | ~448 ms |

See also `docs/perf-action-baseline-2026-07-18.md` for full action matrix.


## Comparison to 2026-07-09 baseline

| Route | 2026-07-09 | 2026-07-18 |
| --- | --- | --- |
| `/` | ~3088 ms | ~3004 ms |
| `/products` | ~1118 ms | ~824 ms |
| `/category/agri-drones` | ~1668 ms | ~423 ms |
| `/product/agrione-x1` | ~1083 ms | ~453 ms |

## Static scores (from full-static-performance-audit-2026-07-18)

| Dimension | Score |
| --- | --- |
| Performance | 42 / 100 |
| Stability | 58 / 100 |
| Scalability | 48 / 100 |

## Rollback levers confirmed

- Vercel prior-deployment re-promote
- `git revert` per one-fix commit
- Additive DB migrations with paired drop/rollback SQL
