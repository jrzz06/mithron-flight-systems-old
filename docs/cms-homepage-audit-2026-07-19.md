# Homepage CMS Audit — 2026-07-19

Phase 0 artifact for the Mithron Homepage CMS Safe Restructure. **No code changes in this phase.**

## Dependency graph

```
/admin/cms (hub | ?page=advanced)
  └─ CmsHomeDashboardClient → Edit → /admin/cms/[sectionId] | Sheet
       └─ CmsSectionEditor + HomepageBuilderProvider
            ├─ modules/* (hero, mini, shelf, mission)
            ├─ inline forms (banners, reviews, articles pointer)
            └─ HomepageSectionPreview + iframe preview

Server Actions: app/admin/cms/actions.ts
  ├─ V1 draft/publish → admin_settings.payload.homepage (draftV1 → live)
  ├─ V2 draft/publish → admin_settings.payload.homepage.v2 (draftV2 → live)
  ├─ Hero workflow → hero_banners
  ├─ Footer → footer_columns / footer_links + payload.footer
  └─ revalidateCmsCutoverPaths + Redis cms:homepage

Storefront: app/(storefront)/page.tsx → homepage-bundle → sections/home/*
```

## Surfaces

| Concern | Location |
|---------|----------|
| Routes | `/admin/cms`, `/admin/cms/[sectionId]`, `/preview/home` |
| Context | `HomepageBuilderProvider` |
| Validation | `lib/cms/section-validation.ts`, `CMS_IMAGE_SPECS` |
| Permissions | `cms.write` (admin) |
| Catalog picker | `GET /api/admin/catalog/products` |
| Upload | `uploadCmsFieldImageAction` |

## Defects (Phase 1+)

1. Hero History link dead (wrong page/hash)
2. Mini carousel save does not clear parent dirty
3. Hero section preview returns null
4. Advanced CMS Visible/Hidden button only selects
5. Coarse shared V1/V2 draft badges
6. Mission tiles frozen at mount (discard gap)
7. Publish disabled while dirty
8. Related articles pointer-only (Phase 3)
9. Full-viewport mobile uses desktop image spec (Phase 5)
10. Form publish actions missing publish-policy assert

## Dead / unused (do not delete APIs)

- `duplicateCmsHomepageSectionFormAction` (duplicateEnabled: false)
- `saveProductReviewDraftFormAction` (retired stub)

## Gate

Audit accepted. Implementation proceeds Phase 1 → 9 without schema renames or API removals.
