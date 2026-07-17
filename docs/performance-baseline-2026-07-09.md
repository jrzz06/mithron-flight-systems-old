# Performance baseline — 2026-07-09

Pre-optimization measurements against production (`https://final-mithron-deploy.vercel.app`) before Batch A–G rollout in this session.

## Method

- **TTFB proxy:** `HEAD` request round-trip (Windows client → Vercel edge → response headers). Not identical to Lighthouse TTFB but useful for relative comparison.
- **Lighthouse:** Run locally against production URLs with Chrome Lighthouse (mobile + desktop) after deploy for LCP/CLS/TBT.
- **Prior reports:** [performance-report-2026-07-01.md](./performance-report-2026-07-01.md), [performance-report-2026-07-04.md](./performance-report-2026-07-04.md)

## Production HEAD latency (2026-07-09)

| Route | Status | Round-trip |
| --- | --- | --- |
| `/` | 200 | ~3088 ms |
| `/products` | 200 | ~1118 ms |
| `/category/agri-drones` | 200 | ~1668 ms |
| `/product/agrione-x1` | 200 | ~1083 ms |

## Known bottlenecks (pre-fix)

1. **Search index** — `getCatalogSearchIndex` paginated full catalog (up to 10k rows).
2. **Showroom** — `getCatalogShowroomProducts` fanned out to 7× category scans.
3. **Media** — global 2000-row primary media lookup when `scopeToRows` was false.
4. **CMS resolver** — `cache: "no-store"` on orchestration fetches.
5. **Inventory** — `no-store` on all catalog stock overlays.
6. **Client bundle** — wide image client boundary; monolithic homepage composite CSS on PDP shelves.
7. **Prefetch** — duplicate search index preload from shell + nav.

## Post-optimization validation checklist

- [ ] Re-run HEAD table above; expect `/products` and search overlay improvement first.
- [ ] Lighthouse mobile on `/`, `/products`, `/category/agri-drones`, sample PDP — target LCP &lt; 2.5s, CLS &lt; 0.1.
- [ ] `npm run build` clean.
- [ ] `vitest run tests/supabase-free-plan-performance.test.ts tests/catalog-search-api.test.ts`.
- [ ] Manual: search overlay, cart drawer, checkout stock, CMS publish invalidation.
