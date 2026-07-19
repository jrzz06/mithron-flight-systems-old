# Dead Code Audit — Removal Log

All removals completed in a single conservative batch after manual verification (knip + `rg` + test cross-check). `destructiveCleanupAllowed` remains `false`; no migrations, auth, or enterprise-gated fallbacks were touched.

## Batch 1 — Orphan libraries and services

### lib/interest-slugs.ts
- Category: service
- Verdict: SAFE
- Evidence: knip unused file; `normalizeInterestSlug` zero call sites; not in `ENTERPRISE_CLEANUP_DEPENDENCIES`
- Validation: typecheck passed; build passed

### services/supplier-orders.ts
- Category: service
- Verdict: SAFE
- Evidence: knip unused file; `listSupplierOrderVisibility` zero call sites
- Validation: typecheck passed; build passed

### lib/auth/api-route-auth.ts
- Category: service
- Verdict: SAFE
- Evidence: knip unused file; `guardApiRoute` / `guardApiRouteWithPermission` zero call sites (API routes use inline guards)
- Validation: typecheck passed; build passed

### services/email/ensure-order-invoice-email.ts
- Category: service
- Verdict: SAFE
- Evidence: re-export alias only; callers use `@/services/invoice/payment-fulfillment` directly
- Validation: typecheck passed; build passed

### services/sms/twilio.ts
- Category: service
- Verdict: SAFE
- Evidence: knip unused file; no app imports; Supabase auth SMS uses config.toml provider, not this module
- Validation: typecheck passed; build passed

### lib/addresses/metadata-keys.ts
- Category: service
- Verdict: SAFE
- Evidence: knip unused file; zero imports
- Validation: typecheck passed; build passed

### lib/media/resolve-storefront-src-server.ts
- Category: service
- Verdict: SAFE
- Evidence: knip unused file; superseded by client/shared media helpers
- Validation: typecheck passed; build passed

### lib/media/responsive-image-model-server.ts
- Category: service
- Verdict: SAFE
- Evidence: knip unused file; zero imports
- Validation: typecheck passed; build passed

### lib/product-reviews/review-catalog.ts
- Category: service
- Verdict: SAFE
- Evidence: knip unused file; reviews loaded via CMS services
- Validation: typecheck passed; build passed

### lib/editor/index.ts
- Category: service
- Verdict: SAFE
- Evidence: barrel export never imported; editor uses direct module paths
- Validation: typecheck passed; build passed

### lib/editor/media-lifecycle.ts
- Category: service
- Verdict: SAFE
- Evidence: only imported by removed `lib/editor/index.ts`
- Validation: typecheck passed; build passed

## Batch 2 — Legacy UI replaced by platform shell

### components/admin/admin-nav.tsx
- Category: component
- Verdict: SAFE
- Evidence: knip unused file; admin nav lives in `components/platform/platform-nav.tsx`
- Validation: typecheck passed; build passed

### components/admin/admin-topbar.tsx
- Category: component
- Verdict: SAFE
- Evidence: knip unused file; topbar lives in `components/platform/platform-topbar.tsx`; contract tests read platform-topbar
- Validation: typecheck passed; build passed

### components/ui/glass-ui.tsx
- Category: component
- Verdict: SAFE
- Evidence: wrapper unused; `lib/glass-ui.ts` remains imported by `components/ui/button.tsx`
- Validation: typecheck passed; build passed

### components/invoice/invoice-template.tsx
- Category: component
- Verdict: SAFE
- Evidence: knip unused file; invoices use `lib/invoice/mithron-invoice-template.ts`
- Validation: typecheck passed; build passed

### sections/product/product-detail-section-nav.tsx
- Category: component
- Verdict: SAFE
- Evidence: knip unused file; PDP does not mount section nav; performance test asserts page does not contain `ProductDetailSectionNav`
- Validation: typecheck passed; build passed

### hooks/use-reveal-on-scroll.ts
- Category: hook
- Verdict: SAFE
- Evidence: only used by removed showcase reveal sections
- Validation: typecheck passed; build passed

## Batch 3 — Unmounted product showcase cluster

Removed 11 sections that formed an internal import graph but were never mounted from `app/(storefront)/product/[slug]/page.tsx`:

