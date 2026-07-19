# Control-Plane Security Review Findings

Date: 2026-07-19  
Scope: admin / warehouse / supplier portals, proxy auth, APIs, Server Actions  
Method: code-first audit + existing security tests + boundary tooling (non-destructive)

## Summary

| Severity | Count | Status |
|----------|-------|--------|
| Critical | 0 | — |
| High | 3 | Fixed (first pass) |
| Medium | 5 | M3/M4/M5 fixed (safe residual); M1/M2 accepted residual |
| Low | 4 | L4 fixed; L1/L2/L3 accepted residual |
| Pass | Multiple checklist areas | Verified |

---

## High (fixed)

### H1 — Warehouse order IDOR (horizontal privilege)

**Risk:** Warehouse operators with `orders.lifecycle` could mutate any order UUID via Server Actions. UI pages filtered with `filterOrdersForWarehouseScope`, but mutations did not call `orderMatchesWarehouseScope`. Client-supplied `warehouse_code` was also trusted.

**Repro (read-only confirmation):** Inspect `updateWarehouseOrderLifecycleFormAction`, `receiveWarehouseOrderFormAction`, `cancelWarehouseOrderFormAction`, `dispatchWarehouseOrderFormAction` — previously fetched by `order_id` only.

**Severity:** High

**Fix:** Assert `orderMatchesWarehouseScope` before mutations; include `metadata` in order select; ignore client `warehouse_code` for non-global (warehouse) operators. Covered by `tests/warehouse-order-scope-hardening.test.ts`.

### H2 — `/api/admin/prune-redis-ttls` edge policy mismatch

**Risk:** Handler expects `CRON_SECRET` bearer, but edge classified route as admin-session (`/api/admin/*`). Cron jobs without a session fail at the proxy; conversely the route was missing from the API security contract.

**Severity:** High (availability for cron; contract drift)

**Fix:** Added to bearer list in `resolveApiRoutePolicy()`; classified in `api-route-security-contract.test.ts` and `strict-rbac-matrix.test.ts`. Also classified `contact-defaults`.

### H3 — Layout handoff trust without JWT cross-check

**Risk:** Admin/warehouse/supplier layouts trusted `readSessionHandoff()` without verifying `userId` against the session cookie. Safe only while proxy always strips/re-injects; weaker than `getCurrentAuthContext()`.

**Severity:** High (defense-in-depth / proxy-bypass residual)

**Fix:** Layouts now call `getCurrentAuthContext()` only (handoff still used internally after JWT match). Documented in `SECURITY.md`. Contract test in `proxy-session-handoff-hardening.test.ts`.

---

## Medium

### M1 — Session timeout is JWT `iat` max-age, not sliding idle

**Status:** Accepted residual (safe pass skipped — changing idle semantics risks surprise logouts)  
**Severity:** Medium  
**Notes:** Product sign-off required before sliding activity cookies.

### M2 — Inventory global table not warehouse-scoped in UI helpers

**Status:** Accepted residual / partial (helper filters when `warehouse_code` present; schema unchanged)  
**Severity:** Medium  
**Notes:** Prefer `warehouse_stock` for operator-facing stock; no migration in safe pass.

### M3 — `fetchAdminRecordsByColumn` optional permission

**Status:** Fixed (documentation / typing only — runtime defaults unchanged)  
**Severity:** Medium  
**Fix:** Added `skipPermissionCheck?: true` option; annotated guest/system paths (invoice, checkout, payments). Permission still checked only when `requiredPermission` is set. Documented in `SECURITY.md`.

### M4 — Upload MIME trusts `file.type` (no magic-byte sniff)

**Status:** Fixed (additive)  
**Severity:** Medium  
**Fix:** `sniffMediaMimeFromBytes` + `assertMediaMimeMatchesContent` in `services/media-manager.ts`; wired into editor + product image uploads. Inconclusive sniff keeps declared allowlisted MIME. Tests: `tests/media-magic-byte-sniff.test.ts`.

### M5 — Error message leakage on some API routes

**Status:** Fixed  
**Severity:** Medium  
**Fix:** Sanitized 500 bodies on checkout lead/enquiry, product enquiry, contact-requests, catalog search, upload route (plus earlier admin-live / editor-upload). Validation 400s preserved.

---

## Low

### L1 — Redis role cache 30s TTL stale role window

**Status:** Accepted residual

### L2 — Admin MFA not enforced at proxy

**Status:** Accepted residual (proxy MFA enforcement risks admin lockout)

### L3 — No CORS `*` (pass) / SameSite CSRF reliance

**Status:** Accepted residual (current same-site model)

### L4 — Secrets hygiene script crash on missing tracked files

