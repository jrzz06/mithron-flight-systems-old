# UI/UX Audit Fix Pass — 2026-07-10

**Production URL:** `https://final-mithron-deploy.vercel.app`  
**Scope:** Full storefront + control-plane UI/UX — contrast, alignment/spacing, mobile root causes, overlay z-index

---

## Root causes found

| # | Root cause | Impact |
|---|------------|--------|
| 1 | **Glass/accent buttons use fixed dark ink (`#111`)** on translucent green — not surface-aware | "View Cart" in cart drawer, catalog dark hero CTAs near-invisible |
| 2 | **Undefined button classes** (`ambient-cta`, `platform-button-*`) | Warehouse filter + admin review queue buttons unstyled |
| 3 | **Low-opacity text** (`text-white/30`–`/50`) on `#0c0d10` surfaces | Footer labels, cart empty state, 404/403 copy |
| 4 | **Top utility bar** used light ink / low opacity on white background | Announcement/locale bar hard to read on homepage |
| 5 | **Shelf carousel cards allowed `min-width: 0`** in horizontal grid | Mobile shelves showed 4+ squashed cards with clipped text |
| 6 | **Image frames used transparent placeholder** before load | Blank white boxes in product cards during image fetch |
| 7 | **`html`/`body` `overflow-x: hidden`** masked horizontal overflow | Real layout bugs hidden instead of fixed |
| 8 | **Hero title `nowrap` at 768–899px** | Tablet-width headline overflow |
| 9 | **CMS product tables** without horizontal scroll wrapper | Wide tables forced page overflow on PDP |
| 10 | **Two disconnected z-index systems** (storefront tokens vs admin `z-10`–`z-[150]`) | Overlay collisions; search/cart/assistant shared `--z-overlay` |
| 11 | **Spacing scale (`--ds-s*`) bypassed** by ad-hoc px in cards/modules | Inconsistent gutters and card padding |
| 12 | **Mini-carousel labels** `nowrap` + narrow columns | Category rail truncated every label on mobile |

---

## Files changed

### Token foundation
| File | Change |
|------|--------|
| [`app/glass-interactive.css`](../app/glass-interactive.css) | Dark-surface glass tokens; `[data-surface="dark"]`, `.cart-drawer-root`, `.site-footer` overrides for light ink + stronger green fill |
| [`app/globals.css`](../app/globals.css) | Extended `--z-*` scale (overlay sub-layers, control-plane tiers, `--z-dropdown-panel`); `--ds-page-gutter`; `.page-gutter`; image skeleton placeholder; hero title breakpoint fix (900px); topbar contrast; cart-drawer panel z-index; removed `overflow-x: hidden` mask |
| [`app/platform.css`](../app/platform.css) | `platform-button-*` aliases to `platform-btn-*`; `ambient-cta` for warehouse |

### Contrast
| File | Change |
|------|--------|
| [`sections/catalog/catalog-page.tsx`](../sections/catalog/catalog-page.tsx) | `data-surface="dark"` on dark hero; raised eyebrow/subtitle opacity; `page-gutter` |
| [`components/overlays/cart-drawer.tsx`](../components/overlays/cart-drawer.tsx) | `data-surface="dark"`; empty-state text contrast |
| [`components/overlays/cart-drawer.module.css`](../components/overlays/cart-drawer.module.css) | `--cart-ink-tertiary` 0.5 → 0.72 |
| [`components/layout/site-footer.tsx`](../components/layout/site-footer.tsx) | `data-surface="dark"`; section headings/copyright 0.50 → 0.72 |
| [`app/not-found.tsx`](../app/not-found.tsx) | Light-surface text tokens (was `text-white/50` on light bg) |
| [`app/forbidden/page.tsx`](../app/forbidden/page.tsx) | Light-card text tokens (was `text-white/*` on white card) |
| [`components/overlays/cart-drawer-loading.tsx`](../components/overlays/cart-drawer-loading.tsx) | Spinner/text on light panel (was white on white) |

### Mobile responsiveness
| File | Change |
|------|--------|
| [`sections/home/home-landing-composite.module.css`](../sections/home/home-landing-composite.module.css) | Shelf card fixed width (`--shelf-card-width`); edge fade mask; mini-carousel 2-line labels + wider items; `overflow-x: clip` only |
| [`sections/home/home-shelf-shared.module.css`](../sections/home/home-shelf-shared.module.css) | Footer grid layout; `--ds-s*` padding; price truncation |
| [`sections/home/product-shelf-view-all-card.module.css`](../sections/home/product-shelf-view-all-card.module.css) | Fixed mobile card width |
| [`components/cards/product-hover-card.module.css`](../components/cards/product-hover-card.module.css) | Catalog body padding aligned to `--ds-s*` tokens |
| [`sections/product/showcase/product-showcase.module.css`](../sections/product/showcase/product-showcase.module.css) | CMS table `overflow-x` + `min-width` |