- `sections/product/showcase/product-comparison.tsx`
- `sections/product/showcase/product-downloads-section.tsx`
- `sections/product/showcase/product-faq-section.tsx`
- `sections/product/showcase/product-feature-spotlights.tsx`
- `sections/product/showcase/product-in-the-box.tsx`
- `sections/product/showcase/product-narrative-chapters.tsx`
- `sections/product/showcase/product-reveal-section.tsx`
- `sections/product/showcase/product-spec-explorer.tsx`
- `sections/product/showcase/product-trust-band.tsx`
- `sections/product/showcase/product-use-cases.tsx`
- `sections/product/showcase/product-value-proposition.tsx`

- Category: component
- Verdict: SAFE
- Evidence: knip unused files; no app/ imports; PDP uses hero, immersive gallery, rich description, sticky purchase only
- Test update: removed `product-narrative-chapters.tsx` from `tests/motion-audit-regression.test.ts` chrome list
- Validation: `tests/motion-audit-regression.test.ts` passed; typecheck passed; build passed

**Kept (actively used):** `product-showcase-hero.tsx`, `product-immersive-gallery.tsx`, `product-rich-description.tsx`, `product-sticky-purchase.tsx`, `product-showcase.module.css`

## Batch 4 — Orphan scripts and generated artifacts

### scripts/remove-backgrounds.mjs
- Category: script
- Verdict: SAFE
- Evidence: not referenced in `package.json` scripts; Python/cmd variants remain for manual ops
- Validation: typecheck passed; build passed

### scripts/smoke-mithron-category-routes.mjs
- Category: script
- Verdict: SAFE
- Evidence: not referenced in `package.json` scripts
- Validation: typecheck passed; build passed

### scripts/upload-to-supabase.mjs
- Category: script
- Verdict: SAFE
- Evidence: not referenced in `package.json` scripts (note: `scripts/remove-backgrounds-upload.cmd` still references it — see review queue)
- Validation: typecheck passed; build passed

### scripts/export-test-invoice.test.ts
- Category: script
- Verdict: SAFE
- Evidence: manual dev utility in `scripts/`; not part of CI contract suite intent
- Validation: typecheck passed; build passed

### scripts/generate-test-invoice.test.ts
- Category: script
- Verdict: SAFE
- Evidence: manual dev utility in `scripts/`; not part of CI contract suite intent
- Validation: typecheck passed; build passed

### docs/responsive-audit-artifacts/metrics.json
- Category: docs artifact
- Verdict: SAFE
- Evidence: generated audit output (~82 KB); no code imports
- Validation: N/A (non-code)

## Batch 3 — Plan files, Docker, Firebase, and local orphans (2026-07-04)

### Cursor plan files (outside git)
- Category: Cursor IDE artifacts
- Verdict: SAFE
- Count: **201** files deleted from `C:\Users\Administrator\.cursor\plans\`
- Selection: content matched `mithuuu|mithron`
- Validation: N/A (not in git)

### Dockerfile, docker-compose.yml, .dockerignore
- Category: deployment config
- Verdict: SAFE
- Evidence: zero references in CI (`.github/workflows/ci.yml`), README, or npm scripts; production deploys via Vercel only
- Validation: `npm run build` passed after removal

### next.config.ts — removed `output: "standalone"`
- Category: config
- Verdict: SAFE
- Evidence: setting existed solely for Docker `COPY .next/standalone`; Vercel does not need it
- Validation: `npm run build` passed

### firebase.json, .firebaserc
- Category: deployment config
- Verdict: SAFE
- Evidence: legacy Firebase Auth config; app uses Supabase; no `firebase` npm script; tests assert UI does not mention Firebase
- Validation: typecheck passed; build passed

### scripts/remove-backgrounds-upload.cmd
- Category: script
- Verdict: SAFE
- Evidence: calls missing `scripts/upload-to-supabase.mjs`; broken wrapper
- Validation: typecheck passed; build passed

### Local orphans (not in git)
- `d:\mithuuu\node_modules\` — orphan vitest cache at workspace parent
- `d:\mithuuu\mithuuu\.env.vercel-backup` — stale env snapshot (gitignored)

## Explicitly not removed

See `review-queue.md` for knip-flagged files kept due to contract tests, runtime routes, or enterprise cleanup gates.

## Batch — Safe cleanup allowlist (2026-07-19)

See `after.md` for full summary. Highlights:

- Memory leak fixes (navbar RAF, live-sync visibility teardown, paymentVersion LRU)
- Tier A/B dead file deletion with redirect pages preserved
- Dead catalog/store/search/utils export body removals
- Leads column select + dashboard open-queue query narrowing + catalog original-order memo
- Docs/log/artifact dead-weight cleanup
- Warehouse/CMS unused FormActions left **exported** (un-exporting trips `eslint --max-warnings=0`)
