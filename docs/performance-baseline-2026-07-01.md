# Mithron Storefront Performance Baseline

**Date:** 2026-07-01  
**Production URL:** https://final-mithron-deploy.vercel.app  
**Scope:** Customer storefront routes

## Production TTFB (curl, cold)

| Route | HTTP | TTFB | Total |
|-------|------|------|-------|
| `/` | 200 | 1.36s | 4.46s |
| `/products` | 200 | 1.31s | 4.07s |
| `/search?q=drone` | 200 | 1.11s | 1.56s |
| `/cart` | 200 | 0.72s | 0.75s |
| `/checkout` | 200 | 0.76s | 0.79s |

## Known bottlenecks (pre-optimization)

1. Full-catalog fetch on `/products` default view
2. Interest pages load entire catalog then filter in memory
3. PDP sequential media lookups; metadata + page duplicate fetches
4. Duplicate `/api/cart/pricing` from multiple `useResolvedCart` instances
5. Search index cold load on first overlay open
6. Product gallery renders all slides in DOM
7. Missing route-level `loading.tsx` on PDP, search, category
8. Large `globals.css` (~3,740 lines) parsed on every page

## Tooling available

- `npm run analyze` — bundle analyzer (webpack)
- `npm run build` — production build + chunk sizes
- `tools/run-load-test.mjs` — autocannon load tests
- Web Vitals via `ObservabilityProvider` + `lib/observability.ts`

## Notes

Local production build baselines should be captured after `npm run build && npm start` using the same curl/Lighthouse commands. Post-optimization metrics belong in `docs/performance-report-2026-07-01.md`.