### Overlays / z-index
| File | Change |
|------|--------|
| [`components/overlays/search-overlay.module.css`](../components/overlays/search-overlay.module.css) | `--z-overlay-backdrop` / `--z-overlay-panel` |
| [`components/assistant/mithron-assistant-launcher.module.css`](../components/assistant/mithron-assistant-launcher.module.css) | `--z-overlay-launcher` |
| [`components/navigation/store-nav.tsx`](../components/navigation/store-nav.tsx) | Mobile menu panel `--z-dropdown-panel` |
| [`components/notifications/toast-provider.tsx`](../components/notifications/toast-provider.tsx) | Sonner `z-index: var(--z-toast)` |
| [`components/admin/admin-orders-workspace.tsx`](../components/admin/admin-orders-workspace.tsx) | `--z-cp-slideover-top` |
| [`components/admin/admin-slide-over.tsx`](../components/admin/admin-slide-over.tsx) | `--z-cp-slideover` |
| [`components/admin/inventory-manager.tsx`](../components/admin/inventory-manager.tsx) | `--z-cp-slideover` |
| [`components/admin/user-management-panel.tsx`](../components/admin/user-management-panel.tsx) | `--z-cp-modal-dropdown` |
| [`components/admin/cms/product-replace-picker.tsx`](../components/admin/cms/product-replace-picker.tsx) | `--z-cp-modal` |
| [`app/admin/products/product-catalog-grid.tsx`](../app/admin/products/product-catalog-grid.tsx) | `--z-cp-modal` / `--z-cp-modal-dropdown` |
| [`app/admin/products/product-detail-edit-dialog.tsx`](../app/admin/products/product-detail-edit-dialog.tsx) | `--z-cp-modal` |
| [`components/supplier/supplier-feedback-dialog.tsx`](../components/supplier/supplier-feedback-dialog.tsx) | `--z-cp-modal` |
| [`components/supplier/supplier-inline-result-dialog.tsx`](../components/supplier/supplier-inline-result-dialog.tsx) | `--z-cp-modal-dropdown` |
| [`components/account/account-nav.tsx`](../components/account/account-nav.tsx) | `--z-modal-backdrop` |

### Spacing / alignment
| File | Change |
|------|--------|
| [`components/blog/blog-article-card.module.css`](../components/blog/blog-article-card.module.css) | `--ds-s*` body padding |
| [`components/press/press-editorial-card.module.css`](../components/press/press-editorial-card.module.css) | `--ds-s*` padding |
| [`components/cart/cart-line-item.module.css`](../components/cart/cart-line-item.module.css) | `--ds-s3` row padding |

---

## Z-index scale (unified)

### Storefront
| Token | Value | Use |
|-------|-------|-----|
| `--z-nav` | 1000 | Navbar |
| `--z-dropdown` | 1100 | Mega-menu backdrop |
| `--z-dropdown-panel` | 1101 | Mobile nav panel |
| `--z-overlay-backdrop` | 1200 | Search/cart backdrops |
| `--z-overlay-panel` | 1210 | Cart drawer panel |
| `--z-overlay-launcher` | 1220 | Assistant FAB |
| `--z-popover` | 1250 | Assistant panel, mini-cart |
| `--z-modal-backdrop` | 1300 | Enquiry modal |
| `--z-modal` | 1310 | Modal content |
| `--z-toast` | 1400 | Toasts, confirm dialogs |

### Control plane
| Token | Value | Use |
|-------|-------|-----|
| `--z-cp-sticky` | 10 | Sticky table headers |
| `--z-cp-toolbar` | 20 | Sticky toolbars |
| `--z-cp-dropdown` | 40 | Platform topbar search |
| `--z-cp-modal` | 50 | Admin/supplier modals |
| `--z-cp-modal-dropdown` | 90 | Nested dropdowns |
| `--z-cp-slideover` | 140 | Slide-overs |
| `--z-cp-slideover-top` | 150 | Topmost admin modal |

---

## Page-by-page confirmation checklist

| Page / area | Dark-on-dark buttons | Alignment | Mobile overflow | Overlays |
|-------------|---------------------|-----------|-----------------|----------|
| Homepage `/` | Hero CTA uses tokenized light/dark modifiers; accent glass inherits dark-surface when needed | Shelf cards fixed width; mini-carousel 2-line labels | Shelf scroller edge fade; no `overflow-x: hidden` mask | Nav/search/cart/assistant layered |
| Catalog `/products` | Dark hero uses `data-surface="dark"` + glass variant | `page-gutter` gutters; catalog card padding unified | Footer grid for price+CTA | — |
| Category pages | Showcase hero contrast unchanged (white on image) | `page-gutter` on grid | CMS tables scroll horizontally on PDP | — |
| PDP | Purchase CTAs black/white (existing) | — | Spec tables scroll | Enquiry modal at `--z-modal` |
| Cart drawer | View Cart accent → light ink on dark | — | Full-width panel | Backdrop 1200 / panel 1210 |
| Footer | Links ≥70% white opacity | Section spacing tokens | — | — |
| 404 / 403 | Default button on light surface | — | — | — |
| Admin / warehouse / supplier | `platform-button-*` + `ambient-cta` defined | — | — | CP z-index tokens applied |

**Breakpoints to verify manually:** 375, 390, 414, 768, 1024, 1440px

---

## Verification commands

```bash
npm run build
npm run typecheck
```

Pre-existing test type errors in `tests/catalog-card-image.test.ts`, `tests/orders-export.test.ts`, etc. are unrelated to this pass.

---

*Fix pass completed 2026-07-10.*
