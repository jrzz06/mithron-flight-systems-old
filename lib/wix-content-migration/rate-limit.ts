export type RateLimitOptions = {
  minIntervalMs?: number;
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createRateLimiter(options: RateLimitOptions = {}) {
  const minIntervalMs = options.minIntervalMs ?? 200;
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 500;
  const maxDelayMs = options.maxDelayMs ?? 20_000;
  let lastAt = 0;

  async function waitTurn() {
    const now = Date.now();
    const wait = Math.max(0, lastAt + minIntervalMs - now);
    if (wait > 0) await sleep(wait);
    lastAt = Date.now();
  }

  async function withRetry<T>(fn: () => Promise<T>, label = "request"): Promise<T> {
    let attempt = 0;
    while (true) {
      await waitTurn();
      try {
        return await fn();
      } catch (error) {
        attempt += 1;
        const message = error instanceof Error ? error.message : String(error);
        const retryable = /429|5\d\d|ECONNRESET|ETIMEDOUT|network|fetch failed|AbortError/i.test(message);
        if (!retryable || attempt > maxRetries) {
          throw new Error(`${label} failed after ${attempt} attempt(s): ${message}`);
        }
        const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
        const jitter = Math.floor(Math.random() * 200);
        await sleep(delay + jitter);
      }
    }
  }

  return { waitTurn, withRetry };
}
