# Dead Code Audit — Baseline Metrics

Captured: 2026-07-02 (pre-cleanup)

## Repository

- **Root:** `d:\mithuuu\mithuuu`
- **Project:** mithron-flight-systems (Next.js 16 + Supabase)

## File counts (git-tracked)

| Extension | Count |
|-----------|------:|
| `.ts` | 622 |
| `.tsx` | 326 |
| `.sql` | 113 |
| `.mjs` | 72 |
| `.css` | 14 |
| `.json` | 15 |
| `.md` | 5 |
| Other (images, fonts, py, cjs, etc.) | ~110 |
| **Total tracked files** | ~1,280 |

## Lines of code

| Scope | Lines |
|-------|------:|
| `.ts`, `.tsx`, `.js`, `.mjs`, `.cjs`, `.css`, `.sql` (git-tracked) | ~140,499 |

## Application surface

| Surface | Count |
|---------|------:|
| App Router pages (`page.tsx`) | 79 |
| API routes (`app/api/**/route.ts`) | 38 |
| Supabase migrations | 113 |
| Vitest test files (`tests/**/*.test.ts`) | ~232 |
| Playwright e2e specs | 10 |

## Dependencies

| Type | Count |
|------|------:|
| `dependencies` | 38 |
| `devDependencies` | 18 |

## Build / bundle (not captured in CI — run manually)

| Metric | Value |
|--------|-------|
| `npm run build` duration | _Run post-audit for comparison_ |
| Bundle analyzer (`npm run analyze`) | _Optional; compare `.next` analyzer output_ |

## Enterprise cleanup gate

- `services/enterprise-cleanup.ts` sets `destructiveCleanupAllowed: false`
- Staged removals must respect `ENTERPRISE_CLEANUP_DEPENDENCIES` gates

## Notes

- `tools/**/*.ts` excluded from `tsc` typecheck
- No knip/depcheck configured at baseline
- Retirement tests document intentionally kept 410/legacy routes (`app/api/upload`, etc.)
