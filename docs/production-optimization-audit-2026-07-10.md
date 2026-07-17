# Production Optimization Audit — 2026-07-10

**Project:** Mithron Flight Systems (`mithuuu`)  
**Production URL:** `https://final-mithron-deploy.vercel.app`  
**Scope:** Full codebase audit — performance and cost only (no redesign, no security audit, no business-logic changes)  
**Deliverable:** Report only — no code changes applied in this session

---

## Executive Summary

This audit re-analyzed the entire application from scratch using automated tooling (knip, depcheck, dead-code-audit, typecheck), parallel deep-dives across `app/`, `components/`, `sections/`, `features/`, `lib/`, `services/`, `config/`, `supabase/`, and `public/`, plus cross-reference against prior optimization work documented in `docs/performance-*.md` and `docs/dead-code-audit/`.

### Stack snapshot

| Area | Count / size |
|------|----------------|
| Source files (app/components/sections/features/lib/services/hooks/store/config) | ~970 |
| `app/` routes | 235 files |
| Client components (`"use client"`) | ~200 |
| `next/image` import sites | 22 (mostly admin) |
| `public/` assets | 32 files, ~2.7 MB |
| Supabase migrations | 113+ |
| Prior dead-code removals | 32 files (~1,454 LOC) |

### What is already well-optimized

- **Image delivery:** Storefront uses role-capped `MithronResponsiveImage` primitives (thumb 384px → page hero 1920px) with AVIF/WebP `picture` srcsets; `next.config.ts` has 30-day image cache TTL and immutable headers for `/media`, `/assets`, `/optimized`.
- **Fonts:** `Inter` + `Outfit` via `next/font/google` with `display: swap` — no runtime Google Fonts requests.
- **Request deduplication:** `React.cache()` on `getHomepageBundle`, `loadProductForPage`, `getEnterpriseMenuProducts`, `getStorefrontShellCms`, `getCurrentAuthContext`.
- **CMS/catalog caching:** Tagged `revalidate: 60` on public CMS and catalog fetches (not blanket `no-store`).
- **PDP streaming:** Reviews and related products in Suspense with skeletons; `LazyHydrate` defers below-fold hydration.
- **Code splitting:** Hero carousel, cart, checkout, search overlay, admin workspaces use `next/dynamic`.
- **Search index HTTP cache:** `/api/catalog/search?intent=index` returns `Cache-Control: public, s-maxage=300, stale-while-revalidate=600`.
- **No animation libraries:** Zero GSAP/Framer Motion in production; CSS/native motion only.
- **Realtime multiplexing:** `shared-enterprise-realtime.ts` ref-counts one Supabase channel per scope.
- **Cart pricing dedup:** Inflight promise cache in `store/cart-pricing.ts`.

### Top opportunities (aggregate estimates)

| Priority | Findings | Est. TTFB/LCP gain | Est. Supabase read reduction | Est. bundle/bandwidth |
|----------|----------|--------------------|------------------------------|------------------------|
| **P0** | 6 | 300–800 ms on `/`, PDP, search | 40–60% on homepage + search | 200–800 KB/search session |
| **P1** | 18 | 100–400 ms per affected route | 20–50% on catalog/admin | 50–300 KB/route |
| **P2** | 16 | 20–100 ms incremental | 5–15% | 10–150 KB |

### Redis note

There is **no `redis` npm package**. Rate limiting uses **Upstash Redis REST** (`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`) in [`lib/rate-limit-redis.ts`](../lib/rate-limit-redis.ts). Production currently **fail-opens** when Upstash is unconfigured (allows requests). Redis memory findings apply only when Upstash is configured.

---

## Methodology

```mermaid
flowchart LR
  tooling[Knip Depcheck TSC DeadCodeAudit] --> agents[5 Parallel Deep-Dives]
  agents --> dedupe[Cross-Reference Dedupe]
  dedupe --> report[40 Consolidated Findings]
```

**Tools run:** `npm run audit:knip`, `npm run audit:depcheck`, `npm run typecheck`, `node tools/dead-code-audit.mjs`  
**Knip result:** 13 unused files, 98 unused exports, 4 unused exported types  
**Dead-code audit:** 20 safe candidates, 94 review-queue items, 4 test-referenced unused files

---

## Findings (40 consolidated, deduplicated)

Each finding uses the required 15-field format. **Impact:** P0 = safe + high impact, P1 = safe + moderate, P2 = safe + low/cleanup.

---

### OPT-001 — Storefront layout blocks page streaming behind shell fetch

| # | Field | Value |
|---|-------|-------|
| 1 | **Category** | Next.js — Suspense / streaming |
| 2 | **Impact** | **P0** |
| 3 | **Estimated Performance Gain** | 200–500 ms faster FCP on storefront navigations |
| 4 | **Estimated Bundle Reduction** | 0 KB (rendering architecture) |
| 5 | **Estimated Storage Reduction** | 0 |
| 6 | **Estimated Bandwidth Reduction** | 0 (latency, not bytes) |
| 7 | **Estimated Supabase Cost Reduction** | 0 (same queries, better parallelism) |
| 8 | **Estimated Redis Memory Reduction** | N/A |
| 9 | **Exact File** | [`app/(storefront)/layout.tsx`](../app/(storefront)/layout.tsx) |
| 10 | **Exact Function** | `StorefrontShellContent`, `StorefrontLayout` |
| 11 | **Reason** | `{children}` is nested inside async `StorefrontShellContent` which awaits `getEnterpriseMenuProducts()` + `getStorefrontShellCms()`. Page HTML cannot stream until shell data resolves. |
| 12 | **Production-safe Fix** | Render shell nav/footer and `{children}` as siblings under separate Suspense boundaries. |
| 13 | **Code Patch** | ```tsx\nexport default function StorefrontLayout({ children }) {\n  return (\n    <>\n      <Suspense fallback={<StorefrontShellFallback />}>\n        <StorefrontNavShell />\n      </Suspense>\n      <Suspense fallback={<PageFallback />}>\n        {children}\n      </Suspense>\n    </>\n  );\n}\n``` |
| 14 | **Regression Risk** | Medium — nav/footer may flash before CMS data |
| 15 | **Verification Steps** | Throttle network on `/products`; page skeleton should appear before nav CMS finishes. Compare Vercel Speed Insights FCP. |

---

### OPT-002 — Proxy middleware runs Supabase auth on nearly every request

| # | Field | Value |
|---|-------|-------|
| 1 | **Category** | Network / middleware |
| 2 | **Impact** | **P0** |
| 3 | **Estimated Performance Gain** | 50–200 ms TTFB on anonymous storefront pages |
| 4 | **Estimated Bundle Reduction** | 0 |
| 5 | **Estimated Storage Reduction** | 0 |
| 6 | **Estimated Bandwidth Reduction** | ~2–5 KB/request (auth round-trips) |
| 7 | **Estimated Supabase Cost Reduction** | 30–50% fewer auth/RPC calls on public traffic |
| 8 | **Estimated Redis Memory Reduction** | N/A |
| 9 | **Exact File** | [`proxy.ts`](../proxy.ts) |
| 10 | **Exact Function** | `handleProxyRequest` (~L260–371) |
| 11 | **Reason** | Matcher covers almost all routes. Public PDP/catalog calls `createSupabaseOnRequest` + `auth.getClaims()`. Signed-in users also hit `current_enterprise_role` RPC. |
| 12 | **Production-safe Fix** | Fast-path anonymous storefront: skip Supabase when route is public and no session cookie present. Defer role RPC to protected routes only. |
| 13 | **Code Patch** | ```ts\nif (!shouldProtect && !apiPolicy && !request.cookies.get('sb-access-token')) {\n  return secureNextResponse(request);\n}\n``` |
| 14 | **Regression Risk** | Medium — must not skip auth for session handoff routes |
| 15 | **Verification Steps** | Log proxy duration for `/` logged-out; Supabase dashboard auth request count per page view should drop. |

---

### OPT-003 — PDP auth + profile fetch forces full dynamic rendering

| # | Field | Value |
|---|-------|-------|
| 1 | **Category** | Next.js — caching / Server Components |
| 2 | **Impact** | **P0** |
| 3 | **Estimated Performance Gain** | 100–300 ms PDP TTFB; enables ISR/static for guests |
| 4 | **Estimated Bundle Reduction** | 0 |
| 5 | **Estimated Storage Reduction** | 0 |
| 6 | **Estimated Bandwidth Reduction** | 0 |
| 7 | **Estimated Supabase Cost Reduction** | 1 auth + 0–1 profile query per PDP view eliminated for guests |
| 8 | **Estimated Redis Memory Reduction** | N/A |
| 9 | **Exact File** | [`app/(storefront)/product/[slug]/page.tsx`](../app/(storefront)/product/[slug]/page.tsx) |
| 10 | **Exact Function** | `ProductPage` (L76–89) |
| 11 | **Reason** | `createClient()` + `getClaims()` + conditional `profiles` query runs in page RSC to prefill enquiry form defaults, opting entire PDP out of static/ISR for all users including guests. |
| 12 | **Production-safe Fix** | Keep PDP static/ISR for catalog data; move contact defaults to client island or lazy fetch inside `ProductConfigurator`. |
| 13 | **Code Patch** | ```tsx\n// Remove L76–89 auth block; pass static defaults\ncontactDefaults={{ region: 'India', isGuest: true }}\n``` |
| 14 | **Regression Risk** | Low — signed-in users lose pre-filled phone until client hydrates |
| 15 | **Verification Steps** | `next build`: PDP appears in static/ISR output. Lighthouse LCP on cold CDN cache improves. |

