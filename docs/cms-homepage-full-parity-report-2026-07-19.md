# CMS Homepage Full Parity — implementation report

Date: 2026-07-19  
Decisions: Testimonials **1A** (CMS-owned cards), Related Articles **2A** (variable-length CMS cards).

## Schema changes (explicit)

| Change | Location | Notes |
|--------|----------|-------|
| `testimonialCards: CmsTestimonialCard[]` | `config/homepage-cms-v2.ts` | Homepage carousel source of truth; no DB migration |
| `relatedArticles.items: CmsRelatedArticle[]` | same | Was fixed tuple of 3; now variable length |
| `CmsRelatedArticle.ctaLabel` | same | Defaults to `"Read Article"` |
| Avatar override fields | `CmsTestimonialCard.avatarSrc/Alt` | Falls back to linked product image |

`customer_order_reviews` unchanged for product pages. Homepage no longer reads featured reviews for the carousel.

## File-by-file summary

| File | Change |
|------|--------|
| `config/homepage-cms-v2.ts` | Schema + merge for cards / variable articles |
| `config/homepage-section-registry.ts` | Recalibrated `CMS_IMAGE_SPECS`; mission/testimonial specs; employee field copy |
| `lib/cms/section-validation.ts` | Testimonials + absolute-URL related-article validation |
| `components/admin/cms/cms-image-field.tsx` | Inline validation (no toast on reject); WebP crop export; empty placeholder |
| `components/admin/cms/testimonials-section-editor.tsx` | **New** — header + card CRUD + product picker + avatar |
| `components/admin/cms/related-articles-section-editor.tsx` | **New** — variable card CRUD |
| `components/admin/cms/mission-tile-editor.tsx` | Per-tile image specs (hero / wide / small) |
| `features/admin/cms/cms-section-editor.tsx` | Hide hero top-bar Publish; wire new editors; shelf CTA href; fullViewportMobile spec; real validation |
| `app/admin/cms/actions.ts` | V2 patch/slice for cards; variable articles; testimonials publish saves header+cards |
| `sections/home/home-client-testimonials-section.tsx` | `pickHomeTestimonialItemsFromCms` |
| `sections/home/home-landing-composite.tsx` | Uses CMS testimonial cards |
| `sections/home/home-below-hero.tsx` | Loads products for card slugs; drops homepage review fetch |
| `sections/home/home-related-articles-section.tsx` | CMS custom cards preferred when present |
| `sections/home/home-page-content.tsx` | Dropped `customerReviews` prop pass-through |
| `services/homepage-bundle.ts` | Testimonial product hydration; no `listFeaturedHomeReviews` |
| `components/editorial/editorial-cover-card.tsx` | Honors `ctaLabel` |
| `features/admin/cms/homepage-section-preview.tsx` | Preview from CMS cards |
| Tests | Updated contracts + new validation/merge tests |

## Reliability (Part A)

- Hero action-bar Publish no longer publishes V2 homepage (per-slide publish remains).
- Related Articles / Reviews stubs replaced with real forms (Save/Publish operate on form data).
- Prior mutex / AbortController / Discard remount / section-scoped V1 revert retained.

## Image specs reference (upload targets)

| Surface | Aspect | Min | Max size | Notes |
|---------|--------|-----|----------|-------|
| Hero | ~3:1 | 1600×533 (rec 2400×800) | 2.5 MB | Soft aspect; text-safe left ~40% |
| Mini carousel icon | 1:1 | 300×300 | 0.5 MB | Spec ready; UI still product-driven |
| Shelf / inter-shelf banner | ~3:1 | 1920×650 | 2 MB | Featured collection + inter-shelf |
| Full viewport desktop | 16:9 | 1920×1080 exact | 3 MB | |
| Full viewport mobile | 9:16 | 1080×1920 exact | 3 MB | Wired to `CMS_IMAGE_SPECS.fullViewportMobile` |
| Mission left hero | 1:1 | 1000×1000 | 2 MB | Tile index 0 |
| Mission right hero | ~2.2:1 | 1800×820 | 2 MB | Tile index 1 |
| Mission small cards | 3:2 | 900×600 | 2 MB | Tiles 2+ |
| Testimonial avatar | 1:1 | 200×200 | 0.5 MB | Optional override |
| Related article poster | 16:10 | 1050×700 | 2 MB | Matches storefront cover CSS |

Storefront containers often use clamped heights / `object-fit: cover` rather than fixed CSS `aspect-ratio` (except related articles 16/10 and some mission mobile cards).

## Cleanup done

- Removed `/admin/blog` and `/admin/reviews` stub links from homepage section editors.
- Removed unused header/settings form components from `cms-section-editor.tsx`.
- Single status pill remains in `cms-editor-action-bar.tsx`.
- Kept live inter-shelf + full-viewport sections in the builder outline.

## Verify locally

1. Edit each section → Save Draft → Publish → hard-refresh `/`.
2. Testimonials: add/remove/reorder; avatar defaults to product image.
3. Related Articles: add/remove/reorder; absolute https links open in new tab.
4. Reject wrong-ratio / oversized upload inline (no generic toast).
5. Double-click Save/Publish; navigate mid-search — console clean.
