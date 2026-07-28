type RateLimitEntry = { count: number; resetAt: number };

const buckets = new Map<string, RateLimitEntry>();
const BUCKET_SWEEP_THRESHOLD = 1000;

function sweepExpiredBuckets(now: number) {
  if (buckets.size <= BUCKET_SWEEP_THRESHOLD) return;
  for (const [key, entry] of buckets) {
    if (now >= entry.resetAt) buckets.delete(key);
  }
}

export function checkRateLimit(key: string, maxRequests: number, windowMs: number) {
  const now = Date.now();
  const entry = buckets.get(key);

  if (entry && now >= entry.resetAt) {
    buckets.delete(key);
  }

  if (!buckets.has(key)) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    sweepExpiredBuckets(now);
    return { allowed: true, remaining: maxRequests - 1 };
  }

  const current = buckets.get(key)!;
  if (current.count >= maxRequests) {
    return { allowed: false, remaining: 0, retryAfterMs: current.resetAt - now };
  }

  current.count += 1;
  return { allowed: true, remaining: maxRequests - current.count };
}
