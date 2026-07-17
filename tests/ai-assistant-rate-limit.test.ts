import { describe, expect, it, vi, beforeEach } from "vitest";
import { checkAssistantRateLimits } from "@/lib/assistant/rate-limit";

vi.mock("@/lib/rate-limit-redis", () => ({
  checkDistributedRateLimit: vi.fn()
}));

import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";

describe("assistant rate limits", () => {
  beforeEach(() => {
    vi.mocked(checkDistributedRateLimit).mockReset();
  });

  it("blocks when abuse limit is exceeded", async () => {
    vi.mocked(checkDistributedRateLimit).mockResolvedValueOnce({ allowed: false, remaining: 0 });
    const result = await checkAssistantRateLimits({ ip: "1.2.3.4", sessionId: "sid-1" });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("abuse");
    }
  });

  it("allows when all layers pass", async () => {
    vi.mocked(checkDistributedRateLimit).mockResolvedValue({ allowed: true, remaining: 5 });
    const result = await checkAssistantRateLimits({ ip: "1.2.3.4", sessionId: "sid-1" });
    expect(result.allowed).toBe(true);
    expect(checkDistributedRateLimit).toHaveBeenCalledTimes(5);
  });
});