---

### OPT-004 — Homepage awaits full bundle before Suspense can stream

| # | Field | Value |
|---|-------|-------|
| 1 | **Category** | Next.js — Suspense / streaming |
| 2 | **Impact** | **P0** |
| 3 | **Estimated Performance Gain** | 150–400 ms FCP on `/` |
| 4 | **Estimated Bundle Reduction** | 0 |
| 5 | **Estimated Storage Reduction** | 0 |
| 6 | **Estimated Bandwidth Reduction** | 0 |
| 7 | **Estimated Supabase Cost Reduction** | Same total queries; better perceived performance |
| 8 | **Estimated Redis Memory Reduction** | N/A |
| 9 | **Exact File** | [`app/(storefront)/page.tsx`](../app/(storefront)/page.tsx) |
| 10 | **Exact Function** | `HomePage` |
| 11 | **Reason** | `await getHomepageBundle(...)` blocks before rendering Suspense children. Inner Suspense around hero/below-hero never suspends because data is pre-resolved. |
| 12 | **Production-safe Fix** | Move `getHomepageBundle` into async child components so shell streams progressively. |
| 13 | **Code Patch** | ```tsx\n<Suspense fallback={<HomeHeroFallback />}>\n  <HomeHeroAsync searchParams={searchParams} />\n</Suspense>\n``` |
| 14 | **Regression Risk** | Low — same data, better streaming |
| 15 | **Verification Steps** | Chunked HTML response shows hero skeleton before below-fold content. |

---

### OPT-005 — Homepage loads full CMS twice (layout shell + bundle)

| # | Field | Value |
|---|-------|-------|
| 1 | **Category** | Database — duplicate fetches |
| 2 | **Impact** | **P0** |
| 3 | **Estimated Performance Gain** | 100–250 ms on `/` |
| 4 | **Estimated Bundle Reduction** | 0 |
| 5 | **Estimated Storage Reduction** | 0 |
| 6 | **Estimated Bandwidth Reduction** | 50–200 KB Supabase JSON per homepage request |
| 7 | **Estimated Supabase Cost Reduction** | ~50% fewer CMS table reads on `/` |
| 8 | **Estimated Redis Memory Reduction** | N/A |
| 9 | **Exact File** | [`app/(storefront)/layout.tsx`](../app/(storefront)/layout.tsx), [`services/homepage-bundle.ts`](../services/homepage-bundle.ts) |
| 10 | **Exact Function** | `StorefrontShellContent`, `getHomepageBundle` |
| 11 | **Reason** | Layout calls `getStorefrontShellCms()` (nav + footer + admin_settings). Bundle calls `getPublicCmsSnapshot()` (~10 CMS tables). Overlapping tables hit Supabase twice per `/` request. |
| 12 | **Production-safe Fix** | Single shared `cache()` loader for homepage + shell CMS slices, or pass shell CMS from layout context. |
| 13 | **Code Patch** | Merge shell CMS into `getHomepageBundle`; layout reads from shared cached loader on homepage only. |
| 14 | **Regression Risk** | Medium — layout coupling |
| 15 | **Verification Steps** | Log Supabase REST calls on `/`; expect ~50% fewer CMS fetches. |

---

### OPT-006 — Search runs RPC fallback AND full in-memory index on every query

| # | Field | Value |
|---|-------|-------|
| 1 | **Category** | Database / search |
| 2 | **Impact** | **P0** |
| 3 | **Estimated Performance Gain** | 150–400 ms per search query |
| 4 | **Estimated Bundle Reduction** | 0 |
| 5 | **Estimated Storage Reduction** | 0 |
| 6 | **Estimated Bandwidth Reduction** | 100–500 KB per search (index build payload) |
| 7 | **Estimated Supabase Cost Reduction** | ~50% fewer catalog queries per search |
| 8 | **Estimated Redis Memory Reduction** | N/A |
| 9 | **Exact File** | [`services/catalog.ts`](../services/catalog.ts) |
| 10 | **Exact Function** | `searchCatalogProducts` (L2029–2047) |
| 11 | **Reason** | `Promise.all([searchCatalogProductsFallback(...), getCatalogSearchIndex()])` — RPC/REST search plus up to 800-row index build on every query. |
| 12 | **Production-safe Fix** | Index-first: call RPC only if index empty or low-confidence merge needed. |
| 13 | **Code Patch** | ```ts\nconst index = await getCatalogSearchIndex();\nif (index.length) {\n  const local = searchCatalogIndex(index, normalized, boundedLimit);\n  if (local.length >= boundedLimit) return local;\n}\nreturn searchCatalogProductsFallback(normalized, boundedLimit);\n``` |
| 14 | **Regression Risk** | Low — index already 60s revalidated |
| 15 | **Verification Steps** | Search with warm cache: 1 catalog query, not 2+. `vitest run tests/catalog-search-api.test.ts`. |

---

### OPT-007 — Search overlay refetches index on every open, clears on close

| # | Field | Value |
|---|-------|-------|
| 1 | **Category** | Network / React |
| 2 | **Impact** | **P1** |
| 3 | **Estimated Performance Gain** | 200–500 ms saved per repeat search open |
| 4 | **Estimated Bundle Reduction** | 0 |
| 5 | **Estimated Storage Reduction** | 0 |
| 6 | **Estimated Bandwidth Reduction** | 200–800 KB per repeat open (full index JSON) |
| 7 | **Estimated Supabase Cost Reduction** | Eliminates duplicate index API hits per session |
| 8 | **Estimated Redis Memory Reduction** | N/A |
| 9 | **Exact File** | [`components/overlays/search-overlay.tsx`](../components/overlays/search-overlay.tsx) |
| 10 | **Exact Function** | `SearchOverlay` (index fetch effect ~L334–364, clear on close ~L319–331) |
| 11 | **Reason** | Fetches `/api/catalog/search?intent=index` on every overlay open, then clears `catalogIndex` on close. No module-level cache between sessions despite API `s-maxage=300`. |
| 12 | **Production-safe Fix** | Module-level singleton cache for index; don't reset on close; prefetch on first nav interaction. |
| 13 | **Code Patch** | ```ts\nlet cachedIndex: CatalogSearchIndexEntry[] | null = null;\n// reuse cachedIndex if fresh (<5min)\n``` |
| 14 | **Regression Risk** | Low — stale index max 60s server-side |
| 15 | **Verification Steps** | Open search twice; second open should not hit network (DevTools). |

---

### OPT-008 — Catalog listing is large client island with full product payload

| # | Field | Value |
|---|-------|-------|
| 1 | **Category** | JavaScript / React |
| 2 | **Impact** | **P1** |
| 3 | **Estimated Performance Gain** | 100–300 ms TTI on `/products` and category pages |
| 4 | **Estimated Bundle Reduction** | 40–80 KB hydrated JS |
| 5 | **Estimated Storage Reduction** | 0 |
| 6 | **Estimated Bandwidth Reduction** | 100–500 KB RSC→client flight data (500 products) |
| 7 | **Estimated Supabase Cost Reduction** | 0 (same server fetch) |
| 8 | **Estimated Redis Memory Reduction** | N/A |
| 9 | **Exact File** | [`sections/catalog/catalog-filtered-listing.tsx`](../sections/catalog/catalog-filtered-listing.tsx) |
| 10 | **Exact Function** | `CatalogFilteredListing` |
| 11 | **Reason** | Entire showroom/category product array serialized into `"use client"` tree for client-side filter/sort. |
| 12 | **Production-safe Fix** | Server-render filtered slice from `searchParams`; client toolbar only. |
| 13 | **Code Patch** | Split into `CatalogFilteredListingClient` (filters) + server `CatalogFilteredListing` (grids). |
| 14 | **Regression Risk** | Medium — filter URL sync |
| 15 | **Verification Steps** | Compare RSC payload size on `/products`; JS heap should drop. |

---

### OPT-009 — Admin orders page over-fetches full warehouse snapshot to client

