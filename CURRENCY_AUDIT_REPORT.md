# Currency Audit Report

**Date:** 2026-06-24  
**Policy:** Indian market — all user-facing prices in INR (₹) with `en-IN` numbering.

## Summary

| Metric | Count |
|--------|------:|
| Files scanned | ~700+ (ts, tsx, js, json, html, md, sql, cjs, mjs) |
| USD display violations found | 1 |
| Files modified | 4 |
| Remaining user-facing USD issues | 0 |

## Root cause (mega menu)

The surveillance mega menu showed `From $452000` because `services/catalog-navigation.ts` built fallback product specs with a hard-coded USD template:

```ts
`From $${product.price}`
```

All other storefront surfaces already used `formatINR()` from `lib/utils.ts`.

## Files modified

1. **`services/catalog-navigation.ts`** — Price spec now uses `formatFromINR(product.price)` (e.g. `From ₹4,52,000`).
2. **`lib/utils.ts`** — Added `formatFromINR()` and `STORE_CURRENCY_CODE` constant.
3. **`tools/validate-currency-policy.mjs`** — CI guard against `$`, `USD`, `US Dollar`, `Dollar`, and USD currency settings.
4. **`tests/currency-policy.test.ts`** — INR formatting, mega menu price spec, and policy validator tests.

## Areas audited (status)

| Area | Status | Notes |
|------|--------|-------|
| Navigation / mega menus | **Fixed** | Was the only USD display bug |
| Product cards | OK | `formatINR` / `From {formatINR(...)}` |
| Product pages | OK | Configurator, related products, tax labels |
| Search overlay | OK | `formatINR` |
| Cart & checkout | OK | `formatINR`, payment `currency: "INR"` |
| Order summaries (account/admin/ops/warehouse) | OK | `formatINR` |
| Admin dashboards & reports | OK | `formatINR` |
| Structured data (SEO) | OK | `priceCurrency: "INR"` |
| Payments (Razorpay) | OK | `currency: "INR"` |
| Mock / seed / API tooling | OK | INR defaults |
| CMS / JSON product data | OK | Numeric `price` fields (no `$` prefix) |
| Email templates | N/A | No email templates in repo |
| PDF exports | N/A | No PDF export templates in repo |

## Indian numbering examples (`formatINR`)

| Amount | Formatted |
|-------:|-----------|
| 999 | ₹999 |
| 12,500 | ₹12,500 |
| 1,25,000 | ₹1,25,000 |
| 12,50,000 | ₹12,50,000 |
| 1,20,00,000 | ₹1,20,00,000 |

## Validation

Run manually:

```bash
npm run validate:currency
```

Included in test suite via `tests/currency-policy.test.ts`.

### Forbidden patterns (enforced)

- `From $`
- `USD` / `US Dollar` / `Dollar` in user-facing strings
- `currency: "USD"` / `priceCurrency: "USD"`
- Literal `$` + digit price strings in source

### Allowlisted (not violations)

- Template literals `` `${...}` ``
- SQL `$1` placeholders in migrations
- `parseProductPrice()` stripping legacy `$` from admin form input
- Regex replacement groups (`$1`, `$2`)

## Remaining notes

- **Admin price input:** `parseProductPrice` still accepts pasted `$` amounts and normalizes them to numbers. Display always uses INR.
- **International pricing:** Not implemented; no dedicated USD storefront mode exists.
