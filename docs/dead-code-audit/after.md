# Dead Code Audit — After Metrics

Captured: 2026-07-04 (Phase 1 optimization cleanup)

## Comparison to July 2026 baseline

| Metric | Jul 2 baseline | Jul 4 after Phase 1 | Delta |
|--------|---------------:|--------------------:|------:|
| Git-tracked page routes | 79 | 72 | −7 legacy category pages |
| API routes (`app/api/**/route.ts`) | 38 | 37 | −4 orphan routes |
| Knip unused exports (pre-prune scan) | 114 | 136 → pruned 54 | −54 export keywords |
| Knip safe candidates | 43 | 58 | rebaselined |
| Runtime npm deps | 38 | 39 | +1 `@tiptap/core` (explicit declaration) |
| Local `public/` files | 2 | 1 | −1 stale manifest |
| Deployment artifacts (Docker/Firebase) | 5 tracked | 0 | −5 files (Batch 3) |

Prior batch (Jul 2): 32 files / ~1,454 LOC removed — see `removals.md`.

## Phase 1 removals (2026-07-04)

### Redirect-only pages removed (100% confidence)

Permanent redirects in `next.config.ts` already handle traffic:

- `app/(storefront)/agriculture/page.tsx` → `/category/agri-drones`
- `app/(storefront)/video-drones/page.tsx` → `/category/video-drones`
- `app/(storefront)/creative-drones/page.tsx` → `/category/creative-drones`
- `app/(storefront)/mapping/page.tsx` → `/category/survey-drones`
- `app/(storefront)/surveillance/page.tsx` → `/category/surveillance-drones`
- `app/(storefront)/accessories/page.tsx` → `/category/accessories`
- `app/(storefront)/industrial/page.tsx` → `/category/global-products`

### Orphan API routes removed (96–98% confidence)

| Route | Reason |
|-------|--------|
| `app/api/editor/generate-image/route.ts` | Zero in-repo callers |
| `app/api/enquiries/route.ts` | Superseded by `/api/contact-requests` |
| `app/api/payments/intent/route.ts` | Checkout creates intents inline |
| `app/api/auth/provision/route.ts` | Superseded by `/auth/callback` provisioning |

**Kept:** `app/api/upload/route.ts` (410 retirement contract).

### Assets and config hygiene

- Removed `public/optimized/agrone-mission/manifest.json` (orphan; webp siblings absent)
- Removed stale `/login-bg*.webp` image patterns from `next.config.ts`
- Updated CMS `revalidatePath` targets in `app/admin/cms/actions.ts` to `/category/*` paths
- Added `@tiptap/core` to `package.json` dependencies

### Export pruning

- Ran `tools/prune-safe-exports.mjs` against 58 knip SAFE candidates
- **54** unused exports demoted to module-private (`export` removed)
- **2** symbols restored after build verification (`findDemoAccessAccountByRole`, `glassPillClassName`) — re-export/import chain false negatives
- **1** barrel fix: removed dead `PageHeader` re-export from `components/platform/index.ts`

### Build unblock (minimal TS fixes, not cleanup scope)

Fixed pre-existing production type errors blocking validation:

- `lib/admin/shelf-slot-product.ts` — variant fields → specs-based SKU/stock
- `sections/home/home-landing-composite.tsx` — `MediaAsset` import
- `services/catalog.ts` — await async `mapRowsWithCatalogMedia`, price coercion

## Verification results

| Gate | Result | Notes |
|------|--------|-------|
| `npm run build` | **PASS** | Production TypeScript + compile |
| `npm run audit:dead-code` | **PASS** | Rebaselined 2026-07-04 |
| Targeted vitest (7 files) | **28/31 PASS** | See below |
| Playwright store category | **PASS** | Desktop category hero spec |
| `npm run lint` | Not re-run | Pre-existing failures in uncommitted CMS work |

### Targeted test results

**Passed:** motion-audit-regression, mithron-invoice-template, agrone-assets-pipeline (regenerates manifest), auth-provisioning, contact-requests-workflow, api-route-security-contract

**Pre-existing failures (not caused by Phase 1 deletions):**

- `final-cms-cutover-cleanup.test.ts` — expects `HeroCarouselDynamic` / `data-order-detail-panel`; homepage and orders workspace refactored in ongoing CMS work