| # | Field | Value |
|---|-------|-------|
| 1 | **Category** | Database / JavaScript |
| 2 | **Impact** | **P1** |
| 3 | **Estimated Performance Gain** | 200–800 ms TTI on `/admin/orders` with large datasets |
| 4 | **Estimated Bundle Reduction** | 100–500 KB JSON to client |
| 5 | **Estimated Storage Reduction** | 0 |
| 6 | **Estimated Bandwidth Reduction** | 200 KB–2 MB initial payload |
| 7 | **Estimated Supabase Cost Reduction** | Fewer rows transferred per page load |
| 8 | **Estimated Redis Memory Reduction** | N/A |
| 9 | **Exact File** | [`app/admin/orders/page.tsx`](../app/admin/orders/page.tsx) |
| 10 | **Exact Function** | `AdminOrdersPage` |
| 11 | **Reason** | `getWarehouseSnapshot({ scope: "orders", ordersFilter: "all" })` loads all orders + items/inventory/shipments/products into client `AdminOrdersWorkspace`. |
| 12 | **Production-safe Fix** | Server-side queue filter + pagination; pass only current page rows + selected order detail. |
| 13 | **Code Patch** | ```ts\nconst snapshot = await getWarehouseSnapshot({ scope: 'orders', ordersFilter: queue, limit: 50, offset: page * 50 });\n``` |
| 14 | **Regression Risk** | Medium — queue counts/search |
| 15 | **Verification Steps** | Network tab payload size on `/admin/orders` with 500+ orders. |

---

### OPT-010 — Enterprise menu fires 7 parallel category catalog queries

| # | Field | Value |
|---|-------|-------|
| 1 | **Category** | Database |
| 2 | **Impact** | **P1** |
| 3 | **Estimated Performance Gain** | 80–200 ms on every storefront layout render |
| 4 | **Estimated Bundle Reduction** | 0 |
| 5 | **Estimated Storage Reduction** | 0 |
| 6 | **Estimated Bandwidth Reduction** | 50–150 KB (7 query overheads) |
| 7 | **Estimated Supabase Cost Reduction** | 6 fewer `mithron_products` queries per layout |
| 8 | **Estimated Redis Memory Reduction** | N/A |
| 9 | **Exact File** | [`services/catalog.ts`](../services/catalog.ts) |
| 10 | **Exact Function** | `getEnterpriseMenuProducts` (L1756–1758) |
| 11 | **Reason** | One query per `catalogCategoryDefinitions` entry (7 categories × 16 products) on every layout render. |
| 12 | **Production-safe Fix** | Single query `category=in.(...)` with limit 112, partition in JS. |
| 13 | **Code Patch** | Replace `Promise.all(catalogCategoryDefinitions.map(...))` with one `fetchCatalogRows`. |
| 14 | **Regression Risk** | Low — sort order may need client-side ranking |
| 15 | **Verification Steps** | Layout load: 1 `mithron_products` query instead of 7. |

---

### OPT-011 — Static pages fetch full CMS snapshot for footer slice only

| # | Field | Value |
|---|-------|-------|
| 1 | **Category** | Database / CMS |
| 2 | **Impact** | **P1** |
| 3 | **Estimated Performance Gain** | 80–150 ms on `/about`, `/contact`, interest pages |
| 4 | **Estimated Bundle Reduction** | 0 |
| 5 | **Estimated Storage Reduction** | 0 |
| 6 | **Estimated Bandwidth Reduction** | 30–100 KB per request |
| 7 | **Estimated Supabase Cost Reduction** | ~8 fewer CMS table reads per static page |
| 8 | **Estimated Redis Memory Reduction** | N/A |
| 9 | **Exact File** | [`app/(storefront)/contact/page.tsx`](../app/(storefront)/contact/page.tsx), [`about/page.tsx`](../app/(storefront)/about/page.tsx), [`interest/[slug]/page.tsx`](../app/(storefront)/interest/[slug]/page.tsx) |
| 10 | **Exact Function** | Page components, `generateMetadata` |
| 11 | **Reason** | `getPublicCmsSnapshot()` loads hero, nav, footer, FAQs, reviews, campaigns, trust cards. Layout already fetches nav/footer via `getStorefrontShellCms()`. |
| 12 | **Production-safe Fix** | Narrow cached helpers: `getFooterLeadContent()`, `getTrustCards()`, `getHomeInterests()`. |
| 13 | **Code Patch** | ```ts\nconst { footer, trustCards } = await getAboutPageCms();\n``` |
| 14 | **Regression Risk** | Low |
| 15 | **Verification Steps** | Supabase call count per `/about` drops from ~10 tables to 1–2. |

---

### OPT-012 — Category pages missing ISR despite `generateStaticParams`

| # | Field | Value |
|---|-------|-------|
| 1 | **Category** | Next.js — ISR |
| 2 | **Impact** | **P1** |
| 3 | **Estimated Performance Gain** | 100–300 ms TTFB on category pages (CDN hit) |
| 4 | **Estimated Bundle Reduction** | 0 |
| 5 | **Estimated Storage Reduction** | 0 |
| 6 | **Estimated Bandwidth Reduction** | Edge-served HTML |
| 7 | **Estimated Supabase Cost Reduction** | Fewer origin hits when CDN-cached |
| 8 | **Estimated Redis Memory Reduction** | N/A |
| 9 | **Exact File** | [`app/(storefront)/category/[slug]/page.tsx`](../app/(storefront)/category/[slug]/page.tsx) |
| 10 | **Exact Function** | `CategoryPage` |
| 11 | **Reason** | Has `generateStaticParams()` but no `export const revalidate`. HTML route fully dynamic each request despite tag-cached fetch layer. |
| 12 | **Production-safe Fix** | Add `export const revalidate = 60` aligned with catalog/CMS TTL. |
| 13 | **Code Patch** | ```ts\nexport const revalidate = 60;\n``` |
| 14 | **Regression Risk** | Low — stale max 60s unless tags fire |
| 15 | **Verification Steps** | `next build` shows ISR; CDN cache hit rate on `/category/*` increases. |

---

### OPT-013 — Search index API returns oversized payload with `searchFields`

| # | Field | Value |
|---|-------|-------|
| 1 | **Category** | Network / JavaScript |
| 2 | **Impact** | **P1** |
| 3 | **Estimated Performance Gain** | 100–300 ms index download |
| 4 | **Estimated Bundle Reduction** | 0 |
| 5 | **Estimated Storage Reduction** | 0 |
| 6 | **Estimated Bandwidth Reduction** | 200–800 KB per index fetch |
| 7 | **Estimated Supabase Cost Reduction** | 0 (same DB query; smaller wire format) |
| 8 | **Estimated Redis Memory Reduction** | N/A |
| 9 | **Exact File** | [`app/api/catalog/search/route.ts`](../app/api/catalog/search/route.ts), [`lib/catalog-search-index.ts`](../lib/catalog-search-index.ts) |
| 10 | **Exact Function** | `GET`, `searchCatalogIndex` |
| 11 | **Reason** | `intent=index` returns full `CatalogSearchIndexEntry[]` including `searchFields`, images, availability — hundreds of KB JSON to browser. |
| 12 | **Production-safe Fix** | Strip `searchFields` for API; serve minimal DTO or move scoring server-side. |
| 13 | **Code Patch** | ```ts\nconst slim = index.map(({ slug, name, tagline, price, badge, category, image, availability }) => ({ ... }));\n``` |
| 14 | **Regression Risk** | Medium — client scoring may need server endpoint |
| 15 | **Verification Steps** | `curl -w '%{size_download}'` before/after on `?intent=index`. |

---

### OPT-014 — Search index query pulls heavy JSON columns for 800 rows

| # | Field | Value |
|---|-------|-------|
| 1 | **Category** | Database |
| 2 | **Impact** | **P1** |
| 3 | **Estimated Performance Gain** | 50–150 ms index build |
| 4 | **Estimated Bundle Reduction** | 0 |
| 5 | **Estimated Storage Reduction** | 0 |
| 6 | **Estimated Bandwidth Reduction** | 100–400 KB Supabase→server |
| 7 | **Estimated Supabase Cost Reduction** | Lower egress per index build |
| 8 | **Estimated Redis Memory Reduction** | N/A |
| 9 | **Exact File** | [`services/catalog.ts`](../services/catalog.ts) |
| 10 | **Exact Function** | `getCatalogSearchIndex`, `catalogSearchIndexSelect` |
| 11 | **Reason** | Select includes `image`, `hero`, `description`, `specs`, `anchors` for up to 800 rows (`CATALOG_SEARCH_INDEX_LIMIT = 800`). |
| 12 | **Production-safe Fix** | Slim select: slug, name, tagline, price, badge, category, `source_description` snippet only. |
| 13 | **Code Patch** | New `catalogSearchIndexSelectSlim` constant without `specs`/`hero`. |
| 14 | **Regression Risk** | Medium — test search token matching |
| 15 | **Verification Steps** | Measure Supabase response bytes for index query. |

