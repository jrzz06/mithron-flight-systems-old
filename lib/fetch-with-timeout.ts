export const DEFAULT_FETCH_TIMEOUT_MS = 15_000;

/** Bound every Supabase Auth / PostgREST / Storage call so a stalled network hop cannot leave save buttons pending forever. */
export const SUPABASE_FETCH_TIMEOUT_MS = 20_000;

/** Default ceiling for client-side Server Action / mutation wrappers. */
export const DEFAULT_ACTION_TIMEOUT_MS = 20_000;

export class FetchTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number, url?: string) {
    super(url ? `Request timed out after ${timeoutMs}ms: ${url}` : `Request timed out after ${timeoutMs}ms`);
    this.name = "FetchTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export class ActionTimeoutError extends Error {
  readonly timeoutMs: number;
  readonly label: string;

  constructor(timeoutMs: number, label = "Action") {
    const seconds = Math.round(timeoutMs / 1000);
    super(`${label} timed out after ${seconds}s. Please retry.`);
    this.name = "ActionTimeoutError";
    this.timeoutMs = timeoutMs;
    this.label = label;
  }
}

/**
 * Race any promise against a wall-clock timeout so hung network / serverless
 * cold starts cannot leave UI pending forever. Clears the timer when either side settles.
 */
export async function raceWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = DEFAULT_ACTION_TIMEOUT_MS,
  label = "Action"
): Promise<T> {
  const ms = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_ACTION_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new ActionTimeoutError(ms, label));
        }, ms);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Fetch adapter for `@supabase/supabase-js` / `@supabase/ssr` `global.fetch`.
 * Keeps every outbound Supabase request bounded without patching individual call sites.
 */
export function supabaseFetch(timeoutMs: number = SUPABASE_FETCH_TIMEOUT_MS) {
  const ms = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : SUPABASE_FETCH_TIMEOUT_MS;
  return (input: RequestInfo | URL, init?: RequestInit) => fetchWithTimeout(input, init, ms);
}

/**
 * Thin fetch wrapper that aborts after `timeoutMs` to keep outbound I/O bounded.
 * Pass an existing `signal` to compose with caller cancellation (either abort wins).
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS
): Promise<Response> {
  const ms = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_FETCH_TIMEOUT_MS;
  const controller = new AbortController();
  const upstream = init?.signal;
  const onUpstreamAbort = () => controller.abort(upstream?.reason);
  if (upstream) {
    if (upstream.aborted) {
      controller.abort(upstream.reason);
    } else {
      upstream.addEventListener("abort", onUpstreamAbort, { once: true });
    }
  }

  const timer = setTimeout(() => {
    controller.abort(new FetchTimeoutError(ms, typeof input === "string" ? input : undefined));
  }, ms);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    });
  } catch (error) {
    if (controller.signal.aborted) {
      const reason = controller.signal.reason;
      if (reason instanceof FetchTimeoutError) throw reason;
      if (error instanceof Error && error.name === "AbortError") {
        throw reason instanceof Error ? reason : new FetchTimeoutError(ms);
      }
    }
    throw error;
  } finally {
    clearTimeout(timer);
    if (upstream) {
      upstream.removeEventListener("abort", onUpstreamAbort);
    }
  }
}

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const limit = Math.max(1, Math.floor(concurrency));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
