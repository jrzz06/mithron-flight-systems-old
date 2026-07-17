import { timingSafeEqual } from "node:crypto";

export function safeBearerEquals(request: Request, envSecret: string | undefined): boolean {
  const secret = envSecret?.trim() ?? "";
  if (!secret) return false;

  const authorization = request.headers.get("authorization") ?? "";
  const candidate = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
  return safeSecretEquals(candidate, secret);
}

export function safeSecretEquals(candidate: string | null | undefined, envSecret: string | undefined): boolean {
  const secret = envSecret?.trim() ?? "";
  const normalizedCandidate = candidate?.trim() ?? "";
  if (!secret || !normalizedCandidate) return false;

  const secretBuffer = Buffer.from(secret);
  const candidateBuffer = Buffer.from(normalizedCandidate);
  if (secretBuffer.length !== candidateBuffer.length) return false;
  return timingSafeEqual(secretBuffer, candidateBuffer);
}
