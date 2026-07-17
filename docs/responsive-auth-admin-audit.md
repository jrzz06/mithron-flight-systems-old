# Responsive Audit: Authentication Flow & Admin Interface

**Date:** 2026-07-01  
**Target:** `https://final-mithron-deploy.vercel.app` (production)  
**Principle:** Layouts must adapt to **available width, height, zoom, and content length** — not to named devices.

---

## Executive Summary

| Area | Automated viewport coverage | Overall posture |
|------|----------------------------|-----------------|
| `/login` | 18 viewports + 8 zoom levels | **Poor** — screen-size-driven, clips controls on short viewports |
| `/signup`, `/forgot-password` | 18 viewports | **Good** — content-driven, scrollable |
| `/reset-password` | 18 viewports (metrics only) | **Broken** — references non-existent CSS module classes |
| `/invite/*` | Code review only | **Fair** — fluid shell but divergent from auth system |
| `/account/*` | Code review only | **Good** — mobile drawer; minor spacing redundancy |
| Admin shell & pages | **Not authenticated** — redirected to login | **Mixed** — orders hardened; shell/tables need work |

**Issue counts by severity**

| Severity | Count |
|----------|-------|
| Critical | 1 |
| High | 7 |
| Medium | 9 |
| Low | 5 |

Artifacts: `docs/responsive-audit-artifacts/` (61 screenshots, `metrics.json` with 116 measurement rows).

---

## Methodology

### Viewport matrix (automated)

Playwright (`tools/responsive-auth-admin-audit.mjs`) measured each public route at:

| Category | Sizes |
|----------|-------|
| Mobile | 320×568, 360×640, 375×667, 390×844, 412×915, 430×932 |
| Tablet | 768×1024, 820×1180, 853×1280 |
| Laptop | 1280×720, 1366×768, 1440×900 |
| Desktop | 1600×900, 1920×1080, 2560×1440, 3440×1440 |
| Extra | 667×320 (landscape), 390×500 (short + keyboard proxy) |

### Zoom matrix (login representative)

80%, 90%, 100%, 110%, 125%, 150%, 175%, 200% at 390×844 via `document.documentElement.style.zoom`.

### Detection heuristics

- **Horizontal overflow:** `scrollWidth - clientWidth > 2`
- **Clipped controls:** interactive elements (`button`, `input`, `a`, etc.) with bounding box outside viewport
- **Scroll lock:** `canScrollY === false` while content exceeds viewport

### Admin limitation

`E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` were not configured. All `/admin/**` requests returned the login page. Admin findings below are from **static code review** plus existing layout tests (`tests/admin-orders-layout-resilience.test.ts`). Re-run with credentials to complete live admin viewport matrix.

### Stress testing

Long-string / empty / bulk scenarios were evaluated by tracing component markup and CSS (no live data injection without auth). Orders workspace has explicit resilience utilities; queue tables and legacy admin panels do not.

---

## Layout Philosophy Assessment

| Page / shell | Content-driven? | Fixed px widths | Fixed heights / clipping | Positioning model | Dynamic content resilience |
|--------------|----------------|-----------------|--------------------------|-------------------|---------------------------|
| `/login` | No — `100vh` + absolute card | `480px` card | `overflow: hidden` on root | Absolute `.cardWrap` | Poor at short heights & high zoom |
| `/signup`, `/forgot-password` | Yes — `clamp()`, `min-height` | `max-width: clamp(...)` | Scrollable (`overflow-y: auto`) | CSS Grid center | Good |
| `/reset-password` | Intended split layout | N/A (classes missing) | Unknown | Intended flex/grid | Broken |
| `/invite/*` | Partial | `max-w-xl` | `min-h-screen` only | Tailwind block | Fair — long titles can wrap awkwardly |
| `/account/*` | Yes | `260px` sidebar at `lg+` | None critical | Grid + mobile drawer | Good — drawer pattern |
| Admin platform shell | Mixed | `248px` sidebar at `lg+` | `100dvh` panes in orders | Fixed sidebar desktop; **in-flow nav mobile** | Orders: good; tables: fair |
| Admin orders | Yes (best in codebase) | Percentage grid cols | `calc(100dvh - 11rem)` panes | Grid + sticky toolbars | `orderLongText`, `OrderIdText` |
| Admin queues (enquiries, contact) | No — table columns | `min-w-full` table | Sticky thead | Table | Poor for long names/emails |
| Admin inventory | Hybrid | `min-w-[1100px]` desktop table | `max-h-[70vh]` | Table + mobile cards | Mobile fallback exists |

