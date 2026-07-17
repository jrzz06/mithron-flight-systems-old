# Final Storefront Responsive QA Pass — 2026-07-11

**Scope:** Customer-facing storefront + auth + account (12 pages)  
**Test matrix:** 320, 344, 375, 390, 414, 768, 820, 853, 1024, 1180, 1366, 1440px

---

## Defects found (pre-fix) → resolution

| Page / area | Breakpoint(s) | Bug class | Root cause | Fix |
|-------------|---------------|-----------|------------|-----|
| Global | All | z-index | Incomplete overlay scale; `--z-overlay-backdrop` referenced but undefined | Completed scale in `globals.css`; wired search/cart/assistant |
| PDP | 320–1023 | overlap | Assistant FAB collided with sticky purchase bar | `:root:has([data-product-mobile-purchase-bar])` sets `--store-bottom-chrome: 12rem`; FAB uses `--assistant-fab-offset` |
| Global | ≤1023 | touch-target | Buttons default 42px / sm 36px | `--store-button-height: 44px`; Button CVA uses `min-h` without ellipsis clipping |
| Global | All | horizontal-scroll (masked) | `html`/`body` `overflow-x: clip` hid real bugs | Removed global mask; containment on intentional scrollers only |
| Catalog | All | overlay/fade | `mask-image` on `.shell::before` clipped grid background | Replaced with low-opacity pattern (no mask) |
| Home shelves | 768–1023 | layout | Tablet inherited desktop grid; foldables lacked intermediate peek | Extended horizontal shelf scroll to 1023px; tokens at 390/820/853 |
| Cart drawer | 320–344 | fixed-width | Panel max-width could exceed narrow viewport | Fluid `max-width: min(100vw, 420px)` / `100vw` at ≤390 |
| Product cards | ≤640 | touch-target | Catalog CTA `min-height: 38px` | Raised to `var(--mobile-touch-min)` |
| View-all shelf card | All | overlay/fade | Radial `mask-image` clipped card art | Removed mask; kept decorative gradients at reduced opacity |

---

## Files changed

| File | Change |
|------|--------|
| `app/globals.css` | Z-index sub-layers; breakpoint tokens; touch/button tokens; FAB/bottom-chrome; removed html/body overflow-x mask; tablet shelf tokens; `:root:has()` purchase-bar offset |
| `app/storefront-density.css` | Button heights `max(44px, scaled)` on tablet/desktop density |
| `components/ui/button.tsx` | 44px min touch; removed text ellipsis clipping |
| `components/overlays/search-overlay.module.css` | Backdrop/panel z-index tokens |
| `components/overlays/cart-drawer.tsx` | Root z-index → `--z-overlay-backdrop` |
| `components/overlays/cart-drawer.module.css` | Narrow viewport fluid width |
| `components/assistant/mithron-assistant-launcher.module.css` | `--z-overlay-launcher`, `--assistant-fab-offset` |
| `components/assistant/mithron-assistant-launcher.tsx` | `data-assistant-launcher` probe hook |
| `components/assistant/mithron-assistant-panel.module.css` | Bottom sheet breakpoint 639→767 (phone vs tablet) |
| `components/cards/product-hover-card.module.css` | Catalog CTA 44px at ≤640 |
| `sections/catalog/catalog-page.module.css` | Removed clipping mask-image on decorative grids |
| `sections/home/home-shelf-shared.module.css` | Tablet scroll to 1023px; shelf hero CTA 44px |
| `sections/home/product-shelf-view-all-card.module.css` | Removed radial mask; tablet width rules to 1023 |
| `tests/e2e/mobile-layout-audit.spec.ts` | Full 12-page × 12-width matrix + overflow asserts + screenshots |
| `tests/mobile-responsive-contract.test.ts` | Z-index, overflow mask, FAB, button, breakpoint contracts |
| `tools/responsive-audit-probe.mjs` | Assistant launcher selector |
| `playwright.config.ts` | Local webServer uses `npm run dev` |

---

## Z-index scale (storefront)

| Token | Value | Use |
|-------|-------|-----|
| `--z-fixed-bar` | 60 | PDP mobile purchase bar |
| `--z-nav` | 1000 | Navbar |
| `--z-dropdown` / `--z-dropdown-panel` | 1100 / 1101 | Mega-menu / mobile nav |
| `--z-overlay-backdrop` | 1200 | Search/cart backdrops |
| `--z-overlay-panel` | 1210 | Cart drawer panel |
| `--z-overlay-launcher` | 1220 | Assistant FAB |
| `--z-popover` | 1250 | Assistant panel, mini-cart |
| `--z-modal-backdrop` / `--z-modal` | 1300 / 1310 | Enquiry modal |
| `--z-toast` | 1400 | Toasts, confirm dialogs |

---

## Confirmation table (page × breakpoint)

Verified clean via automated overflow + FAB overlap probes and contract tests (2026-07-11).

| Page | 320 | 344 | 375 | 390 | 414 | 768 | 820 | 853 | 1024 | 1180 | 1366 | 1440 |
|------|-----|-----|-----|-----|-----|-----|-----|-----|------|------|------|------|
| `/` homepage | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/products` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/category/agri-drones` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/product/pixy-lr` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/search` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/cart` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/checkout` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/blog` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/about` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/contact` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/login` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/account` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

---

## Screenshots

Captured at **344, 390, 820, 1024** for each page:

`tests/screenshots/mobile-audit/{page-id}/{width}-after.png`

Example paths:
- `tests/screenshots/mobile-audit/homepage/344-after.png`
- `tests/screenshots/mobile-audit/product-detail/820-after.png`

---

## Verification commands

```bash
npm test -- tests/mobile-responsive-contract.test.ts
node tools/responsive-audit-probe.mjs
npx playwright test tests/e2e/mobile-layout-audit.spec.ts
```
