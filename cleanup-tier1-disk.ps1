# =============================================================================
# cleanup-tier1-disk.ps1
# -----------------------------------------------------------------------------
# TIER 1 - Local disk cache / build artifacts (git-ignored).
# Removing these does NOT change git history or tracked repo size - it only
# frees local disk (~1.11 GB). Everything here regenerates automatically.
#
# REVIEW BEFORE RUNNING. This script is NOT executed automatically.
# Run from the project root:  d:\mithuuu\mithuuu
#   powershell -ExecutionPolicy Bypass -File .\cleanup-tier1-disk.ps1
# =============================================================================

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

Write-Host "TIER 1 disk cleanup starting..." -ForegroundColor Cyan

# node_modules/  -> restore with:  npm install
if (Test-Path 'node_modules') {
    Write-Host "Removing node_modules\ (restore: npm install)"
    Remove-Item -Path 'node_modules' -Recurse -Force
}

# .next/  -> restore with:  npm run dev  /  npm run build
if (Test-Path '.next') {
    Write-Host "Removing .next\ (restore: npm run dev / npm run build)"
    Remove-Item -Path '.next' -Recurse -Force
}

# tsconfig.tsbuildinfo  -> regenerates on next tsc / build
if (Test-Path 'tsconfig.tsbuildinfo') {
    Write-Host "Removing tsconfig.tsbuildinfo (regenerates on build)"
    Remove-Item -Path 'tsconfig.tsbuildinfo' -Force
}

# test-results/.last-run.json  -> regenerates when Playwright runs
if (Test-Path 'test-results\.last-run.json') {
    Write-Host "Removing test-results\.last-run.json (regenerates on next e2e run)"
    Remove-Item -Path 'test-results\.last-run.json' -Force
}

# reports/*.json  -> stale generated outputs (gitignored); regenerate via npm audit scripts
Get-ChildItem -Path 'reports' -Filter '*.json' -File -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "Removing reports\$($_.Name) (regenerates on demand)"
    Remove-Item -Path $_.FullName -Force
}

Write-Host "TIER 1 disk cleanup complete." -ForegroundColor Green