---

### OPT-015 — PDP loads wide `productSelect` (effective full row)

| # | Field | Value |
|---|-------|-------|
| 1 | **Category** | Database |
| 2 | **Impact** | **P1** |
| 3 | **Estimated Performance Gain** | 50–200 ms PDP TTFB |
| 4 | **Estimated Bundle Reduction** | 0 |
| 5 | **Estimated Storage Reduction** | 0 |
| 6 | **Estimated Bandwidth Reduction** | 20–100 KB per PDP row |
| 7 | **Estimated Supabase Cost Reduction** | Lower egress per PDP |
| 8 | **Estimated Redis Memory Reduction** | N/A |
| 9 | **Exact File** | [`services/catalog.ts`](../services/catalog.ts) |
| 10 | **Exact Function** | `getProductRowBySlug`, `loadProductForPage`, `productSelect` |
| 11 | **Reason** | Single row includes `gallery`, `hotspots`, `variants`, `bundles`, `story`, `specs`, `source_images`, SEO fields — all for first paint. |
| 12 | **Production-safe Fix** | Split PDP into core select + lazy sections (story/gallery) or scoped RPC slices. |
| 13 | **Code Patch** | `productDetailSelect` without `story`/`hotspots` for first paint; below-fold async fetch. |
| 14 | **Regression Risk** | Medium — more round-trips if over-split |
| 15 | **Verification Steps** | PDP JSON row size from Supabase logs. |

---

### OPT-016 — Duplicate `admin_settings` fetch paths (cached vs `no-store`)

| # | Field | Value |
|---|-------|-------|
| 1 | **Category** | Database / caching |
| 2 | **Impact** | **P1** |
| 3 | **Estimated Performance Gain** | 20–50 ms per policy read |
| 4 | **Estimated Bundle Reduction** | 0 |
| 5 | **Estimated Storage Reduction** | 0 |
| 6 | **Estimated Bandwidth Reduction** | 5–20 KB duplicate |
| 7 | **Estimated Supabase Cost Reduction** | 1 fewer `admin_settings` read per request |
| 8 | **Estimated Redis Memory Reduction** | N/A |
| 9 | **Exact File** | [`services/admin-settings-cache.ts`](../services/admin-settings-cache.ts), [`services/admin-settings-policy.ts`](../services/admin-settings-policy.ts) |
| 10 | **Exact Function** | `getCachedAdminSettingsPayload`, `loadAdminSettingsPayload` |
| 11 | **Reason** | Storefront uses tagged `revalidate: 60`; policy loader uses `cache: "no-store"` for same row. |
| 12 | **Production-safe Fix** | Policy reuses `getCachedAdminSettingsPayload` or shared `unstable_cache`. |
| 13 | **Code Patch** | Replace `loadAdminSettingsPayload` fetch with cached helper. |
| 14 | **Regression Risk** | Low — 30–60s staleness acceptable |
| 15 | **Verification Steps** | One REST hit per request for policy + homepage CMS. |

---

### OPT-017 — CMS resolver fetches all sections, filters in memory

| # | Field | Value |
|---|-------|-------|
| 1 | **Category** | Database / CMS |
| 2 | **Impact** | **P1** |
| 3 | **Estimated Performance Gain** | 30–80 ms per CMS orchestration |
| 4 | **Estimated Bundle Reduction** | 0 |
| 5 | **Estimated Storage Reduction** | 0 |
| 6 | **Estimated Bandwidth Reduction** | 10–50 KB |
| 7 | **Estimated Supabase Cost Reduction** | Fewer `cms_sections` rows per request |
| 8 | **Estimated Redis Memory Reduction** | N/A |
| 9 | **Exact File** | [`services/cms-resolver.ts`](../services/cms-resolver.ts) |
| 10 | **Exact Function** | `resolveCmsPageOrchestration` |
| 11 | **Reason** | Fetches up to 80 `cms_sections` globally, filters by `page_id` in JS. |
| 12 | **Production-safe Fix** | Two-step: fetch page, then `page_id=eq.{id}` on sections. |
| 13 | **Code Patch** | Add `&page_id=eq.${pageId}` after page resolve. |
| 14 | **Regression Risk** | Low |
| 15 | **Verification Steps** | Section query row count matches page sections only. |

---

### OPT-018 — Homepage blog teasers fetch full `body` + `body_json`

| # | Field | Value |
|---|-------|-------|
| 1 | **Category** | Database |
| 2 | **Impact** | **P1** |
| 3 | **Estimated Performance Gain** | 30–100 ms homepage bundle |
| 4 | **Estimated Bundle Reduction** | 0 |
| 5 | **Estimated Storage Reduction** | 0 |
| 6 | **Estimated Bandwidth Reduction** | 50–200 KB |
| 7 | **Estimated Supabase Cost Reduction** | Lower egress on blog query |
| 8 | **Estimated Redis Memory Reduction** | N/A |
| 9 | **Exact File** | [`services/blog-posts.ts`](../services/blog-posts.ts), [`services/homepage-bundle.ts`](../services/homepage-bundle.ts) |
| 10 | **Exact Function** | `listPublishedBlogPosts`, `getHomepageBundle` |
| 11 | **Reason** | `BLOG_SELECT` includes `body,body_json,...` for 3-card teaser. |
| 12 | **Production-safe Fix** | `BLOG_TEASER_SELECT` without body fields. |
| 13 | **Code Patch** | Add slim select for homepage/list views. |
| 14 | **Regression Risk** | Low |
| 15 | **Verification Steps** | Homepage blog query response size drops sharply. |

---

### OPT-019 — Cart pricing store causes broad re-renders

| # | Field | Value |
|---|-------|-------|
| 1 | **Category** | React / Zustand |
| 2 | **Impact** | **P1** |
| 3 | **Estimated Performance Gain** | 30–50% fewer cart overlay re-renders |
| 4 | **Estimated Bundle Reduction** | 0 |
| 5 | **Estimated Storage Reduction** | 0 |
| 6 | **Estimated Bandwidth Reduction** | 0 |
| 7 | **Estimated Supabase Cost Reduction** | 0 |
| 8 | **Estimated Redis Memory Reduction** | N/A |
| 9 | **Exact File** | [`hooks/use-resolved-cart.ts`](../hooks/use-resolved-cart.ts) |
| 10 | **Exact Function** | `useResolvedCart` |
| 11 | **Reason** | Subscribes to full `snapshot` object. Any field change re-renders every cart consumer. |
| 12 | **Production-safe Fix** | Split selectors or `useShallow` for grouped reads. |
| 13 | **Code Patch** | ```ts\nconst lines = useCartPricingStore(s => s.snapshot.lines);\nconst isResolving = useCartPricingStore(s => s.snapshot.isResolving);\n``` |
| 14 | **Regression Risk** | Low |
| 15 | **Verification Steps** | React Profiler: add item; `CartDrawer` render count drops during pricing API flight. |

---

### OPT-020 — Editor HTML always hydrates client-side

| # | Field | Value |
|---|-------|-------|
| 1 | **Category** | React / hydration |
| 2 | **Impact** | **P1** |
| 3 | **Estimated Performance Gain** | 15–30% less hydration on content pages |
| 4 | **Estimated Bundle Reduction** | 5–15 KB (sanitize-html client path) |
| 5 | **Estimated Storage Reduction** | 0 |
| 6 | **Estimated Bandwidth Reduction** | 0 |
| 7 | **Estimated Supabase Cost Reduction** | 0 |
| 8 | **Estimated Redis Memory Reduction** | N/A |
| 9 | **Exact File** | [`components/editor/editor-rendered-content.tsx`](../components/editor/editor-rendered-content.tsx) |
| 10 | **Exact Function** | `EditorRenderedContent` → `EditorRenderedContentClient` |
| 11 | **Reason** | All CMS/editor HTML routes through client wrapper + `useEffect` hydration even for static prose. |
| 12 | **Production-safe Fix** | Server-render static HTML; client hydrate only when interactive atom markers detected. |
| 13 | **Code Patch** | ```tsx\nif (!needsHydration(safeHtml)) return <div dangerouslySetInnerHTML={{ __html: safeHtml }} />;\n``` |
| 14 | **Regression Risk** | Medium — interactive editor blocks |
| 15 | **Verification Steps** | Shelf hero body without embeds: reduced hydration in React DevTools. |

---

### OPT-021 — Adaptive navbar tone uses expensive scroll/MutationObserver pipeline