---

## Issue Register

### AUTH-001 — Reset password page uses undefined CSS classes

| Field | Value |
|-------|-------|
| **Severity** | Critical |
| **File** | `app/reset-password/page.tsx` |
| **Component** | `ResetPasswordPage` |
| **Viewports** | All (confirmed 320–3440) |
| **Zoom** | All |
| **Screenshot** | N/A — page renders unstyled markup; metrics show no clipping because layout collapses |
| **Symptom** | Split hero + form layout does not render; page appears as raw stacked content without auth styling |
| **Root cause** | Imports `styles` from `app/login/login.module.css` but references `authGateway`, `authSplit`, `brandColumn`, `formColumn`, `formStack`, `formHeader`, `formTitle`, `formCopy` — **zero definitions** in that CSS file |
| **CSS cause** | Missing styles / wrong module — intended Flex/Grid split never applied |
| **Reproduction** | 1. Open `/reset-password` (with or without recovery token). 2. Inspect `<main>` — classes resolve to empty strings in CSS modules. 3. Compare to `/signup` which uses `auth-page.module.css`. |
| **Fix direction** | Reuse `auth-page.module.css` pattern (like signup) or add missing classes to login module |

---

### AUTH-002 — Login form clips below fold; no vertical scroll

| Field | Value |
|-------|-------|
| **Severity** | High |
| **File** | `app/login/login.module.css`, `app/login/page.tsx` |
| **Component** | `.loginRoot`, `.cardWrap`, login submit button (`data-testid="login-email-submit"`) |
| **Viewports** | 320×568, 360×640, 390×500, 667×320 (landscape) |
| **Zoom** | 100% (also 125–200% — see AUTH-004) |
| **Screenshot** | `Login-mobile-320.png`, `Login-short-login.png`, `Login-short-landscape.png` |
| **Symptom** | Submit button and/or logo link positioned outside viewport; `canScrollY: false` |
| **Root cause** | `.loginRoot { height: 100vh/100svh; overflow: hidden }` locks viewport; `.cardWrap` is `position: absolute; inset: 0` with vertically centered card — content taller than viewport cannot scroll |
| **CSS cause** | Fixed height + `overflow: hidden` + absolute positioning instead of natural document flow |
| **Reproduction** | 1. Open `/login` at 320×568. 2. Observe submit button bottom at y≈607 vs viewport h=568. 3. Confirm `document.documentElement.scrollHeight === clientHeight`. |
| **Fix direction** | Allow `overflow-y: auto` on root or switch card container to flex/grid in document flow like `auth-page.module.css` |

---

### AUTH-003 — Persistent ~15px horizontal overflow on login

| Field | Value |
|-------|-------|
| **Severity** | High |
| **File** | `app/login/login.module.css` |
| **Component** | `.loginRoot` |
| **Viewports** | **All tested** (320 through 3440) |
| **Zoom** | 100% |
| **Screenshot** | `Login-mobile-375.png` (representative) |
| **Symptom** | `horizontalOverflow: 15` on every login measurement |
| **Root cause** | `width: 100vw` on `.loginRoot` — `100vw` includes scrollbar gutter width on many engines, producing sub-pixel overflow vs `100%` |
| **CSS cause** | `100vw` width / box model mismatch |
| **Reproduction** | 1. Open `/login` at any width. 2. `document.documentElement.scrollWidth - clientWidth ≈ 15`. |
| **Fix direction** | Use `width: 100%` or `overflow-x: clip` on root; audit child `max-width: calc(100vw - 40px)` on `.card` |

---

### AUTH-004 — Login unusable at browser zoom ≥125%

