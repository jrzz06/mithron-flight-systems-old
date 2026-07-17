# Dead Code Audit — Validation Report

Recorded after Batch 1–4 removals (see `removals.md`).

## Pipeline results

| Step | Command | Result | Notes |
|------|---------|--------|-------|
| Typecheck | `npm run typecheck` | **PASS** | No errors after 32 file removals |
| Lint | `npm run lint` | **FAIL (pre-existing)** | 10 errors, 17 warnings; none in deleted paths |
| Unit tests | `npm run test` | **FAIL (pre-existing)** | 72 failed / 933 passed (1007 total); failures unrelated to removed modules (warehouse UX contracts, store-nav, etc.) |
| Targeted tests | `npx vitest run tests/motion-audit-regression.test.ts` | **PASS** | Updated after showcase cluster removal |
| Build | `npm run build` | **PASS** | Compiled in ~22.4s; TypeScript ~27.8s; total ~82s |
| E2E | `npm run e2e` | **Not run** | Skipped — long-running; no removals touched e2e-critical paths beyond orphaned frames still under review |

## Post-removal scanner

| Metric | Before cleanup | After cleanup |
|--------|----------------|---------------|
| Knip unused files | 28 | **4** (all REVIEW / test-referenced) |
| Knip unused exports | 114 | 114 |
| Depcheck unused deps | 0 (3 false positives filtered) | 0 |

Command: `npm run audit:dead-code`

## Regression spot-checks (manual)

| Surface | Check | Result |
|---------|-------|--------|
| Storefront PDP | `app/(storefront)/product/[slug]/page.tsx` imports hero, gallery, rich description | OK |
| Admin shell | `platform-nav.tsx` / `platform-topbar.tsx` | OK |
| Glass buttons | `components/ui/button.tsx` → `lib/glass-ui.ts` | OK |
| Enterprise gate | `destructiveCleanupAllowed: false` unchanged | OK |

## Lint failure summary (not introduced by audit)

Notable pre-existing error categories:

- `react-hooks/set-state-in-effect` in cart, gallery, address manager
- `react-hooks/rules-of-hooks` in `mithron-responsive-image-img.tsx`
- Unused vars in checkout-stock, warehouse actions

Recommend addressing in a separate hardening PR, not mixed with dead-code cleanup.

## E2E recommendation

Before removing `supplier-frame` / `warehouse-frame` from the review queue, run:

```bash
npm run e2e -- tests/e2e/supplier.spec.ts
```
