export type RetryOptions = {
  attempts?: number;
  delayMs?: number;
  signal?: AbortSignal;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number) => void;
};

function sleep(delayMs: number, signal?: AbortSignal) {
  if (delayMs <= 0) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const timeout = globalThis.setTimeout(resolve, delayMs);

    const abort = () => {
      globalThis.clearTimeout(timeout);
      reject(new DOMException("Retry operation aborted.", "AbortError"));
    };

    if (signal?.aborted) {
      abort();
      return;
    }

    signal?.addEventListener("abort", abort, { once: true });
  });
}

export async function retryAsync<T>(operation: () => Promise<T>, options: RetryOptions = {}) {
  const attempts = Math.max(1, Math.floor(options.attempts ?? 3));
  const delayMs = Math.max(0, Math.floor(options.delayMs ?? 150));
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (options.signal?.aborted) {
      throw new DOMException("Retry operation aborted.", "AbortError");
    }

    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const canRetry = attempt < attempts && (options.shouldRetry?.(error, attempt) ?? true);
      if (!canRetry) break;
      options.onRetry?.(error, attempt);
      await sleep(delayMs * attempt, options.signal);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? "Retry operation failed."));
}
