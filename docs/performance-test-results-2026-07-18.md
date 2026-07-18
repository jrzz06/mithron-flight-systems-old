# Measured test results — 2026-07-18

## Method

- Built optimized tree locally (`npm run build`) — **pass**
- Started `next start` on `127.0.0.1:3001` with required prod secrets overridden for local-only run
- Compared **GET** (full HTML) × 3 samples per route:
  - **LOCAL_OPT** = optimized code (this branch), localhost
  - **PROD_OLD** = current production (`final-mithron-deploy.vercel.app`) without these commits
- Vitest (catalog search, login hero, proxy fast-path, cms-resolver, nav mega-menu): **19/19 pass**

## Latency (GET avg ms) — biased by network

Local vs remote is **not** a clean A/B for the code change alone (localhost has ~0 WAN RTT; production includes edge + geo). Treat as directional only.

| Route | PROD_OLD avg | LOCAL_OPT avg | Notes |
| --- | ---: | ---: | --- |
| `/` | 2498 | 555 | Network-dominated |
| `/products` | 1940 | 671 | Network-dominated |
| `/category/agri-drones` | 1819 | 315 | Network-dominated |
| `/product/agrione-x1` | 1161 | 710 | Local cold first sample 1773ms then warm 127ms |
| `/login` | 417 | 214 | Network-dominated |

## HTML payload size — fairer signal (same content type)

| Route | PROD_OLD bytes | LOCAL_OPT bytes | Change |
| --- | ---: | ---: | ---: |
| `/` | 484,402 | 446,786 | **−7.8%** |
| `/products` | 576,344 | 509,494 | **−11.6%** |
| `/category/agri-drones` | 286,536 | 223,788 | **−21.9%** |
| `/product/agrione-x1` | 143,758 | 83,169 | **−42.1%** |
| `/login` | 36,567 | 36,243 | **−0.9%** |

Payload shrink is consistent with Stage 2 slim selects / shell CMS / search index work.

## What this does **not** prove

- Score jumps (+28 perf etc.) — **not measured**
- Production is already faster — **not deployed yet**
- Stability (cart hang / pricing pending) — needs browser throttle tests on Preview, not GET timing
- DB migration gains — migrations not applied (`db:push` still needed)

## Next fair test

Deploy this branch to a **Vercel Preview** in the same region as production, then re-run the same GET table Preview vs production.