| # | Field | Value |
|---|-------|-------|
| 1 | **Category** | React / animations |
| 2 | **Impact** | **P1** |
| 3 | **Estimated Performance Gain** | 5–15 ms scroll jank reduction |
| 4 | **Estimated Bundle Reduction** | 0 |
| 5 | **Estimated Storage Reduction** | 0 |
| 6 | **Estimated Bandwidth Reduction** | 0 |
| 7 | **Estimated Supabase Cost Reduction** | 0 |
| 8 | **Estimated Redis Memory Reduction** | N/A |
| 9 | **Exact File** | [`hooks/use-adaptive-navbar-tone.ts`](../hooks/use-adaptive-navbar-tone.ts) |
| 10 | **Exact Function** | `useAdaptiveNavbarTone` |
| 11 | **Reason** | Scroll listener + `MutationObserver` on `documentElement` + hero subtrees + `elementsFromPoint` sampling + rAF on every scroll. |
| 12 | **Production-safe Fix** | Limit to hero-overlap routes; derive ink from `data-navbar-ink` on hero carousel instead of pixel sampling. |
| 13 | **Code Patch** | Gate heavy path: `if (!isFlushHeroDocument()) return early dark tone`. |
| 14 | **Regression Risk** | Medium — navbar contrast a11y |
| 15 | **Verification Steps** | Chrome Performance: scroll homepage; compare `measureNavbarTone` call frequency. |

---

### OPT-022 — Assistant widget chunk loaded on all storefront pages

| # | Field | Value |
|---|-------|-------|
| 1 | **Category** | JavaScript |
| 2 | **Impact** | **P1** |
| 3 | **Estimated Performance Gain** | 50–100 ms deferred until needed |
| 4 | **Estimated Bundle Reduction** | 50–100 KB deferred |
| 5 | **Estimated Storage Reduction** | 0 |
| 6 | **Estimated Bandwidth Reduction** | 50–100 KB on non-assistant pages |
| 7 | **Estimated Supabase Cost Reduction** | 0 |
| 8 | **Estimated Redis Memory Reduction** | N/A |
| 9 | **Exact File** | [`components/layout/store-shell-client.tsx`](../components/layout/store-shell-client.tsx) |
| 10 | **Exact Function** | `StoreShellClient` |
| 11 | **Reason** | `MithronAssistantWidget` is `dynamic({ ssr: false })` but always mounted. Widget returns `null` on most paths but JS chunk still downloads. |
| 12 | **Production-safe Fix** | Mount only on `isAssistantSurfacePath(pathname)` or after idle/interaction intent. |
| 13 | **Code Patch** | `{assistantPrewarmed ? <MithronAssistantWidget /> : null}` + idle preload |
| 14 | **Regression Risk** | Low |
| 15 | **Verification Steps** | Fresh `/` load: no assistant chunk in Network until idle. |

---

### OPT-023 — Live-sync wrappers pass unstable `shouldRefresh` callbacks

| # | Field | Value |
|---|-------|-------|
| 1 | **Category** | React / Supabase Realtime |
| 2 | **Impact** | **P1** |
| 3 | **Estimated Performance Gain** | Eliminates subscribe/unsubscribe storms |
| 4 | **Estimated Bundle Reduction** | 0 |
| 5 | **Estimated Storage Reduction** | 0 |
| 6 | **Estimated Bandwidth Reduction** | Reduced Realtime reconnect traffic |
| 7 | **Estimated Supabase Cost Reduction** | Fewer Realtime channel subscriptions |
| 8 | **Estimated Redis Memory Reduction** | N/A |
| 9 | **Exact File** | [`components/control-plane/use-control-plane-live-sync.ts`](../components/control-plane/use-control-plane-live-sync.ts), `*-live-sync.tsx` wrappers |
| 10 | **Exact Function** | `useControlPlaneLiveSync` |
| 11 | **Reason** | Inline predicates like `(table) => ORDERS_TABLES.has(table)` create new function reference every render → effect cleanup + resubscribe. |
| 12 | **Production-safe Fix** | Module-scope stable callbacks. |
| 13 | **Code Patch** | ```ts\nconst shouldRefreshOrders = (t: string) => ORDERS_TABLES.has(t);\n``` |
| 14 | **Regression Risk** | Low |
| 15 | **Verification Steps** | Log subscribe count; admin orders navigation = 1 subscribe, not N per render. |

---

### OPT-024 — Login hero loads 4K WebP up to 3×, all `unoptimized`

| # | Field | Value |
|---|-------|-------|
| 1 | **Category** | Images |
| 2 | **Impact** | **P1** |
| 3 | **Estimated Performance Gain** | 300–800 ms LCP on `/login` |
| 4 | **Estimated Bundle Reduction** | 0 |
| 5 | **Estimated Storage Reduction** | 0 |
| 6 | **Estimated Bandwidth Reduction** | 1–3 MB per login page load |
| 7 | **Estimated Supabase Cost Reduction** | Lower storage egress |
| 8 | **Estimated Redis Memory Reduction** | N/A |
| 9 | **Exact File** | [`app/login/login-hero-background.tsx`](../app/login/login-hero-background.tsx) |
| 10 | **Exact Function** | `LoginHeroBackground` |
| 11 | **Reason** | Same 3840×2160 Supabase URL used three times with `unoptimized`, bypassing Next image optimizer. |
| 12 | **Production-safe Fix** | Tier-appropriate widths (1280/1920); CSS transform on single decoded image for parallax. |
| 13 | **Code Patch** | Single layer + CSS `transform`; width params on Supabase transform URL. |
| 14 | **Regression Risk** | Low |
| 15 | **Verification Steps** | Lighthouse LCP on `/login`; Network tab shows ≤1 full-res fetch. |

---

### OPT-025 — Unused `public/fonts/` dead weight (~136 KB)

| # | Field | Value |
|---|-------|-------|
| 1 | **Category** | Fonts / code cleanup |
| 2 | **Impact** | **P1** |
| 3 | **Estimated Performance Gain** | Marginal (not loaded at runtime) |
| 4 | **Estimated Bundle Reduction** | 0 |
| 5 | **Estimated Storage Reduction** | ~136 KB repo; reduces Vercel upload |
| 6 | **Estimated Bandwidth Reduction** | 0 (unused) |
| 7 | **Estimated Supabase Cost Reduction** | 0 |
| 8 | **Estimated Redis Memory Reduction** | N/A |
| 9 | **Exact File** | [`public/fonts/`](../public/fonts/) (6 files) |
| 10 | **Exact Function** | N/A — static assets |
| 11 | **Reason** | `dji-bold.ttf` + 5× Satoshi `.woff2` never referenced; runtime uses `next/font` Inter + Outfit only. Confirmed in `reports/storage-audit-cleanup-summary.json`. |
| 12 | **Production-safe Fix** | Delete `public/fonts/` directory. |
| 13 | **Code Patch** | `git rm -r public/fonts/` |
| 14 | **Regression Risk** | Low — verify no `@font-face` references |
| 15 | **Verification Steps** | `rg "public/fonts" .`; build passes; no font 404s. |

---

### OPT-026 — `store-nav.tsx` uses uncapped thumb images

| # | Field | Value |
|---|-------|-------|
| 1 | **Category** | Images |
| 2 | **Impact** | **P1** |
| 3 | **Estimated Performance Gain** | Faster mega-menu paint |
| 4 | **Estimated Bundle Reduction** | 0 |
| 5 | **Estimated Storage Reduction** | 0 |
| 6 | **Estimated Bandwidth Reduction** | 20–80 KB per menu open |
| 7 | **Estimated Supabase Cost Reduction** | Lower image egress |
| 8 | **Estimated Redis Memory Reduction** | N/A |
| 9 | **Exact File** | [`components/navigation/store-nav.tsx`](../components/navigation/store-nav.tsx) |
| 10 | **Exact Function** | `EnterpriseMenuThumb` |
| 11 | **Reason** | Uses raw `MithronResponsiveImage imageRole="thumb"` instead of `MithronThumbImage` (384px cap). Violates `audit-delivered-image-widths.mjs` contract. |
| 12 | **Production-safe Fix** | Swap to `MithronThumbImage`. |
| 13 | **Code Patch** | Replace import and component usage. |
| 14 | **Regression Risk** | Low |
| 15 | **Verification Steps** | `node tools/audit-delivered-image-widths.mjs`; mega-menu thumbs ≤384px delivered. |

---

### OPT-027 — Duplicate mission PNG + optimized WebP in `public/`