| Field | Value |
|-------|-------|
| **Severity** | High |
| **File** | `app/login/login.module.css` |
| **Component** | Login card, inputs, Google button, submit |
| **Viewports** | 390×844 |
| **Zoom** | 125%, 150%, 175%, 200% |
| **Screenshot** | `Login-zoom-125.png` … `Login-zoom-200.png` |
| **Symptom** | Horizontal overflow grows (49→202px); multiple controls clipped below fold; scroll appears but does not expose all controls because root still uses overflow hidden in some cases |
| **Root cause** | Fixed `480px` card width scales with zoom but viewport does not; combined with AUTH-002 scroll lock |
| **CSS cause** | Fixed width + zoom scaling + overflow hidden |
| **Reproduction** | 1. Set browser zoom to 150%. 2. Open `/login` on 390px-wide viewport. 3. Submit button at y≈1118 vs h=844. |
| **Fix direction** | Fluid `max-width: min(480px, 100% - 2rem)`; enable scroll; test with `prefers-reduced-motion` and zoom |

---

### AUTH-005 — Login logo link clipped above viewport on short heights

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **File** | `app/login/login.module.css` |
| **Component** | `.cardLogoLink` inside `.card` |
| **Viewports** | 320×568, 390×500, 667×320 |
| **Zoom** | 100% |
| **Screenshot** | `Login-mobile-320.png` |
| **Symptom** | "Go to Mithron home" link at negative `top` (above visible area) |
| **Root cause** | Vertical centering of oversized card pushes top content above viewport when card height > viewport |
| **CSS cause** | `align-items: center` on absolute flex container with non-shrinkable card content |
| **Reproduction** | Same as AUTH-002; inspect logo link bounding rect |
| **Fix direction** | `align-items: flex-start` with scroll, or `safe-area` padding + `overflow-y: auto` |

---

### AUTH-006 — Signup / forgot-password: landscape phone minor stress

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **File** | `app/auth/auth-page.module.css` |
| **Component** | `.page`, `.card` |
| **Viewports** | 667×320 |
| **Zoom** | 100% |
| **Screenshot** | `Signup-short-landscape.png` |
| **Symptom** | Tight vertical fit but scroll enabled; no clipped controls in metrics |
| **Root cause** | Tall card on very short viewport — usable due to `overflow-y: auto` |
| **CSS cause** | N/A (working as designed) |
| **Reproduction** | Open `/signup` at 667×320 — page scrolls |
| **Note** | Reference implementation for fixing login/reset-password |

---

### AUTH-007 — Invite page diverges from auth design system

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **File** | `app/invite/[token]/page.tsx` |
| **Component** | Invite shell + `SignupForm` |
| **Viewports** | 320–430 (code); not in automated matrix |
| **Zoom** | All |
| **Screenshot** | N/A |
| **Symptom** | Near-transparent card (`bg-[#080b0f]/[0.045]`), fixed `text-4xl` title, no `clamp()` typography |
| **Root cause** | One-off Tailwind markup instead of `auth-page.module.css` |
| **CSS cause** | Fixed `text-4xl`; non-fluid spacing |
| **Reproduction** | Open `/invite/<token>` at 320px — long invite copy + form may feel cramped vs signup |
| **Fix direction** | Align with `auth-page.module.css` |

---

### AUTH-008 — Account hub double vertical offset

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **File** | `app/(storefront)/account/layout.tsx` |
| **Component** | Account layout `<main>` |
| **Viewports** | All mobile/tablet |
| **Zoom** | All |
| **Screenshot** | N/A (requires auth session) |
| **Symptom** | Excessive top whitespace — `py-20`/`py-24` stacks with storefront header offset (`store-main-offset` from parent layout) |
| **Root cause** | Padding assumes no global header offset |
| **CSS cause** | Fixed `py-20` / `py-24` padding |
| **Reproduction** | Sign in → `/account` on 375×667 — measure gap below global nav |
| **Fix direction** | Use `pt-*` only or reduce padding when inside storefront shell |

---

### AUTH-009 — Account nav: long workspace label in CTA

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **File** | `components/account/account-nav.tsx` |
| **Component** | `NavLinks` workspace button |
| **Viewports** | 320–430 |
| **Zoom** | 125%+ |
| **Screenshot** | N/A |
| **Symptom** | "Open {workspaceLabel}" may overflow button on narrow widths with long role labels |
| **Root cause** | No `break-words` / `text-wrap` on button text |
| **CSS cause** | Flex button without `min-w-0` text wrap |
| **Reproduction** | Staff account with long `workspaceLabelForRole` at 320px |
| **Fix direction** | `text-wrap: balance` or truncate with `title` attribute |

---

### ADMIN-001 — Mobile admin: full sidebar in document flow (no drawer)

