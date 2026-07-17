import { safeBearerEquals } from "@/lib/auth/timing-safe-bearer";
import { checkDistributedRateLimit } from "@/lib/rate-limit-redis";

export type BearerAuthResult = "ok" | "unauthorized" | "rate_limited" | "misconfigured";

type AuthorizeBearerSecretOptions = {
  rateKey?: string;
  maxAttempts?: number;
  windowMs?: number;
};

function resolveRateKey(request: Request, rateKey?: string) {
  return rateKey ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
}

export async function authorizeBearerSecret(
  request: Request,
  secret: string | undefined,
  options: AuthorizeBearerSecretOptions = {}
): Promise<BearerAuthResult> {
  const trimmedSecret = secret?.trim() ?? "";
  if (!trimmedSecret) return "misconfigured";

  const maxAttempts = options.maxAttempts ?? 30;
  const windowMs = options.windowMs ?? 60_000;
  const limit = await checkDistributedRateLimit(
    `bearer-auth:${resolveRateKey(request, options.rateKey)}`,
    maxAttempts,
    windowMs
  );
  if (!limit.allowed) return "rate_limited";
  if (!safeBearerEquals(request, trimmedSecret)) return "unauthorized";
  return "ok";
}
