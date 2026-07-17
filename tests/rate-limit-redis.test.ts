import { describe, expect, it } from "vitest";
import { checkDistributedRateLimit, degradedRateLimitResult } from "@/lib/rate-limit-redis";
import { checkRateLimit } from "@/lib/rate-limit";

describe("distributed rate limiting", () => {
  it("falls back to in-memory limiter when Upstash is not configured in non-production", async () => {
    const key = `test-${Date.now()}`;
    const first = await checkDistributedRateLimit(key, 2, 60_000);
    const second = await checkDistributedRateLimit(key, 2, 60_000);
    const third = await checkDistributedRateLimit(key, 2, 60_000);
    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
  });

  it("denies by default (fail-closed) when the limiter backend is unavailable in production", () => {
    // Abuse-sensitive routes must deny rather than allow unbounded traffic when
    // both Redis and the Postgres fallback are unavailable.
    const result = degradedRateLimitResult("fail_closed", 10, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.degraded).toBe(true);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("allows only when the caller explicitly opts into fail-open", () => {
    const result = degradedRateLimitResult("fail_open", 10, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.degraded).toBe(true);
  });

  it("keeps the in-memory limiter available for dev", () => {
    const key = `memory-${Date.now()}`;
    expect(checkRateLimit(key, 1, 60_000).allowed).toBe(true);
    expect(checkRateLimit(key, 1, 60_000).allowed).toBe(false);
  });
});