| # | Field | Value |
|---|-------|-------|
| 1 | **Category** | Images / storage |
| 2 | **Impact** | **P1** |
| 3 | **Estimated Performance Gain** | 0 (if WebP served) |
| 4 | **Estimated Bundle Reduction** | 0 |
| 5 | **Estimated Storage Reduction** | ~800 KB+ in repo/deploy |
| 6 | **Estimated Bandwidth Reduction** | 0 if runtime prefers WebP |
| 7 | **Estimated Supabase Cost Reduction** | 0 |
| 8 | **Estimated Redis Memory Reduction** | N/A |
| 9 | **Exact File** | [`public/media/mithron/mission/`](../public/media/mithron/mission/), [`public/optimized/`](../public/optimized/) |
| 10 | **Exact Function** | N/A |
| 11 | **Reason** | Mission tiles ship full PNG fallbacks alongside responsive WebP variants; runtime prefers Supabase remote map. |
| 12 | **Production-safe Fix** | Run `node tools/audit-asset-source-of-truth.mjs`; remove orphaned local PNGs after verifying remote delivery. |
| 13 | **Code Patch** | Remove confirmed `CONFLICTING`/`ORPHANED` entries from manifest. |
| 14 | **Regression Risk** | Medium — verify fallback chain |
| 15 | **Verification Steps** | Homepage mission tiles render; `audit-asset-source-of-truth` exits 0. |

---

### OPT-028 — Missing composite index for payment-expire cron

| # | Field | Value |
|---|-------|-------|
| 1 | **Category** | Database |
| 2 | **Impact** | **P1** |
| 3 | **Estimated Performance Gain** | Cron job 10–100× faster at scale |
| 4 | **Estimated Bundle Reduction** | 0 |
| 5 | **Estimated Storage Reduction** | ~few MB index |
| 6 | **Estimated Bandwidth Reduction** | 0 |
| 7 | **Estimated Supabase Cost Reduction** | Lower CPU per daily cron |
| 8 | **Estimated Redis Memory Reduction** | N/A |
| 9 | **Exact File** | [`app/api/payments/expire-pending/route.ts`](../app/api/payments/expire-pending/route.ts), migrations |
| 10 | **Exact Function** | Cron `GET` handler |
| 11 | **Reason** | Queries `status=pending_payment`, `payment_status=requires_payment`, `created_at<cutoff`. Existing indexes don't match this triple filter. |
| 12 | **Production-safe Fix** | Partial composite index on `(status, payment_status, created_at)` WHERE pending. |
| 13 | **Code Patch** | ```sql\nCREATE INDEX orders_expire_pending_idx ON orders (status, payment_status, created_at)\n  WHERE status = 'pending_payment' AND payment_status = 'requires_payment';\n``` |
| 14 | **Regression Risk** | Low |
| 15 | **Verification Steps** | `EXPLAIN ANALYZE` on cron query; index scan not seq scan. |

---

### OPT-029 — Cart RLS policies use bare `auth.uid()` (initplan)

| # | Field | Value |
|---|-------|-------|
| 1 | **Category** | Database / Supabase cost |
| 2 | **Impact** | **P1** |
| 3 | **Estimated Performance Gain** | 10–30% faster cart reads at scale |
| 4 | **Estimated Bundle Reduction** | 0 |
| 5 | **Estimated Storage Reduction** | 0 |
| 6 | **Estimated Bandwidth Reduction** | 0 |
| 7 | **Estimated Supabase Cost Reduction** | Lower RLS evaluation CPU |
| 8 | **Estimated Redis Memory Reduction** | N/A |
| 9 | **Exact File** | [`supabase/migrations/20260713000100_customer_carts.sql`](../supabase/migrations/20260713000100_customer_carts.sql) |
| 10 | **Exact Function** | Cart RLS policies |
| 11 | **Reason** | Policies use `user_id = auth.uid()` instead of `(select auth.uid())` pattern documented in `20260619000100_audit_remediation_hardening.sql`. |
| 12 | **Production-safe Fix** | Migration to wrap `auth.uid()` in subselect for all cart policies. |
| 13 | **Code Patch** | `user_id = (select auth.uid())` |
| 14 | **Regression Risk** | Low |
| 15 | **Verification Steps** | Supabase Performance Advisor: no initplan warnings on cart tables. |

---

### OPT-030 — No `.vercelignore` — large non-runtime trees upload

| # | Field | Value |
|---|-------|-------|
| 1 | **Category** | DevOps / build time |
| 2 | **Impact** | **P1** |
| 3 | **Estimated Performance Gain** | 30–90 s faster deploys |
| 4 | **Estimated Bundle Reduction** | 0 |
| 5 | **Estimated Storage Reduction** | ~15–50 MB upload context |
| 6 | **Estimated Bandwidth Reduction** | Deploy upload bandwidth |
| 7 | **Estimated Supabase Cost Reduction** | 0 |
| 8 | **Estimated Redis Memory Reduction** | N/A |
| 9 | **Exact File** | Repo root (missing `.vercelignore`) |
| 10 | **Exact Function** | N/A |
| 11 | **Reason** | `tools/` (95 files), `tests/`, `reports/storage-audit-manifest.csv` (10 MB), `docs/`, `data/*.snapshot.json` upload with project. |
| 12 | **Production-safe Fix** | Add `.vercelignore` for non-runtime paths. |
| 13 | **Code Patch** | ```\ntools/\ntests/\nreports/\ndocs/\nplaywright*\n*.ps1\n``` |
| 14 | **Regression Risk** | Low — verify no runtime imports from ignored paths |
| 15 | **Verification Steps** | Vercel build log upload size decreases; `npm run build` still passes. |

---

### OPT-031 — `optimizePackageImports` covers only 3 deps

| # | Field | Value |
|---|-------|-------|
| 1 | **Category** | JavaScript / build time |
| 2 | **Impact** | **P1** |
| 3 | **Estimated Performance Gain** | 50–150 ms admin route TTI |
| 4 | **Estimated Bundle Reduction** | 30–80 KB on editor routes |
| 5 | **Estimated Storage Reduction** | 0 |
| 6 | **Estimated Bandwidth Reduction** | 30–80 KB |
| 7 | **Estimated Supabase Cost Reduction** | 0 |
| 8 | **Estimated Redis Memory Reduction** | N/A |
| 9 | **Exact File** | [`next.config.ts`](../next.config.ts) |
| 10 | **Exact Function** | `experimental.optimizePackageImports` |
| 11 | **Reason** | Only `lucide-react`, `sonner`, `@tanstack/react-virtual`. Heavy: 15+ `@tiptap/*`, `zustand`, `@radix-ui/react-slot`, `sanitize-html`. |
| 12 | **Production-safe Fix** | Extend list with TipTap, zustand, radix, sanitize-html. |
| 13 | **Code Patch** | ```ts\noptimizePackageImports: [\n  'lucide-react', 'sonner', '@tanstack/react-virtual',\n  '@tiptap/react', '@tiptap/starter-kit', '@tiptap/core',\n  'zustand', '@radix-ui/react-slot', 'sanitize-html'\n]\n``` |
| 14 | **Regression Risk** | Low |
| 15 | **Verification Steps** | `ANALYZE=true npm run build`; compare admin CMS chunk sizes. |

---

### OPT-032 — Upstash rate limit: non-atomic INCR + EXPIRE

| # | Field | Value |
|---|-------|-------|
| 1 | **Category** | Redis (Upstash REST) |
| 2 | **Impact** | **P1** |
| 3 | **Estimated Performance Gain** | 0 |
| 4 | **Estimated Bundle Reduction** | 0 |
| 5 | **Estimated Storage Reduction** | 0 |
| 6 | **Estimated Bandwidth Reduction** | 1 fewer REST call per first hit in window |
| 7 | **Estimated Supabase Cost Reduction** | 0 |
| 8 | **Estimated Redis Memory Reduction** | Prevents key leaks without TTL |
| 9 | **Exact File** | [`lib/rate-limit-redis.ts`](../lib/rate-limit-redis.ts) |
| 10 | **Exact Function** | `checkDistributedRateLimit` (L45–62) |
| 11 | **Reason** | Two REST calls: `/incr/` then `/expire/` when `count === 1`. Race if expire fails. |
| 12 | **Production-safe Fix** | Use Upstash Ratelimit SDK or single Lua/EVAL script. |
| 13 | **Code Patch** | Replace with `@upstash/ratelimit` sliding window. |
| 14 | **Regression Risk** | Low |
| 15 | **Verification Steps** | Rate limit tests pass; no unbounded keys in Upstash dashboard. |

---

### OPT-033 — CI `security-boundaries` job rebuilds from scratch

| # | Field | Value |
|---|-------|-------|
| 1 | **Category** | DevOps / build time |
| 2 | **Impact** | **P2** |
| 3 | **Estimated Performance Gain** | ~2–5 min saved per PR |
| 4 | **Estimated Bundle Reduction** | 0 |
| 5 | **Estimated Storage Reduction** | 0 |
| 6 | **Estimated Bandwidth Reduction** | 0 |
| 7 | **Estimated Supabase Cost Reduction** | 0 |
| 8 | **Estimated Redis Memory Reduction** | N/A |
| 9 | **Exact File** | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) |
| 10 | **Exact Function** | `security-boundaries` job |
| 11 | **Reason** | `needs: verify` then runs `npm ci` + `build` again before `npm run start`. |
| 12 | **Production-safe Fix** | Upload `.next` artifact from `verify` job. |
| 13 | **Code Patch** | Add `actions/upload-artifact` in verify; `download-artifact` in security-boundaries. |
| 14 | **Regression Risk** | Low |
| 15 | **Verification Steps** | CI duration drops; security-boundaries still passes. |

