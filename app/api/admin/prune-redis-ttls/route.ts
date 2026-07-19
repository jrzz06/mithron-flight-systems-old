import { NextResponse } from "next/server";
import { withCronLock } from "@/lib/cron-lock";
import { authorizeBearerSecret } from "@/lib/api/bearer-auth";
import { getRedisClient, withRedisTimeout } from "@/lib/redis-client";

/**
 * Expires immortal `ratelimit:*` keys (TTL=-1) left by older writers.
 * Safe: only sets EXPIRE on keys that currently have no TTL; never DELs.
 */
const MAX_KEYS = 400;
const DEFAULT_EXPIRE_SECONDS = 86_400;

function bearerAuthResponse(auth: Awaited<ReturnType<typeof authorizeBearerSecret>>) {
  if (auth === "rate_limited") {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  if (auth === "misconfigured") {
    return NextResponse.json({ error: "Cron secret is not configured." }, { status: 503 });
  }
  if (auth === "unauthorized") {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  return null;
}

async function runPrune(request: Request) {
  const auth = await authorizeBearerSecret(request, process.env.CRON_SECRET);
  const denied = bearerAuthResponse(auth);
  if (denied) return denied;

  const redis = getRedisClient();
  if (!redis) {
    return NextResponse.json({ ok: false, error: "Redis not configured." }, { status: 503 });
  }

  const url = new URL(request.url);
  const expireSeconds = Math.min(
    7 * 86_400,
    Math.max(3_600, Number(url.searchParams.get("expire_seconds") ?? DEFAULT_EXPIRE_SECONDS) || DEFAULT_EXPIRE_SECONDS)
  );

  let cursor = "0";
  let scanned = 0;
  let expired = 0;
  const samples: string[] = [];

  for (let i = 0; i < 40 && scanned < MAX_KEYS; i += 1) {
    const page = (await withRedisTimeout(
      `SCAN ratelimit:* (prune ${i + 1})`,
      () => redis.scan(cursor, { match: "ratelimit:*", count: 100 })
    )) as [string, string[]];
    cursor = String(page[0]);
    const keys = Array.isArray(page[1]) ? page[1] : [];

    for (const key of keys) {
      if (scanned >= MAX_KEYS) break;
      scanned += 1;
      const ttl = await withRedisTimeout(`TTL ${key}`, () => redis.ttl(key));
      if (ttl !== -1) continue;
      await withRedisTimeout(`EXPIRE ${key}`, () => redis.expire(key, expireSeconds));
      expired += 1;
      if (samples.length < 8) samples.push(key);
    }

    if (cursor === "0") break;
  }

  return NextResponse.json({
    ok: true,
    scanned,
    expired,
    expireSeconds,
    samples,
    complete: cursor === "0"
  });
}

export async function GET(request: Request) {
  const locked = await withCronLock("lock:archive-job:prune-redis-ttls", 120, () => runPrune(request));
  return locked instanceof NextResponse ? locked : NextResponse.json(locked);
}

export async function POST(request: Request) {
  const locked = await withCronLock("lock:archive-job:prune-redis-ttls", 120, () => runPrune(request));
  return locked instanceof NextResponse ? locked : NextResponse.json(locked);
}
