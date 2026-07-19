# Control-Plane Perf Baseline — 2026-07-19

Measurement-first baseline before Batches 1–4. Sources: `PERF_ACTION_TIMING=1` server logs, `[mithron-proxy]` auth logs, `test-output/control-panel-perf-*.json`.

## E2E readyMs (click → content ready)

| Transition | readyMs | ttfbMs | DCL ms |
|------------|---------|--------|--------|
| admin Dashboard → Products | 2007 | 1515 | 1807 |
| admin Dashboard → Inventory | 2845 | 1083 | 1304 |
| admin Dashboard → Orders | 2221 | 920 | 1143 |
| admin Products → Inventory | 870 | 2684 | 2996 |
| admin Inventory → Orders | 1447 | 1868 | 2001 |
| admin Orders → CMS | **7376** | 1873 | 2070 |
| warehouse Dashboard → Orders | 1677 | 1508 | 2248 |
| warehouse Dashboard → Fulfillment | 1885 | 1023 | 1469 |
| warehouse Orders → Fulfillment | 1599 | 913 | 2512 |
| supplier Home → Products | **3562** | 1057 | 1505 |
| supplier Home → Inventory | 4625 | 1023 | 1464 |
| supplier Products → Inventory | 2091 | 924 | 1548 |

## Layer timings (from server logs)

| Route / loader | Cold edge auth ms | Warm edge auth ms | Page data cold ms | Page data warm ms |
|----------------|-------------------|-------------------|-------------------|-------------------|
| /admin (dashboard) | 350–732 | n/a (cache miss) | getAdminDashboardSnapshot 105–369 | 3–4 |
| /admin/products | 310–345 | n/a | getProductManagerSnapshot **476** | 4 |
| /admin/orders | 340–550 | n/a | getWarehouseSnapshot(orders) 48 | 2 |
| /admin/cms | 314 | n/a | getCmsCoreSnapshot **911** (+ marketing/advanced) | — |
| /warehouse/dashboard | 357–465 | n/a | getWarehouseSnapshot(dashboard) **1753** | 5 |
| /warehouse/orders | 323–381 | n/a | getWarehouseSnapshot(ordersList) **545** | 1–2 |
| /supplier products | 350–1122 | n/a | listSupplierProducts 243–318 | — |
| /supplier inventory | (same) | n/a | listSupplierInventory 244–560 | — |

**Auth note:** Every protected lookup logged `usedAuthRoleCache: false` / `warm: false` during this run. Redis Upstash URL appears quote-broken (`ERR_INVALID_URL` on `"https://…"/pipeline`), so edge role cache never warms. Layout handoff still skips layout RPC; `@shell` still calls `getClaims`. Edge auth alone is **~300–700ms per navigation**.

## Phase 2 — Root cause ranking (from numbers)

| Rank | Cause | Evidence | Impact |
|------|-------|----------|--------|
| **P0** | Snapshot / page data fan-out | CMS core 911ms; warehouse dashboard cold 1753ms; product manager 476ms; supplier inventory chain up to 560ms; Orders→CMS readyMs 7376 | Dominant for heavy routes |
| **P0** | Edge auth always cold | authLookups 300–1122ms, never warm | Adds 0.3–1.1s every nav (infra Redis broken; out of scope to fix Redis URL here) |
| **P1** | Duplicate shell getClaims (H13) | Layout uses handoff; `@shell` still `getCurrentAuthContext` | Secondary vs page data; Batch 3 |
| **P2** | Missing nested loading.tsx | Most smoke routes covered; invoice + nested fulfillment item gaps | Perceived only |
| **P3** | Realtime `router.refresh()` | Not measured in this nav baseline | Out of scope until stop gate |

**Priority for safe batches:** Batch 1 (perceived) → Batch 2 (trim/parallel page data) → Batch 3 (H13 shell) → Batch 4 (admin orders list/detail).