## Estimated reduction (Phase 1 only)

| Dimension | Estimate |
|-----------|----------|
| Repository size | ~500 KB–1 MB (pages, APIs, manifest, export surface) |
| Client JS bundle | ~0 KB (removed items server-only or redirect-only) |
| Build time | Minor improvement (fewer routes to compile) |
| Maintenance | Fewer orphan routes, cleaner CMS revalidation paths |

## Rollback commands

```powershell
git checkout -- app/(storefront)/agriculture/page.tsx app/(storefront)/video-drones/page.tsx app/(storefront)/creative-drones/page.tsx app/(storefront)/mapping/page.tsx app/(storefront)/surveillance/page.tsx app/(storefront)/accessories/page.tsx app/(storefront)/industrial/page.tsx
git checkout -- app/api/editor/generate-image/route.ts app/api/enquiries/route.ts app/api/payments/intent/route.ts app/api/auth/provision/route.ts
git checkout -- public/optimized/agrone-mission/manifest.json
npm run build
```

## Remaining manual review (90–99% confidence)

See `review-queue.md` plus audit plan:

- 4 knip “unused” components with contract-test references
- `data/mithron-products-crawled.generated.json` (pipeline-only, tracked)
- CDN duplicate asset hashes (visual QA required)
- `.reveal` CSS selectors in `product-showcase.module.css`

## Protected (unchanged)

- Invoice HTML/JS files (per user instruction)
- Runtime `data/*.generated.json` and Wix review snapshots
- All SQL migrations, auth/checkout/payment webhooks, CMS dual-stack
- `destructiveCleanupAllowed: false` in `services/enterprise-cleanup.ts`

## Batch 3 removals (2026-07-04)

- **201** Cursor plan files deleted from `~/.cursor/plans/` (mithuuu/mithron content)
- **5** git-tracked files removed: Docker trio + Firebase pair
- **1** broken script removed: `scripts/remove-backgrounds-upload.cmd`
- **Config:** removed `output: "standalone"` from `next.config.ts`
- **Local:** deleted orphan `d:\mithuuu\node_modules` and `.env.vercel-backup`
- **Validation:** `npm run typecheck` PASS, `npm run build` PASS

## Batch — Safe cleanup allowlist (2026-07-19)

### Leak fixes
- `hooks/use-adaptive-navbar-tone.ts` — cancel recursive surface-ready RAF; reset mount flag on cleanup
- `lib/control-plane/shared-live-sync-coordinator.ts` — remove armed visibility listener on teardown
- `components/admin/orders/admin-orders-live-state.tsx` — LRU cap (~200) on `paymentVersionByOrderId`

### Tier A + Tier B file deletes
- 19 Tier A unused files (press forms, archive sync, CMS shells, config barrels, DataTable, etc.)
- 12 Tier B files after contract-test retarget (stub actions, frames, badge, enterprise panel, media viewer, etc.)
- Redirect pages **kept**: `/admin/enquiries`, `/admin/contact-requests`, `/admin/press`, `/admin/archives`

### Dead export body removals
- Catalog: `getDroneWorldProducts`, `getDroneCareProducts`, `getProductsByCategory`, `searchProducts`, `getRelatedProducts`
- Store/search/utils: `useCartItems`, `useCartSource`, `useBuyNowActive`, search haystack/score helpers, `clearRecentSearches`, `STORE_CURRENCY_CODE`, `clamp`

### Query / listing opts
- Leads/enquiries: `select=*` → shared `LEADS_REST_SELECT`
- Dashboard queue: `status=new&limit=8` at query time
- Catalog listing: memoize `buildCatalogOriginalOrder`

### Dead weight
- Logs, `tmp-product-nav.mjs`, load-test before/after JSON, redundant 2026-07-18 docs (kept full-static + performance-baseline)
- `.gitignore`: `tools/load-test-results*.json`

### Validation (2026-07-19)
- `npm run typecheck` PASS
- `npm run build` PASS
- Targeted Vitest (16 files / 101 tests) PASS
- Knip remaining: ~183 unused exports (FormAction bodies kept exported for contract greps + lint)
- Full suite still has pre-existing drift failures unrelated to this pass (e.g. warehouse-panel, workflows allocate)
