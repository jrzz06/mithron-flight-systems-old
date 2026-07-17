import { NextResponse } from "next/server";
import { acquireRedisLockStrictOwned, releaseRedisLockOwned } from "@/lib/cache-redis";

export async function withCronLock<T>(
  lockKey: string,
  ttlSeconds: number,
  handler: () => Promise<T>
): Promise<T | NextResponse> {
  const { outcome, token } = await acquireRedisLockStrictOwned(lockKey, ttlSeconds);

  if (outcome === "held") {
    return NextResponse.json({ ok: true, skipped: true, reason: "lock-held" });
  }

  // Fail closed when the lock backend is unavailable: a Redis outage must not
  // let a scheduled job double-run (duplicate archive/prune/expire passes).
  // Vercel cron retries the invocation, so returning 503 is safe.
  if (outcome === "unavailable") {
    return NextResponse.json(
      { ok: false, skipped: true, reason: "lock-backend-unavailable", retryable: true },
      { status: 503 }
    );
  }

  try {
    return await handler();
  } finally {
    if (token) {
      await releaseRedisLockOwned(lockKey, token);
    }
  }
}
