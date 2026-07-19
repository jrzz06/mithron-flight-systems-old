# Control-Plane Perf — Final Report (Batches 1–4)

**Date:** 2026-07-19  
**Baseline:** [control-plane-perf-baseline-2026-07-19.md](./control-plane-perf-baseline-2026-07-19.md)  
**Scope:** Safe 10% fixes only (Batches 1–4). No medium-risk caching / realtime / pagination.

## Phase 2 causes confirmed

| Cause | Confirmed? | Notes |
|-------|------------|-------|
| Snapshot fan-out | **Yes (P0)** | CMS core cold ~911ms; warehouse dashboard cold ~1753ms; product manager ~476ms |
| Duplicate auth (edge + shell) | **Partial** | Edge auth always cold (~300–700ms) because Redis auth cache never warms (`usedAuthRoleCache: false`; Upstash URL quote bug — out of scope). Layout uses JWT-checked `getCurrentAuthContext`; Batch 3 removed shell duplicate via handoff. |
| Missing loading.tsx | **Low** | Smoke routes already covered; Batch 1 filled invoice + nested fulfillment item |
| Realtime `router.refresh()` | Not in nav baseline | Still out of scope |

## Batches landed

| Batch | Status | Change |
|-------|--------|--------|
| 1 | Pass | `loading.tsx` for invoice + fulfillment item |
| 2 | Pass | Slim `PRODUCT_LIST_SELECT`; drop list `shipment_tracking`; lean `getProductCategoryOptions`; supplier products overlap |
| 3 | Pass | H13: `@shell` uses `readSessionHandoff` first (admin/warehouse/supplier) |
| 4 | Pass | Admin orders list → `ordersList` + `loadWarehouseOrderDetail` + lean catalog/inventory for selection |
| Reverted | None | — |

## Before / after (e2e readyMs)

> Dev-server readyMs is noisy (Turbopack compile, always-cold edge auth). Prefer directional trends + server `[perf]` scope changes.

| Metric | Baseline | After Batch 4 | Target Met? |
|--------|----------|---------------|-------------|
| Admin Orders nav (warm) `admin-dashboard-orders` | 2221 ms | 2547 ms | **No** (still >1s; within noise; list now `ordersList`) |
| Warehouse Dashboard nav (warm) `warehouse-dashboard-orders` | 1677 ms | 2557 ms | **No** |
| Supplier Products nav (warm) `supplier-home-products` | 3562 ms | **2017 ms** | Improved; still >1s |
| Auth duplicate overhead | Layout handoff + shell `getClaims`; edge 300–700ms always cold | Shell handoff skips shell `getClaims` when proxy headers present; edge still cold (Redis) | Partial |
| Perceived wait (skeleton) | Gaps on invoice / nested item | Skeletons present on smoke + those gaps | **Yes** |
| Admin Orders → CMS | 7376 ms | **3366 ms** | Improved |
| Admin Dashboard → Inventory | 2845 ms | **1388 ms** | Improved |

### Server-side confirmation (post Batch 4)

- Admin orders loads `getWarehouseSnapshot` with **`scope=ordersList`** (no catalog/inventory fan-out on list).
- Product manager cold path still present but list columns trimmed (no description/gallery/specs blobs).
- Category options no longer call full product snapshot.

## Stop gate

Navbar click-to-ready remains **above a snappy (~1s) target** on key routes, dominated by:

1. Always-cold edge auth (~0.3–0.7s) — Redis URL misconfigured (out of scope)
2. Remaining page data (CMS, warehouse dashboard cold) and client paint

**Recommendation:** Stop here. Do **not** start medium-risk work without explicit approval. Next candidates if approved:

- Fix Upstash Redis URL quoting so auth role cache warms
- Incremental realtime (reduce warehouse/supplier `router.refresh()`)
- Surgical control-plane read caching / broader pagination

## Out of scope (untouched)

Storefront, cart, checkout, Redis infra fix, proxy security model changes, schema migrations, UI redesign.
