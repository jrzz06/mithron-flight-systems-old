# Redis co-location runbook — Vercel `iad1` ↔ Upstash `us-east-1`

**Goal:** Drop Redis RTT from hundreds–thousands of ms to tens of ms so `/api/health` stays healthy and cache GETs help TTFB instead of hurting it.

## Confirmed (2026-07-19)

| Item | Value |
|------|--------|
| Vercel project | `mithron-flight-systems` (`prj_VC9vQfZDnBlqbJcartmaXc3nYmeQ`) |
| Functions region | **`iad1`** (Washington, D.C. / US East) — pinned in `vercel.json` |
| Production URL | https://final-mithron-deploy.vercel.app |
| Active Upstash host | `integral-thrush-136422.upstash.io` (replaced `sacred-chimp-152211`) |
| Shallow `/api/health` (post-cutover) | **`200`** `status: ok`, `redis.ok: true`, `redis.configured: true` |
| Target Upstash region | **`us-east-1`** (N. Virginia / Washington D.C. — same metro as `iad1`) |

Cutover completed: new REST URL/token set on Production/Preview/Development, production redeployed, `final-mithron-deploy.vercel.app` aliased to the new deployment. Authenticated `redis.latencyMs` still needs a `HEALTH_CHECK_SECRET` bearer check for exact ms.

## You must do in Upstash Console (cannot be done from this repo)

1. Open [https://console.upstash.com](https://console.upstash.com) → **Redis** → **Create Database**.
2. Name: e.g. `mithron-iad1` (any name).
3. **Region: explicitly select `us-east-1` / Washington D.C. / N. Virginia** — do **not** pick Global, EU, or APAC.
4. Create → open the DB → **REST API** → copy:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
5. Paste both values back here (or into Vercel yourself). Keep the old DB until the new one is verified — do not delete yet.

### Region mapping cheat sheet

| Vercel Functions region | Upstash region to pick |
|-------------------------|-------------------------|
| `iad1` (this project) | **`us-east-1`** |
| `sfo1` | `us-west-1` |
| `cdg1` | `eu-west-1` |
| `hnd1` | `ap-northeast-1` |

## After you have the new credentials — Vercel env + redeploy

Set on **Production**, **Preview**, and **Development** (or at least Production + Preview):

```powershell
cd d:\mithuuu\mithuuu
npx vercel env rm UPSTASH_REDIS_REST_URL production --scope kbkbkh --yes
npx vercel env rm UPSTASH_REDIS_REST_TOKEN production --scope kbkbkh --yes
# Then add (CLI prompts for value; paste REST URL / token):
npx vercel env add UPSTASH_REDIS_REST_URL production --scope kbkbkh
npx vercel env add UPSTASH_REDIS_REST_TOKEN production --scope kbkbkh
# Repeat for preview (and development if used)
npx vercel --prod --scope kbkbkh
```

Or: Vercel Dashboard → Project → Settings → Environment Variables → edit both keys → Redeploy.

## Verify latency (must see tens of ms)

Unauthenticated shallow body does **not** include `latencyMs`. Use the health secret:

```powershell
# Replace SECRET with HEALTH_CHECK_SECRET from Vercel env
Invoke-RestMethod -Uri "https://final-mithron-deploy.vercel.app/api/health" `
  -Headers @{ Authorization = "Bearer SECRET" } | ConvertTo-Json -Depth 5
```

**Pass criteria**

- `status` = `ok`
- `redis.ok` = `true`
- `redis.detail` = `reachable`
- `redis.latencyMs` ideally **&lt; 100** (warm), often **20–60** when co-located

If `latencyMs` is still 500–1700, the new DB is not in `us-east-1` or env still points at the old host.

## Cache note

New empty Redis = cold cache (expected). Catalog/CMS fill on next traffic. Checkout locks / rate limits start fresh — no need to migrate keys.

## Rollback

1. Restore previous `UPSTASH_REDIS_REST_URL` / `TOKEN` in Vercel.
2. Redeploy (or promote prior deployment).
3. Optionally remove `regions` from `vercel.json` only if you intentionally change Functions region later.
