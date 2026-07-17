import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";

export type AssistantRateLimitResult =
  | { allowed: true }
  | { allowed: false; status: 429; message: string; reason: "minute" | "hour" | "day" | "abuse" | "burst" };

const MINUTE_LIMIT = 10;
const BURST_IP_LIMIT = 20;
const HOUR_IP_LIMIT = 60;
const DAY_SESSION_LIMIT = 100;
const ABUSE_LIMIT = 15;
const ABUSE_WINDOW_MS = 10 * 60_000;

export async function checkAssistantRateLimits(input: { ip: string; sessionId: string }) {
  const abuseLimit = await checkDistributedRateLimit(
    `ai-assistant-abuse:${input.ip}`,
    ABUSE_LIMIT,
    ABUSE_WINDOW_MS
  );
  if (!abuseLimit.allowed) {
    return {
      allowed: false as const,
      status: 429 as const,
      message: "Too many blocked requests. Please try again later.",
      reason: "abuse" as const
    };
  }

  const burstLimit = await checkDistributedRateLimit(`ai-assistant-burst:${input.ip}`, BURST_IP_LIMIT, 60_000);
  if (!burstLimit.allowed) {
    return {
      allowed: false as const,
      status: 429 as const,
      message: "Too many requests from your network. Please wait a minute and try again.",
      reason: "burst" as const
    };
  }

  const minuteLimit = await checkDistributedRateLimit(
    `ai-assistant:${input.ip}:${input.sessionId}`,
    MINUTE_LIMIT,
    60_000
  );
  if (!minuteLimit.allowed) {
    return {
      allowed: false as const,
      status: 429 as const,
      message: "Too many requests. Please wait a minute and try again.",
      reason: "minute" as const
    };
  }

  const hourLimit = await checkDistributedRateLimit(`ai-assistant-hour:${input.ip}`, HOUR_IP_LIMIT, 3_600_000);
  if (!hourLimit.allowed) {
    return {
      allowed: false as const,
      status: 429 as const,
      message: "Hourly limit reached. Please try again later.",
      reason: "hour" as const
    };
  }

  const dayLimit = await checkDistributedRateLimit(`ai-assistant-day:${input.sessionId}`, DAY_SESSION_LIMIT, 86_400_000);
  if (!dayLimit.allowed) {
    return {
      allowed: false as const,
      status: 429 as const,
      message: "Daily limit reached. Please try again tomorrow.",
      reason: "day" as const
    };
  }

  return { allowed: true as const };
}

export async function recordAssistantPolicyViolation(ip: string) {
  await checkDistributedRateLimit(`ai-assistant-abuse:${ip}`, ABUSE_LIMIT, ABUSE_WINDOW_MS);
}
