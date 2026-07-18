# Redis production audit (read-only) — 2026-07-18

Instance: credentials from `.env.local` (`UPSTASH_REDIS_REST_URL`) — **confirmed production**.
Method: `DBSIZE`, `SCAN`, `TTL` only. **No SET/DEL/FLUSH.**

## Snapshot

| Metric | Value |
| --- | --- |
| DBSIZE | 359 |
| Sampled | 358 |
| `catalog:*` | 4 |
| `cms:*` | 2 |
| `ratelimit:*` | 352 |

## TTL posture

| Namespace | Observed TTL | Verdict |
| --- | --- | --- |
| `catalog:*` | 8–17s | Correct short TTL for catalog hot reads |
| `cms:*` (`homepage`, `shell`) | 10–13s | Correct short TTL |
| `ratelimit:*` | **-1 (no expiry)** for many keys | Memory leak risk under long-lived traffic |

### Ratelimit TTL=-1 finding

Many keys like `ratelimit:account-addresses:<uuid>` and `ratelimit:account-cart-write:<uuid>` have `TTL = -1`.

Likely causes:
1. `@upstash/ratelimit` analytics / identifier keys left without EXPIRE on some code paths
2. Historical keys from older rate-limit implementations

**Do not flush production Redis in this pass.** Ops follow-up:

```powershell
# Read-only inventory of immortal rate-limit keys (run yourself when ready)
# In Upstash console → CLI, or a one-off script with SCAN + TTL filter for ttl==-1
# Then decide: expire orphaned keys with a short EXPIRE, or fix writer to always set TTL.
```

Hit-ratio / memory charts require the Upstash dashboard (not available via REST alone).

## Cross-instance safety (code posture after this rollout)

| Concern | Status |
| --- | --- |
| Checkout idempotency lock | Fail-closed (`acquireRedisLockStrict` → 503) |
| Distributed rate limits | Fail-closed in production |
| Gemini TPM | Atomic + production deny on backend throw |
| App-data catalog/CMS cache | Read-through with short TTL (helping) |
| In-memory fallback for security-critical paths | Removed / alarmed |

## Recommendation

1. Keep Redis required in production (health probe now includes Redis PING).
2. Schedule a maintenance window to expire or delete `ratelimit:*` keys with `TTL=-1` after confirming none are intentional permanent sets.
3. Confirm Upstash plan memory headroom before flash-sale traffic.
