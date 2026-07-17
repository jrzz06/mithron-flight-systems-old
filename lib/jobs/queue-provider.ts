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