**Status:** Fixed  
**Fix:** `tools/verify-secrets-hygiene.mjs` skips missing tracked files with WARN instead of throwing ENOENT.

---

## Checklist area results

### 1. Authentication & Session — Pass (with M1)

| Check | Result |
|-------|--------|
| Logged-out `/admin/*`, `/warehouse/*`, `/supplier/*` | Blocked at `proxy.ts` + layouts |
| Session expiry invalidates access | Yes (JWT + `SESSION_TIMEOUT_MINUTES` via `iat`) |
| Revoked/disabled | `session_revoked_at` / governance gate + signOut |
| Logout server-side | `POST /auth/logout` calls `signOut()`; GET does not |

### 2. Authorization / Role boundaries — Pass after H1

| Check | Result |
|-------|--------|
| Cross-portal URL | `canAccessProtectedPath` strict prefixes |
| Supplier horizontal IDOR | Strong `supplier_id === context.userId` |
| Warehouse horizontal IDOR | **Was fail → fixed (H1)** |
| Server-side checks | Edge + layouts + `requirePermission` + RLS |

### 3. Session handoff spoofing — Pass after H3

| Check | Result |
|-------|--------|
| Client `x-mithron-auth-verified: 1` | Stripped in `applyRequestSecurityHeaders` |
| Role A session + Role B headers | Overwritten after strip; layouts no longer trust alone |
| Unit coverage | `proxy-session-handoff-hardening.test.ts` |

### 4. API / Server Actions — Pass after H2

| Check | Result |
|-------|--------|
| Contract test | Updated; previously failed on unclassified routes |
| Rate limits | Present on auth/public sensitive routes; fail-closed in prod |
| Bearer cron routes | Aligned for prune-redis-ttls |

### 5. Input validation — Pass / M4

Parameterized PostgREST; SVG blocked; size caps present.

### 6. Data exposure — Partial / M3 M5

Admin live + editor upload sanitized this pass.

### 7. CSRF — Pass

Logout POST-only; Server Actions origin protection; SameSite=lax cookies.

### 8. Infrastructure — Pass / L1 L4

No CORS `*`; Redis keys tenant-scoped; `.env.local` gitignored.

### 9. Business logic — Pass with residual race notes

Supplier ownership enforced; warehouse lifecycle has status transition guards (`assertOrderFulfillmentTransition`); concurrent double-submit mitigated partly by `expectedUpdatedAt` optimistic concurrency on lifecycle updates — recommend load test for race (not Critical).

---

## Probe notes

Live local probes (`http://127.0.0.1:3000`, 2026-07-19):

| Probe | Result |
|-------|--------|
| GET `/admin` (anon) | 307 → `/login?next=%2Fadmin` |
| GET `/warehouse` (anon) | 307 → `/login?next=%2Fwarehouse` |
| GET `/supplier` (anon) | 307 → `/login?next=%2Fsupplier` |
| GET `/admin` with spoofed `x-mithron-auth-*` only | 307 → login (headers stripped; no bypass) |
| GET `/auth/logout` | 307 → login with `logout_notice` (no sign-out) |
| GET `/api/admin/nav-metrics` (anon) | 401 Unauthorized |

- `npm run security:validate-boundaries` provisioned admin/warehouse/user personas successfully; run aborted on unrelated security denial telemetry 401 against Rest (environment), not on portal RBAC.
- Security unit suites green after fixes (contract, handoff, warehouse scope, logout CSRF, RBAC matrix).
- Live authenticated IDOR probe against two warehouse sites requires multi-warehouse staging fixtures; code path now rejects out-of-scope orders before mutation.

## Files changed this pass

### High pass
- `app/warehouse/actions.ts`
- `services/warehouse-scope.ts`
- `lib/auth/access-control.ts`
- `app/admin/layout.tsx`, `app/warehouse/layout.tsx`, `app/supplier/layout.tsx`
- `app/api/admin/live/[resource]/route.ts`
- `app/api/admin/archive-operational-data/route.ts`
- `app/api/editor/upload-image/route.ts`
- Tests: contract, RBAC, handoff, warehouse scope

### Safe residual pass
- `services/media-manager.ts`, `services/editor-image-upload.ts`, `services/product-image-upload.ts`
- `tests/media-magic-byte-sniff.test.ts`
- API 500 sanitization: checkout lead/enquiry, products enquiry, contact-requests, catalog search, upload
- `services/admin-actions.ts` + guest/system `skipPermissionCheck` annotations
- `tools/verify-secrets-hygiene.mjs`
- `SECURITY.md`, `SECURITY_REVIEW_FINDINGS.md`
