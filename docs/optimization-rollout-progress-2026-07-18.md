# Optimization rollout progress — 2026-07-18

Implementation of [Production-Safe Optimization Rollout](../docs/full-static-performance-audit-2026-07-18.md) remediation stages.

## Stage 0 baseline (HEAD latency)

| Route | Status | Ms |
| --- | --- | --- |
| `/` | 200 | ~3004 |
| `/products` | 200 | ~824 |
| `/category/agri-drones` | 200 | ~423 |
| `/product/agrione-x1` | 200 | ~453 |

See [performance-baseline-2026-07-18.md](./performance-baseline-2026-07-18.md).

## Completed stages

| Stage | Status | Notes |
| --- | --- | --- |
| 0 Baseline | Done | Latency + Sentry config confirmed |
| 1 Client stability | Done | Cart timeouts, pricesPending on error, pricing/search fetch timeout, Razorpay poll cap |
| 2 Read-path slim | Done | Shell CMS light, homepage hero stream, Suspense pages, cms-resolver page_id, blog teaser, search index slim, productCoreSelect, proxy profileComplete cache |
| 3 Control plane | Done | Dedupe @shell auth, snapshot limit params, dispatch single revalidate, metrics RPCs, parallel notifies |
| 4 Images | Done | Parallel variant uploads, login hero single fetch; PNG prune **skipped** (audit: PNG still ACTIVE) |
| 5 Bundles | Done | Dynamic catalog listing, assistant panel, editor-display.css, nav mega-menu/drawer; H8 remote-map **skipped** (client imports) |
| 6 Redis/DB | Done | Atomic Gemini TPM, auth-lockout fewer hops, Lua lock release, trigram indexes, RLS initplan |
| 7 Polish | Done | Dead export removal, Sentry widenClientFileUpload false, TipTap optimizePackageImports, dead store-shell deleted |

## Migrations to apply (additive)

```
supabase/migrations/20260818000100_perf_metrics_rpcs.sql
supabase/migrations/20260818000200_enquiries_trgm_indexes.sql
supabase/migrations/20260818000300_rls_auth_uid_initplan.sql
```

Apply with:

```bash
npm run db:push:dry-run
npm run db:push
```

Rollback SQL is documented in each migration file / PR comments pattern.

## Intentionally skipped (documented)

1. **M13 PNG prune** — asset audit shows PNG masters still ACTIVE runtime sources.
2. **H8 server-only remote map** — `resolve-storefront-src` is imported by client image components; full split needs a follow-up.
3. **H3 deep PDP select split** — gallery/variants/bundles required on first paint; `productCoreSelect` wired for core-cache path only.

## Validation

- `npm run typecheck` — pass
- Targeted vitest (catalog search, login hero, proxy fast-path, cms-resolver, navigation mega-menu, supabase free-plan perf) — run after implement

## Next ops steps (human)

1. Open PR → Vercel Preview smoke (cart hang throttle, homepage, admin dispatch, login).
2. `db:push` migrations in low-traffic window.
3. Bake per stage windows before promoting further risky changes.
4. Re-measure HEAD latency vs Stage 0 baseline after production deploy.
