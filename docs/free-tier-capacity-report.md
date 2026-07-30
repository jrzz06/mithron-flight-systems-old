# Free-tier capacity estimate — 30 Jul 2026

Target: `https://www.rtacademia.com` (Vercel Hobby + Supabase Free + Upstash Free).  
CDN/R2 work deferred. This is a **smoke + quota math** estimate, not a 500–1000 VU stress run.

## Health baseline

| Check | Result |
|-------|--------|
| `GET /api/health` | **200** `{"status":"ok","supabase":{"ok":true},"redis":{"ok":true}}` |
| Latency (single) | ~420 ms |

Stack was healthy before load.

## Load smoke results

### Pass A — `LOAD_TEST_SMOKE=1` (safe, ~10 concurrent split across 7 routes, 5s)

All routes **0% errors**, HTTP 200 (except checkout dry-check which expects 400).

| Route | Requests | Avg latency | p99 |
|-------|----------|-------------|-----|
| Homepage `/` | 28 | **174 ms** | 357 ms |
| `/products` | 28 | 175 ms | 624 ms |
| `/category/agri-drones` | 31 | 161 ms | 613 ms |
| Hot PDP | 7 | **711 ms** | 826 ms |
| `/api/health` | 15 | 315 ms | 477 ms |
| `POST /api/cart/pricing` | 14 | 363 ms | 522 ms |

Homepage payload ≈ **500 KB HTML** (from throughput ÷ requests).

### Pass B — 30 concurrent × 30s homepage (stopped by platform)

| Metric | Result |
|--------|--------|
| Concurrent | 30 |
| Success (200) | 33 early requests |
| Then | **70× 403** + **470 timeouts** |
| Cause | **Vercel Security Checkpoint / Attack Challenge** (bot protection) |

Same IP later got 403 even for single `curl` to `www.rtacademia.com` and the `*.vercel.app` alias until challenge cools down.

**Conclusion from smoke:** App handles light concurrent browse fine; **automated load >~20–30 from one IP hits Vercel bot protection**, so free-tier “max concurrent” for bots ≠ real browsers.

---

## Free-tier ceilings (order of magnitude)

| Service | Typical Hobby/Free cap | Role for this site |
|---------|------------------------|--------------------|
| **Vercel Hobby** | ~**100 GB** bandwidth / mo; serverless exec limits; Attack Challenge on spikes | HTML, `/cdn-media`, edge |
| **Supabase Free** | ~**500 MB** DB, ~**1 GB** storage, ~**5 GB** egress / mo; pooler connection limits | API + Storage images if uncached |
| **Upstash Free** | ~**10k commands / day** (plan-dependent) | Catalog/CMS/product cache |

App rate limits (not the first monthly bottleneck): catalog search **120/min/IP**, cart pricing **60/min**.

---

## Concurrent users (estimate)

| Scenario | Estimate | Notes |
|----------|----------|-------|
| **Comfortable concurrent browsers** | **15–40** | ISR + Redis warm; HTML mostly edge-served |
| **Proven clean smoke** | **~10** simultaneous route hits, 0% errors, p99 &lt; 1s on HTML |
| **Automated load from 1 IP** | **Fails ~20–30** | Vercel Attack Challenge (403), not app crash |
| **Peak short burst (real users, multi-IP)** | **50–100** | Possible if cache warm; risk Redis stampede + Supabase pooler if cold |

Real shoppers open pages slowly and share CDN/ISR cache. Treat **~25 concurrent active shoppers** as a practical free-tier target.

---

## Monthly users / visits (estimate)

Assumptions for one “visit” (browse home + 1–2 PDP + images):

| Transfer model | Bytes / visit | Driver |
|----------------|---------------|--------|
| Light (warm CDN, few images) | ~2–3 MB | Mostly Vercel |
| Typical catalog browse | ~4–6 MB | HTML + product images |
| Heavy (many full-size images, cold cache) | ~8–12 MB | Supabase Storage egress |

### Caps by service

**Vercel 100 GB / month**

| Visit size | Max visits / month |
|------------|--------------------|
| 3 MB | ~**33,000** |
| 5 MB | ~**20,000** |
| 8 MB | ~**12,500** |

**Supabase ~5 GB egress / month** (if many images miss CDN and hit Storage)

| Image egress / visit | Max visits / month |
|----------------------|--------------------|
| 1 MB | ~**5,000** |
| 2 MB | ~**2,500** |
| 4 MB | ~**1,250** |

**Upstash ~10k cmds / day** (~300k / month)

| Redis ops / page (avg) | Page views / day |
|------------------------|------------------|
| 5 (high hit ratio) | ~**2,000** → ~60k PV / mo |
| 15 (more misses) | ~**650** → ~20k PV / mo |

### Binding ceiling (free tier)

Take the **lowest** realistic cap:

| If media stays on Supabase with weak CDN | **~2,000–5,000 visits / month** (Supabase egress) |
| If `/cdn-media` / future Cloudflare caches images well | **~15,000–25,000 visits / month** (Vercel bandwidth) |
| Concurrent-safe daily | **~500–800 visits / day** ≈ **15k–25k / month** without stressing Redis |

**Headline free-tier range:** about **5,000–20,000 monthly visits**, or roughly **2,000–8,000 monthly unique users** (assuming 2–3 visits each).  
**Safest planning number on current stack:** **~10,000 visits / month** and **~25 concurrent shoppers**.

---

## What breaks first on free tier

1. **Supabase Storage egress** — product/hero images (unless Cloudflare CDN later)  
2. **Vercel bandwidth** — large HTML (~500 KB home) + `/cdn-media`  
3. **Upstash command quota** — under cache stampede / short TTLs  
4. **Vercel Attack Challenge** — blocks aggressive single-IP load tests (and scrapers)  
5. **Not first:** CPU of the Next app under warm ISR

---

## Is Hobby enough?

| Traffic | Verdict |
|---------|---------|
| Soft launch / demo / &lt;5k visits/mo | **Yes** |
| Steady ~10k visits/mo, light catalog use | **Borderline** — watch Supabase egress |
| Marketing spike / 50k+ visits/mo | **No** — need Pro + paid Supabase and/or R2+Cloudflare CDN |

---

## Artifacts

- Smoke JSON: `mithuuu/tools/load-test-results.json`
- Mid load (mostly 403 after challenge): `mithuuu/tools/load-smoke-*.json`

## Note

After the 30-VU pass, this runner’s IP may keep seeing **Vercel Security Checkpoint** for a while. Real users in browsers are usually unaffected; wait or open the site in a normal browser to confirm.
