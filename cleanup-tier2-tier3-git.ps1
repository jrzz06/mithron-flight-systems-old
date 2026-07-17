# =============================================================================
# cleanup-tier2-tier3-git.ps1
# -----------------------------------------------------------------------------
# TIER 2 + TIER 3 - Git-tracked removals and orphaned-script deletions.
# This SHRINKS the tracked working tree (~29 MB from screenshots + ~0.13 MB
# of dead scripts). Changes are staged via `git rm`; you still need to commit.
#
# NOTE: `git rm` removes files from the working tree AND stages the deletion.
# History size only shrinks after a history rewrite (git gc / filter-repo);
# this script does not rewrite history.
#
# REVIEW BEFORE RUNNING. This script is NOT executed automatically.
# Run from the project root:  d:\mithuuu\mithuuu
#   powershell -ExecutionPolicy Bypass -File .\cleanup-tier2-tier3-git.ps1
# =============================================================================

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

Write-Host "TIER 2/3 git cleanup starting..." -ForegroundColor Cyan

# -----------------------------------------------------------------------------
# TIER 2 - Screenshot dumps (full delete from git AND disk, ~28 MB)
# -----------------------------------------------------------------------------
Write-Host "Removing tracked screenshot dumps..."
git rm -r --quiet -- 'tests/screenshots'
git rm -r --quiet -- 'docs/screenshots'

# -----------------------------------------------------------------------------
# TIER 2 - Stale generated snapshot (untrack only, keep file on disk).
# Matches the existing .gitignore rule `data/*.snapshot.json`; regenerate via
# `npm run products:fetch-wix`.
# -----------------------------------------------------------------------------
Write-Host "Untracking data/wix-catalog.snapshot.json (kept on disk)..."
git rm --cached --quiet -- 'data/wix-catalog.snapshot.json'

# -----------------------------------------------------------------------------
# TIER 3 - Orphaned tools/ scripts (zero cross-references in repo).
# -----------------------------------------------------------------------------
Write-Host "Removing orphaned tools/ scripts..."
$orphanTools = @(
    'tools/apply-product-shelf-category-corrections.mjs',
    'tools/audit-homepage-images.mjs',
    'tools/backfill-inventory-rows.mjs',
    'tools/cleanup-product-enh-v1-orphans.mjs',
    'tools/cleanup-product-source-images.mjs',
    'tools/count-storefront-products.mjs',
    'tools/full-inventory-scan.mjs',
    'tools/generate-storage-audit-manifest.ps1',
    'tools/generate-wordmark-from-svg.mjs',
    'tools/patch-shelf-hero-cms.mjs',
    'tools/product-parity-report.mjs',
    'tools/reconcile-wix-catalog.ts',
    'tools/repair-product-image-quality.cjs',
    'tools/restore-from-backups.py',
    'tools/rewire-product-images-to-supabase.mjs',
    'tools/run-load-test.cmd',
    'tools/run-load-test.ps1',
    'tools/seed-live-access-users.mjs',
    'tools/standardize-catalog-product-images.cjs',
    'tools/sync-vercel-env-from-local.mjs',
    'tools/sync-vercel-env.mjs',
    'tools/test-pagination.mjs',
    'tools/upload-showcase-supabase.mjs',
    'tools/validate-inventory-integrity.mjs',
    'tools/verify-live-products.mjs',
    'tools/wix-vs-storefront-gap.mjs'
)
foreach ($f in $orphanTools) {
    git rm --quiet -- $f
}

# -----------------------------------------------------------------------------
# TIER 3 - Redundant root launcher scripts.
#   run-dev.cmd                      -> just wraps `npm run dev`
#   install-global-products-banner.cmd -> wraps existing tools/ scripts
#   prepare-agrone.cmd               -> duplicates `npm run assets:prepare-agrone`
# -----------------------------------------------------------------------------
Write-Host "Removing redundant root .cmd launchers..."
git rm --quiet -- 'run-dev.cmd'
git rm --quiet -- 'install-global-products-banner.cmd'
git rm --quiet -- 'prepare-agrone.cmd'

Write-Host "TIER 2/3 git cleanup staged." -ForegroundColor Green
Write-Host "Review with:  git status" -ForegroundColor Yellow
Write-Host "Then commit:  git commit -m 'chore: repo cleanup - remove screenshot dumps and orphaned scripts'" -ForegroundColor Yellow
