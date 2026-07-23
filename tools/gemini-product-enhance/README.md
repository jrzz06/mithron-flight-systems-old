# Gemini Product Enhance — Full Catalog Pipeline

Enhance every catalog photo via **Gemini chat (Playwright)** → **BRIA RMBG 2.0** cutout → **1000×1000 WebP**, stage for approval, then upload to `mithron-products`.

## Pipeline

```
discover.mjs  →  manifest.json
run_batch.mjs →  Gemini enhance → BRIA cutout → staging/{slug}/{slug}-0N.webp
manual review →  approved/{slug}/
upload.js     →  products/{slug}/ai-enhanced/{slug}-0N.webp (+ archive originals)
```

## Setup

```bash
cd tools/gemini-product-enhance
npm install
npx playwright install chromium
pip install rembg pillow onnxruntime   # BRIA RMBG 2.0 via rembg model bria-rmbg
# .env already points at mithron-products
```

### Key `.env` values

| Key | Default | Purpose |
|-----|---------|---------|
| `SOURCE_BUCKET` | `mithron-products` | Catalog bucket |
| `WORKERS` | `1` | Parallel Gemini profiles (1–3) |
| `REMBG_MODEL` | `bria-rmbg` | BRIA RMBG 2.0 |
| `DELAY_MIN_SEC` / `DELAY_MAX_SEC` | 2 / 4 | Pause between images |
| `ARCHIVE_ORIGINALS` | `1` | Copy sources to `wix-content/_archive/` on upload |

## Discover catalog

```bash
node discover.mjs
# optional: ONLY_MATCH=v9-flight node discover.mjs
# optional: DISCOVER_LIMIT=10 node discover.mjs
```

Writes `manifest.json` with every `products/{slug}/wix-content/*` image as `{slug}-01.webp` … `{slug}-05.webp`.

## Batch process

```bash
# Pilot one product
node run_batch.mjs --only=v9-flight --limit=1 --workers=1

# Ten images
node run_batch.mjs --limit=10 --workers=1

# Full catalog (1 browser). Use --workers=2 or 3 after logging into gemini_profile_2 / _3
node run_batch.mjs --workers=1
```

**First run:** Chromium opens with `gemini_profile/` — sign in to Gemini once; later runs reuse the session.

Outputs per image:

- `staging/{slug}/{slug}-0N.webp` — 1000×1000, transparent, q≈85
- `staging/{slug}/{slug}-0N.preview.png`
- `staging/{slug}/{slug}-0N.meta.json`
- `run-log.jsonl` — resume/skip log (existing WebPs are skipped)

Cutout-only (reuse existing Gemini raw under `downloads/`):

```bash
node run_batch.mjs --only=v9-flight --skip-gemini --no-skip
```

## Approve + upload

1. Review `staging/{slug}/*.webp`
2. Move good files **and** matching `.meta.json` into `approved/{slug}/`
3. Prefer IMAGE BUCKET → `upload_image_bucket.mjs` (writes `ai-cutout/` + thumbnail/medium variants)
4. Legacy: `node upload.js` uploads to `ai-enhanced/` (storage only; not used by live storefront)

### Backfill thumbnails for existing ai-cutouts

```bash
node backfill_ai_cutout_variants.mjs --dry-run
node backfill_ai_cutout_variants.mjs --apply
```

Adds `.thumbnail.webp` / `.medium.webp` beside masters and fills `media_assets.responsive_variants`. Does not delete masters.

## Cutout centering (alpha bbox)

Storefront cutouts in `D:/mithuuu/IMAGE BUCKET` must be **cropped to the visible product** (`alpha >= 32`, largest component), then placed on a **1000×1000** transparent canvas with **equal L/R and T/B** padding (`fit_cutout_to_square` in `tools/wix_ai_pipeline/square_canvas.py`).

```bash
# Measure visual center; flag anything beyond ±5 px
python validate_cutout_centering.py --tolerance=5

# Re-center only flagged WebPs (no BiRefNet / GPU required)
python recenter_flagged_cutouts.py

# Re-check
python validate_cutout_centering.py --tolerance=5
```

Reports: `centering-validation-report.json` / `.md`

## Single-image demo (legacy)

```bash
node generate.js   # uses BUCKET_NAME/FOLDER_PATH, PROCESS_LIMIT
```

## Notes

- Gemini **web chat only** (no API). Visible browser + delays + anti-automation flags.
- ETA ~15–40h @ 1 worker or ~6–15h @ 3 workers for ~190 images.
- Do not commit `.env`, `gemini_profile*`, or large staging binaries.
