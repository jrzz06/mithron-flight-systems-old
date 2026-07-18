export type JobQueueProviderId = "vercel_cron" | "inngest" | "qstash";

export function getActiveJobQueueProvider(
  env: Record<string, string | undefined> = process.env
): JobQueueProviderId {
  const provider = env.MITHRON_JOB_QUEUE_PROVIDER?.trim().toLowerCase();
  if (provider === "inngest") return "inngest";
  if (provider === "qstash") return "qstash";
  return "vercel_cron";
}

export function isInngestEnabled(env: Record<string, string | undefined> = process.env) {
  return getActiveJobQueueProvider(env) === "inngest"
    && Boolean(env.INNGEST_EVENT_KEY?.trim() && env.INNGEST_SIGNING_KEY?.trim());
}

export function isQStashEnabled(env: Record<string, string | undefined> = process.env) {
  return getActiveJobQueueProvider(env) === "qstash"
    && Boolean(env.QSTASH_TOKEN?.trim());
}

/**
 * Fire-and-forget / deferred background work when QStash/Inngest are not provisioned.
 * Does NOT block the caller. Bounded by timeoutMs so runaway work cannot hold the isolate forever.
 *
 * Remaining infra: provision QStash or Inngest and route durable jobs through
 * `/api/jobs/qstash` or `/api/inngest` for at-least-once delivery (see docs/phase2-infra-recommendations).
 */
export function scheduleBackgroundWork(
  label: string,
  work: () => Promise<unknown>,
  timeoutMs = 15_000
): void {
  const run = async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        work(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
        })
      ]);
    } catch (error) {
      console.warn(`[mithron-jobs] Background work failed (${label}).`, error);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  // Prefer Next.js `after` when available so work can outlive the response.
  void import("next/server")
    .then((mod) => {
      const after = (mod as { after?: (fn: () => void | Promise<void>) => void }).after;
      if (typeof after === "function") {
        after(() => {
          void run();
        });
        return;
      }
      void run();
    })
    .catch(() => {
      void run();
    });
}