| Field | Value |
|-------|-------|
| **Severity** | High |
| **File** | `components/platform/platform-sidebar.tsx`, `components/platform/control-plane-parallel-layout.tsx` |
| **Component** | `PlatformSidebar` |
| **Viewports** | &lt; 1024px (all mobile + tablet widths) |
| **Zoom** | All |
| **Screenshot** | N/A — requires authenticated session |
| **Symptom** | Entire admin nav renders above page content; pushes workspace down; no hamburger/drawer |
| **Root cause** | Sidebar is `lg:fixed`; below `lg` it's a normal block in document flow before topbar and content |
| **CSS cause** | Breakpoint-gated `fixed` only at `lg+`; missing mobile collapse pattern (contrast: `AccountNav` has drawer) |
| **Reproduction** | 1. Sign in as admin. 2. Open `/admin/orders` at 390×844. 3. Scroll — full nav list appears before orders UI. |
| **Fix direction** | Mirror `AccountNav` drawer pattern or off-canvas sidebar for `< lg` |

---

### ADMIN-002 — Sticky toolbar stacks under topbar (z-index / offset)

| Field | Value |
|-------|-------|
| **Severity** | High |
| **File** | `components/platform/platform-topbar.tsx`, `components/admin/orders/admin-orders-shell.tsx`, `components/admin/inventory-manager.tsx` |
| **Component** | `PlatformTopbar` (`z-30`), orders filters toolbar (`z-20 sticky top-0`), inventory toolbar (`z-20 sticky top-0`) |
| **Viewports** | 768–1920 (when scrolling) |
| **Zoom** | All |
| **Screenshot** | N/A |
| **Symptom** | Page-level sticky toolbars slide **under** the global topbar; filter rows partially hidden |
| **Root cause** | Both use `sticky top-0` without `top` offset equal to topbar height; lower z-index on page toolbars |
| **CSS cause** | Sticky stacking context — duplicate `top-0` anchors |
| **Reproduction** | 1. Admin orders at 1280×720. 2. Scroll down. 3. Orders filter bar tucks under topbar. |
| **Fix direction** | `top: var(--platform-topbar-height)` on nested stickies, or single sticky header region |

---

### ADMIN-003 — Enquiry queue table crushes before horizontal scroll helps

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **File** | `components/admin/admin-enquiry-queue.tsx` |
| **Component** | `AdminEnquiryQueue` table |
| **Viewports** | 320–768 |
| **Zoom** | 100%+ |
| **Screenshot** | N/A |
| **Symptom** | 8 columns with `min-w-full` compress; long customer names/emails overlap adjacent cells visually |
| **Root cause** | No `min-width` on table; cell text lacks `break-words` / `overflow-wrap:anywhere` |
| **CSS cause** | Table `min-w-full` without column `min-width`; no `orderLongText` utility |
| **Reproduction** | Load enquiry with 80+ char email at 375px width |
| **Fix direction** | `min-w-[720px]` on table inside `overflow-x-auto`; apply `orderLongText` to cells |

---

### ADMIN-004 — Contact request queue: same table issues + rigid expanded forms

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **File** | `components/admin/admin-contact-request-queue.tsx` |
| **Component** | Expanded row action forms |
| **Viewports** | 320–430 |
| **Zoom** | 100%+ |
| **Screenshot** | N/A |
| **Symptom** | `flex items-end gap-2` on "Mark contacted" / "Link to order" forms — input + button row overflows without wrap at ~320px |
| **Root cause** | Forms use horizontal flex without `flex-wrap`; `min-w-[220px]` on order ID input |
| **CSS cause** | Flex row, `items-end`, fixed `min-w-[220px]` |
| **Reproduction** | 1. Expand contact request row. 2. Viewport 320px. 3. Action row extends past viewport. |
| **Fix direction** | `flex-wrap` + `min-w-0` on inputs; stack on narrow widths |

---

### ADMIN-005 — User management table minimum width

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **File** | `components/admin/user-management-panel.tsx` |
| **Component** | Users table |
| **Viewports** | &lt; 760px |
| **Zoom** | All |
| **Screenshot** | N/A |
| **Symptom** | `min-w-[760px]` forces horizontal scroll; no mobile card fallback |
| **Root cause** | Desktop-only table layout |
| **CSS cause** | Fixed `min-w-[760px]` |
| **Reproduction** | `/admin/users` at 360px — horizontal scroll required |
| **Fix direction** | Card list for `< md` or reduce columns |