---

### OPT-034 — 13 knip-unused files (4 test-gated)

| # | Field | Value |
|---|-------|-------|
| 1 | **Category** | Code cleanup |
| 2 | **Impact** | **P2** |
| 3 | **Estimated Performance Gain** | Marginal |
| 4 | **Estimated Bundle Reduction** | 5–20 KB (tree-shaken but scanned) |
| 5 | **Estimated Storage Reduction** | ~15–30 KB source |
| 6 | **Estimated Bandwidth Reduction** | 0 |
| 7 | **Estimated Supabase Cost Reduction** | 0 |
| 8 | **Estimated Redis Memory Reduction** | N/A |
| 9 | **Exact File** | See list below |
| 10 | **Exact Function** | N/A |
| 11 | **Reason** | Knip reports unused files. 4 are contract-test-bound; 9 are safe candidates after verification. |
| 12 | **Production-safe Fix** | Remove 9 safe files; migrate tests for 4 before removal. |
| 13 | **Code Patch** | See **Do Not Touch** appendix for gated files. |
| 14 | **Regression Risk** | Low for safe 9; High for test-bound 4 |
| 15 | **Verification Steps** | `npm run audit:knip`; `npm run build`; affected tests pass. |

**Safe candidates (verify then remove):**
- `components/admin/cms/use-catalog-products.ts`
- `components/overlays/cart-drawer-loading.tsx`
- `components/overlays/mini-cart-popover.tsx`
- `components/platform/page-header.tsx`
- `features/admin/cms/cms-workspace-shell.tsx`
- `features/admin/cms/homepage-builder-shell.tsx`
- `features/admin/cms/use-cms-section-editor.ts`
- `lib/auth/session-claims.ts`
- `scripts/migrate-shelf-slugs.ts`

---

### OPT-035 — Dead CSS keyframes in globals and modules

| # | Field | Value |
|---|-------|-------|
| 1 | **Category** | CSS |
| 2 | **Impact** | **P2** |
| 3 | **Estimated Performance Gain** | Marginal parse time |
| 4 | **Estimated Bundle Reduction** | ~2–4 KB CSS |
| 5 | **Estimated Storage Reduction** | ~2 KB |
| 6 | **Estimated Bandwidth Reduction** | ~2 KB per page |
| 7 | **Estimated Supabase Cost Reduction** | 0 |
| 8 | **Estimated Redis Memory Reduction** | N/A |
| 9 | **Exact File** | [`app/globals.css`](../app/globals.css), [`sections/home/home-landing-composite.module.css`](../sections/home/home-landing-composite.module.css) |
| 10 | **Exact Function** | N/A — `@keyframes` blocks |
| 11 | **Reason** | `missionAuroraDrift`, `missionAuroraDriftReverse`, `dark-aurora-1`…`4` defined but never referenced via `animation:`. |
| 12 | **Production-safe Fix** | Remove dead keyframes after `rg` confirms no usage. |
| 13 | **Code Patch** | Delete unused `@keyframes` blocks (~80 lines). |
| 14 | **Regression Risk** | Low |
| 15 | **Verification Steps** | Visual regression on homepage mission section. |

---

### OPT-036 — `globals.css` monolith (~5,237 lines / ~132 KB)

| # | Field | Value |
|---|-------|-------|
| 1 | **Category** | CSS |
| 2 | **Impact** | **P2** |
| 3 | **Estimated Performance Gain** | 5–20 ms CSS parse |
| 4 | **Estimated Bundle Reduction** | 0 (same CSS, better split) |
| 5 | **Estimated Storage Reduction** | 0 |
| 6 | **Estimated Bandwidth Reduction** | Potential route-level CSS splitting |
| 7 | **Estimated Supabase Cost Reduction** | 0 |
| 8 | **Estimated Redis Memory Reduction** | N/A |
| 9 | **Exact File** | [`app/globals.css`](../app/globals.css) |
| 10 | **Exact Function** | N/A |
| 11 | **Reason** | Single global stylesheet holds Tailwind `@theme`, tokens, and most storefront layout CSS. |
| 12 | **Production-safe Fix** | Move section-specific rules to existing `.module.css` files; defer non-critical CSS. |
| 13 | **Code Patch** | Incremental extraction per route group. |
| 14 | **Regression Risk** | Medium — visual regressions |
| 15 | **Verification Steps** | Lighthouse CSS unused bytes; visual e2e on storefront. |

---

### OPT-037 — Admin nav metrics polling every 30s

| # | Field | Value |
|---|-------|-------|
| 1 | **Category** | Network |
| 2 | **Impact** | **P2** |
| 3 | **Estimated Performance Gain** | Reduced background CPU |
| 4 | **Estimated Bundle Reduction** | 0 |
| 5 | **Estimated Storage Reduction** | 0 |
| 6 | **Estimated Bandwidth Reduction** | ~4× fewer `/api/admin/nav-metrics` calls/min |
| 7 | **Estimated Supabase Cost Reduction** | Fewer admin metrics queries |
| 8 | **Estimated Redis Memory Reduction** | N/A |
| 9 | **Exact File** | [`components/admin/admin-nav-metrics-provider.tsx`](../components/admin/admin-nav-metrics-provider.tsx) |
| 10 | **Exact Function** | `AdminNavMetricsProvider` |
| 11 | **Reason** | `setInterval(refresh, 30_000)` on every admin page continuously. |
| 12 | **Production-safe Fix** | Poll only when tab visible; increase to 120s; piggyback on realtime sync. |
| 13 | **Code Patch** | `document.visibilityState === 'visible'` gate + 120s interval. |
| 14 | **Regression Risk** | Low |
| 15 | **Verification Steps** | Network tab on `/admin`: metrics calls drop ~4×/min. |

---

### OPT-038 — Payment providers fetched with `cache: "no-store"` on checkout

| # | Field | Value |
|---|-------|-------|
| 1 | **Category** | Network |
| 2 | **Impact** | **P2** |
| 3 | **Estimated Performance Gain** | 20–50 ms checkout mount |
| 4 | **Estimated Bundle Reduction** | 0 |
| 5 | **Estimated Storage Reduction** | 0 |
| 6 | **Estimated Bandwidth Reduction** | ~1–2 KB per checkout visit |
| 7 | **Estimated Supabase Cost Reduction** | 0 |
| 8 | **Estimated Redis Memory Reduction** | N/A |
| 9 | **Exact File** | [`app/api/payments/providers/route.ts`](../app/api/payments/providers/route.ts), [`app/(storefront)/checkout/checkout-page-client.tsx`](../app/(storefront)/checkout/checkout-page-client.tsx) |
| 10 | **Exact Function** | `GET`, checkout mount fetch |
| 11 | **Reason** | Env-derived provider list fetched with `no-store` on every checkout mount. |
| 12 | **Production-safe Fix** | Add `Cache-Control: public, s-maxage=3600` on route. |
| 13 | **Code Patch** | ```ts\nheaders: { 'Cache-Control': 'public, s-maxage=3600' }\n``` |
| 14 | **Regression Risk** | Low |
| 15 | **Verification Steps** | Checkout: one providers request per session/hour. |

---

### OPT-039 — `serverExternalPackages` missing for `sharp`

| # | Field | Value |
|---|-------|-------|
| 1 | **Category** | DevOps / build time |
| 2 | **Impact** | **P2** |
| 3 | **Estimated Performance Gain** | 10–30 s faster build trace |
| 4 | **Estimated Bundle Reduction** | 5–15 MB serverless artifact |
| 5 | **Estimated Storage Reduction** | Deploy artifact size |
| 6 | **Estimated Bandwidth Reduction** | 0 |
| 7 | **Estimated Supabase Cost Reduction** | 0 |
| 8 | **Estimated Redis Memory Reduction** | N/A |
| 9 | **Exact File** | [`next.config.ts`](../next.config.ts) |
| 10 | **Exact Function** | N/A — config |
| 11 | **Reason** | `sharp` in dependencies; Next may bundle native binaries into serverless functions. |
| 12 | **Production-safe Fix** | Add `serverExternalPackages: ['sharp']`. |
| 13 | **Code Patch** | ```ts\nserverExternalPackages: ['sharp'],\n``` |
| 14 | **Regression Risk** | Low |
| 15 | **Verification Steps** | Vercel function size for upload routes decreases. |

---

### OPT-040 — Spurious `"use client"` on pure presentational sections

