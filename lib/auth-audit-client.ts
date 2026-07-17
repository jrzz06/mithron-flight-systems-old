import { createHash, timingSafeEqual } from "node:crypto";

type EnvSource = Record<string, string | undefined>;

const AUTH_AUDIT_WINDOW_MS = 60_000;

export function authAuditTimeWindow(nowMs = Date.now()) {
  return Math.floor(nowMs / AUTH_AUDIT_WINDOW_MS);
}

function buildAuthAuditTokenForWindow(secret: string, window: number) {
  return createHash("sha256").update(`${secret}:auth-audit:${window}`).digest("hex");
}

function tokensMatch(candidate: string, expected: string) {
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);
  if (candidateBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(candidateBuffer, expectedBuffer);
}

export function buildAuthAuditClientToken(env: EnvSource = process.env) {
  const secret = env.AUTH_AUDIT_CLIENT_SECRET?.trim();
  if (!secret) return null;
  return buildAuthAuditTokenForWindow(secret, authAuditTimeWindow());
}

export function verifyAuthAuditClientToken(token: string | null | undefined, env: EnvSource = process.env) {
  const secret = env.AUTH_AUDIT_CLIENT_SECRET?.trim();
  if (!secret || !token?.trim()) return false;

  const normalized = token.trim();
  const currentWindow = authAuditTimeWindow();
  return [currentWindow, currentWindow - 1].some((window) => tokensMatch(normalized, buildAuthAuditTokenForWindow(secret, window)));
}

export function capAuthAuditMetadata(metadata: Record<string, unknown>) {
  const serialized = JSON.stringify(metadata);
  if (serialized.length <= 4096) return metadata;
  return {
    truncated: true,
    preview: serialized.slice(0, 4000)
  };
}