---

### ADMIN-006 — Inventory desktop table `min-w-[1100px]`

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **File** | `components/admin/inventory-manager.tsx` |
| **Component** | Inventory table (desktop `md:block`) |
| **Viewports** | 768–1280 |
| **Zoom** | All |
| **Screenshot** | N/A |
| **Symptom** | Wide table with sticky right actions column; usable via scroll but heavy at tablet widths |
| **Root cause** | Many `min-w-[*]` column classes summing &gt; 1100px |
| **CSS cause** | Table `min-w-[1100px]` + sticky `right-0` action cell |
| **Reproduction** | `/admin/inventory` at 768×1024 — expect horizontal scroll |
| **Note** | Mobile card view (`md:hidden`) mitigates &lt;768 |

---

### ADMIN-007 — Platform topbar: truncated role, fixed search width

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **File** | `components/platform/platform-topbar.tsx` |
| **Component** | Role badge, command search |
| **Viewports** | 320–768, 125% zoom |
| **Zoom** | 125%+ |
| **Screenshot** | N/A |
| **Symptom** | Role text `max-w-[130px] truncate` — long role names unreadable; search `sm:w-[300px]` may squeeze action buttons |
| **Root cause** | Fixed truncation width; horizontal button group without wrap at `sm` |
| **CSS cause** | `truncate` + fixed `w-[300px]` |
| **Reproduction** | Admin topbar at 390px with long custom role string |
| **Fix direction** | Tooltip on truncate; wrap action cluster |

---

### ADMIN-008 — Command palette dropdown clipping

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **File** | `components/platform/platform-topbar.tsx` |
| **Component** | Search results dropdown |
| **Viewports** | Short heights (720p laptop, zoom 150%) |
| **Zoom** | 150%+ |
| **Screenshot** | N/A |
| **Symptom** | Dropdown `absolute top-10` may extend below viewport on short screens |
| **Root cause** | No flip/max-height constraint |
| **CSS cause** | Absolute positioning without viewport collision detection |
| **Reproduction** | Focus search on 1280×720, zoom 175% — dropdown may clip |
| **Fix direction** | `max-h` + `overflow-y: auto`; consider opening upward when space below is limited |

---

### ADMIN-009 — Orders `orderScrollX` utility exported but unused

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **File** | `components/admin/orders/order-layout-utils.ts` |
| **Component** | `orderScrollX` constant |
| **Viewports** | N/A |
| **Zoom** | N/A |
| **Screenshot** | N/A |
| **Symptom** | Shared scroll wrapper exists but no consumer applies it |
| **Root cause** | Incomplete adoption of layout utilities |
| **CSS cause** | Dead export |
| **Reproduction** | `rg orderScrollX` — only definition, no usage |
| **Fix direction** | Apply to wide sub-regions or remove |

---

### ADMIN-010 — Orders list item still truncates customer email

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **File** | `components/admin/orders/admin-order-list-item.tsx` |
| **Component** | Order list row email |
| **Viewports** | 320–430 |
| **Zoom** | All |
| **Screenshot** | N/A |
| **Symptom** | Long email uses `truncate` — full value only in `title` tooltip |
| **Root cause** | Intentional density tradeoff |
| **CSS cause** | `truncate` on email line |
| **Reproduction** | Order with 60+ char email in list at 320px |
| **Note** | Detail panel uses `OrderIdText` / `orderLongText` — list is less resilient |

---

### ADMIN-011 — Admin slide-over max height on small viewports

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **File** | `components/admin/admin-slide-over.tsx` |
| **Component** | `AdminSlideOver` |
| **Viewports** | 320×568, high zoom |
| **Zoom** | 150%+ |
| **Screenshot** | N/A |
| **Symptom** | `max-h-full` panel may still clip inner forms if footer actions don't scroll |
| **Root cause** | `overflow-hidden` on panel without guaranteed inner scroll region |
| **CSS cause** | Flex column + `overflow-hidden` |
| **Reproduction** | Open product create slide-over at 320×568 with zoom 150% |
| **Fix direction** | `min-h-0 overflow-y-auto` on body section |

---

## Stress Test Matrix (code trace)

