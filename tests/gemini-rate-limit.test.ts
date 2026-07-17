import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveGeminiConservativeLimits,
  resolveGeminiModelProfile
} from "@/lib/gemini-model-policy";

vi.mock("@/lib/redis-client", () => ({
  getRedisClient: () => null,
  withRedisTimeout: async <T>(_label: string, promise: Promise<T>) => promise
}));

vi.mock("@/lib/rate-limit-redis", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>("@/lib/rate-limit");
  return {
    checkDistributedRateLimit: async (key: string, maxRequests: number, windowMs: number) =>
      actual.checkRateLimit(key, maxRequests, windowMs)
  };
});

describe("gemini model policy", () => {
  it("applies conservative margins to google quotas", () => {
    const limits = resolveGeminiConservativeLimits("gemini-3.1-flash-lite", {
      GEMINI_RATE_LIMIT_MARGIN: "0.8"
    });
    expect(limits.rpm).toBe(12);
    expect(limits.rpd).toBe(400);
    expect(limits.tpm).toBe(200_000);
  });

  it("prefers gemma 26b profile for higher daily quota", () => {
    const profile = resolveGeminiModelProfile("gemma-4-26b-a4b-it");
    expect(profile.googleRpd).toBe(1500);
    expect(profile.googleTpm).toBeNull();
  });
});

describe("gemini rate limit", () => {
  beforeEach(async () => {
    vi.resetModules();
    const { resetGeminiRateLimitStateForTests } = await import("@/lib/gemini-rate-limit");
    resetGeminiRateLimitStateForTests();
  });

  it("enforces rpm ceiling", async () => {
    const { acquireGeminiTextSlot } = await import("@/lib/gemini-rate-limit");
    const env = {
      GEMINI_RATE_LIMIT_MARGIN: "0.2",
      GEMINI_MIN_REQUEST_INTERVAL_MS: "0",
      GEMINI_TEXT_MODEL: "gemini-3.1-flash-lite"
    };

    for (let index = 0; index < 3; index += 1) {
      await acquireGeminiTextSlot({
        model: "gemini-3.1-flash-lite",
        prompt: "hello",
        estimatedTokens: 10,
        env
      });
    }

    await expect(
      acquireGeminiTextSlot({
        model: "gemini-3.1-flash-lite",
        prompt: "blocked",
        estimatedTokens: 10,
        maxWaitMs: 50,
        env
      })
    ).rejects.toThrow(/Timed out waiting for Gemini rate limit slot/i);
  });
});