| # | Field | Value |
|---|-------|-------|
| 1 | **Category** | React / JavaScript |
| 2 | **Impact** | **P2** |
| 3 | **Estimated Performance Gain** | 10–30 ms hydration per page |
| 4 | **Estimated Bundle Reduction** | 8–18 KB combined |
| 5 | **Estimated Storage Reduction** | 0 |
| 6 | **Estimated Bandwidth Reduction** | 0 |
| 7 | **Estimated Supabase Cost Reduction** | 0 |
| 8 | **Estimated Redis Memory Reduction** | N/A |
| 9 | **Exact File** | [`sections/product/discovery-product-grid.tsx`](../sections/product/discovery-product-grid.tsx), [`sections/home/home-mini-carousel.tsx`](../sections/home/home-mini-carousel.tsx), [`sections/home/home-composite-section.tsx`](../sections/home/home-composite-section.tsx) |
| 10 | **Exact Function** | `DiscoveryProductGrid`, `HomeMiniCarousel`, `HomeCompositeSection` |
| 11 | **Reason** | Pure `.map()` / static link rails with no hooks — marked `"use client"` unnecessarily. |
| 12 | **Production-safe Fix** | Remove `"use client"` where children are server-compatible; use CSS `prefers-reduced-motion` instead of client hook for motion state. |
| 13 | **Code Patch** | Delete line 1 `"use client"` after verifying imports. |
| 14 | **Regression Risk** | Low |
| 15 | **Verification Steps** | `npm run build`; affected pages render identically. |

---

## Additional P2 findings (summary table)

| ID | Category | File | Issue | Est. gain |
|----|----------|------|-------|-----------|
| OPT-041 | Database | `services/catalog.ts` | `fetchMediaAssetChunk` N+1 fallback on batch failure | 50–200 ms |
| OPT-042 | Database | `services/inventory.ts` | No warehouse filter on inventory query | Correctness + rows |
| OPT-043 | Database | `services/catalog.ts` | `getYouMayAlsoLikeShellItems` over-fetches 4×/6× limits | 30–80 ms PDP |
| OPT-044 | Database | `services/catalog.ts` | `getRelatedProductShellItems` 3 sequential queries | 50–100 ms PDP |
| OPT-045 | Database | `services/enquiries.ts` | Missing JSON idempotency index on `payload->>idempotency_key` | Cron/checkout |
| OPT-046 | Next.js | `app/(storefront)/account/orders/page.tsx` | Conflicting `dynamic` + `revalidate` | Dead config |
| OPT-047 | Next.js | `admin/layout.tsx` etc. | Layout-level `force-dynamic` on all admin routes | ISR opportunity |
| OPT-048 | React | `features/admin/cms/homepage-builder-context.tsx` | Monolithic CMS builder context | Admin keystroke lag |
| OPT-049 | React | `components/overlays/cart-drawer.tsx` | Unmemoized cart line rows | 10–20% drawer updates |
| OPT-050 | React | `components/admin/orders/admin-order-list.tsx` | No virtualization for 500+ orders | Admin paint |
| OPT-051 | Images | `components/brand/mithron-brand-mark.tsx` | `unoptimized` at 925×111 for 22px nav | Minor bandwidth |
| OPT-052 | Images | `sections/home/*-banner.tsx` | `sizes="100vw"` vs 1536px shelf cap | Homepage bandwidth |
| OPT-053 | CSS | `app/globals.css` | Duplicate font tokens in `@theme` and `:root` | ~1 KB |
| OPT-054 | CSS | `app/login/login.module.css` | Phantom SF Pro stack | 0 (no load) |
| OPT-055 | Network | `app/api/products/summary/route.ts` | `force-dynamic` on public catalog summary | Assistant cards |
| OPT-056 | Network | `hooks/use-cart-auth-sync.ts` | Cart sync on all chrome pages | Background API |
| OPT-057 | Build | `package.json` | Knip/depcheck not in CI | Drift accumulation |
| OPT-058 | Schema | `auth_identities`, `order_return_requests` | Zero TS references | Maintenance only |
| OPT-059 | Redis | `lib/rate-limit-redis.ts` | `safeCheckDistributedRateLimit` dead export | 0 |
| OPT-060 | Redis | `services/auth-lockout.ts` | peek + increment double round-trip | Login latency |

---

## Redis / Upstash section

| Item | Status |
|------|--------|
| npm `redis` package | **Not used** |
| Upstash REST rate limiting | **Used** in `lib/rate-limit-redis.ts` |
| Production when unconfigured | **Fail-open** (allows requests, logs warning) |
| Unit test expectation | **Fail-closed** (throws) — **misaligned** with production |
| Memory optimization | Use atomic rate limit scripts; collapse AI dual limiters; review cart 240/min vs audit 10/sec |

**When Upstash is configured:** OPT-032 reduces key leaks; auth lockout peek+increment (OPT-060) adds unnecessary REST calls per login attempt.

---

## Do Not Touch appendix

These items are **gated** or **contract-test-bound**. Do not remove without migrating tests or enabling `destructiveCleanupAllowed`.

| Item | Gate | Reason |
|------|------|--------|
| `components/admin/enterprise-realtime-panel.tsx` | Contract tests | `enterprise-realtime-reliability.test.ts`, `final-enterprise-security-hardening.test.ts` |
| `components/supplier/supplier-frame.tsx` | E2E + tests | `supplier.spec.ts` expects `[data-supplier-frame]` |
| `components/warehouse/warehouse-frame.tsx` | Contract tests | `warehouse-panel-implementation.test.ts` |
| `sections/product/product-media-viewer.tsx` | Contract tests | `media-bandwidth-optimization.test.ts` reads implementation |
| `config/storefront-content.ts` | `ENTERPRISE_CLEANUP_DEPENDENCIES` | cmsParity gate |
| `config/cms-deprecations.ts` | `ENTERPRISE_CLEANUP_DEPENDENCIES` | cmsParity gate |
| `services/cms.ts` CMS fallbacks | `ENTERPRISE_CLEANUP_DEPENDENCIES` | cmsParity gate |
| `services/checkout-stock.ts` | Deprecated | Grep callers before removal |
| `app/api/upload/route.ts` (410) | Runtime test | Retirement test requires route |
| 98 knip unused exports in CMS/warehouse actions | Form actions | May be bound via forms not traced by knip |
| All 113+ migrations | Runtime | No DROP in this audit |
| `destructiveCleanupAllowed` | `services/enterprise-cleanup.ts` | **false** — no bypass |

---

## Prioritized implementation roadmap

### Phase 1 — P0 (week 1, highest ROI, behavior-preserving)

1. OPT-006 — Search index-first path
2. OPT-005 — Homepage CMS deduplication
3. OPT-001 — Storefront layout streaming split
4. OPT-002 — Proxy anonymous fast-path
5. OPT-003 — PDP auth decouple for guests
6. OPT-004 — Homepage progressive streaming

### Phase 2 — P1 (weeks 2–3)

7. OPT-007, OPT-013, OPT-014 — Search overlay + index payload
8. OPT-010, OPT-011 — Enterprise menu + CMS snapshot narrowing
9. OPT-008, OPT-009 — Catalog client split + admin orders pagination
10. OPT-012 — Category ISR
11. OPT-015–OPT-018 — PDP/list/blog query slimming
12. OPT-019–OPT-023 — React/Zustand/realtime fixes
13. OPT-024–OPT-027 — Image bandwidth
14. OPT-028–OPT-031 — DB indexes, Vercel ignore, package imports

### Phase 3 — P2 (backlog)

15. OPT-033–OPT-040 and summary table OPT-041–OPT-060
16. Dead code removal (OPT-034 safe 9 files)
17. CSS cleanup (OPT-035, OPT-036)

---

## Validation checklist (post-implementation)

```bash
npm run build
npm run typecheck
npx vitest run tests/supabase-free-plan-performance.test.ts tests/catalog-search-api.test.ts
npm run e2e:prod:seo
npm run e2e:prod:images
node tools/audit-delivered-image-widths.mjs
node tools/audit-asset-source-of-truth.mjs
```

**Production HEAD latency targets** (from `docs/performance-baseline-2026-07-09.md`):

| Route | Pre-audit | Target post-P0 |
|-------|-----------|----------------|
| `/` | ~3088 ms | <2000 ms |
| `/products` | ~1118 ms | <800 ms |
| `/category/agri-drones` | ~1668 ms | <1200 ms |
| `/product/agrione-x1` | ~1083 ms | <800 ms |

**Lighthouse targets:** LCP < 2.5s, CLS < 0.1 on mobile for `/`, `/products`, sample PDP.

---

## Rollback strategy

Each optimization is isolated to named files above. Revert individual commits/files without cross-dependencies. Database index migrations are additive and safe to drop if needed. No business logic changes are required for any finding.

---

*Audit completed 2026-07-10. Evidence: knip/depcheck/dead-code-audit output in `reports/`, parallel codebase deep-dives, direct file reads and greps. No source files were modified in this session.*