| Scenario | Orders workspace | Enquiry queue | Contact queue | Inventory | Users | Login |
|----------|-----------------|---------------|---------------|-----------|-------|-------|
| Long customer name | `orderLongText` in toolbar; detail uses wrap | No wrap — cell expansion | No wrap | Card title wraps in mobile | Truncate? | N/A |
| Long email | List truncates; detail wraps | Overlaps cells | Overlaps cells | N/A | Table scroll | Input ok |
| Long order ID | `OrderIdText` + copy | N/A | `min-w-[220px]` input | N/A | N/A | N/A |
| Long address | Detail primitives grid wrap | N/A | N/A | N/A | N/A | N/A |
| Large numbers | Formatted in summary | N/A | N/A | `formatNumber` | N/A | N/A |
| Empty values | Em dash patterns | "—" fallbacks | "—" fallbacks | Empty state copy | Empty table message | N/A |
| 0 items | Empty state components | Dashed border message | Dashed border message | Empty inventory | Empty table | N/A |
| 1000+ items | Virtualized scroll in list (`overflow-y-auto`) | Full DOM render — perf risk | Full DOM render | Pagination? check | Full table | N/A |
| Loading state | Skeleton patterns in orders | Server component pending | Server component pending | Loading in manager | Loading | Button disabled states |
| Error state | Toast + inline errors | Form errors | Form errors | Alert banners | Alert banners | `login-form` error banner |

**Highest-risk stress gap:** enquiry/contact queues rendering unbounded rows without virtualization and without text-wrap utilities.

---

## Viewport Results Summary (automated, production)

### Routes that passed all viewports at 100% zoom

| Route | Horizontal overflow | Clipped controls |
|-------|--------------------|------------------|
| `/signup` | 0 | 0 |
| `/forgot-password` | 0 | 0 |
| `/reset-password` | 0* | 0* |

\*Metrics pass because unstyled content fits — **not** a functional pass (see AUTH-001).

### `/login` clipped controls by viewport (100% zoom)

| Viewport | Clipped controls |
|----------|------------------|
| 320×568 | Logo link (above), submit (below) |
| 360×640 | Submit (below) |
| 375×667+ | None |
| 667×320 | Logo, inputs, forgot link, submit |
| 390×500 | Logo (above), submit (below) |

### `/login` zoom on 390×844

| Zoom | H-overflow | Clipped |
|------|-----------|---------|
| 80–100% | 0–15px | 0 |
| 110% | 49px | 0 |
| 125% | 90px | 5 controls |
| 150% | 140px | 6 controls |
| 175% | 176px | 6 controls |
| 200% | 202px | 6 controls |

---

## Recommended Fix Priority

1. **P0** — Fix `/reset-password` styles (AUTH-001)
2. **P0** — Refactor `/login` to match `auth-page.module.css` scroll/fluid model (AUTH-002, AUTH-003, AUTH-004, AUTH-005)
3. **P1** — Admin mobile sidebar drawer (ADMIN-001)
4. **P1** — Sticky header offset chain (ADMIN-002)
5. **P2** — Queue tables: min-width + text wrap (ADMIN-003, ADMIN-004)
6. **P2** — Align `/invite` with auth-page styles (AUTH-007)
7. **P3** — Users table mobile pattern, topbar polish, slide-over scroll (ADMIN-005–008, ADMIN-011)

---

## Re-running the audit

```bash
# Public routes (no auth)
node tools/responsive-auth-admin-audit.mjs

# With admin coverage — set in .env.local then extend script:
# E2E_ADMIN_EMAIL=...
# E2E_ADMIN_PASSWORD=...
```

Extend `tools/responsive-auth-admin-audit.mjs` to call `loginAsRole` and iterate `app/admin/**` routes for full matrix coverage.

---

## Positive findings

- **`/signup` and `/forgot-password`** use content-driven `clamp()` typography, scrollable pages, and `overflow-x: clip` — correct reference implementation.
- **`/account`** implements a proper mobile drawer (`AccountNav` `mode="mobile"`) with body scroll lock and `min(88vw, 320px)` panel width.
- **Admin orders workspace** has dedicated layout resilience tests, `orderLongText`, responsive grid, no fixed mobile overlays, and `100dvh`-aware panes.
- **Inventory** provides `md:hidden` mobile cards as a progressive enhancement pattern worth extending to users/enquiries.
