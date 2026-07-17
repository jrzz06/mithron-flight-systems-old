import {
  peekDistributedRateLimit,
  checkDistributedRateLimit,
  deleteDistributedRateLimitKey,
  peekDistributedRateLimits,
  checkDistributedRateLimits
} from "@/lib/rate-limit-redis";

const FAILURE_LIMIT = 5;
const FAILURE_WINDOW_MS = 15 * 60_000;

function normalizeIdentifier(value: string) {
  return value.trim().toLowerCase();
}

function failureKey(identifier: string) {
  return `auth-failures:${normalizeIdentifier(identifier)}`;
}

export async function assertLoginNotLocked(identifier: string) {
  const normalized = normalizeIdentifier(identifier);
  if (!normalized) return;

  const state = await peekDistributedRateLimit(failureKey(normalized), FAILURE_LIMIT, FAILURE_WINDOW_MS);
  if (!state.allowed) {
    throw new LoginLockedOutError();
  }
}

export async function assertLoginNotLockedForIdentifiers(identifiers: string[]) {
  const keys = identifiers.map(normalizeIdentifier).filter(Boolean);
  if (!keys.length) return;

  const states = await peekDistributedRateLimits(
    keys.map((key) => ({ key: failureKey(key), maxRequests: FAILURE_LIMIT, windowMs: FAILURE_WINDOW_MS }))
  );
  if (states.some((state) => !state.allowed)) {
    throw new LoginLockedOutError();
  }
}

export async function recordLoginFailure(identifier: string) {
  const normalized = normalizeIdentifier(identifier);
  if (!normalized) return;

  await checkDistributedRateLimit(failureKey(normalized), FAILURE_LIMIT, FAILURE_WINDOW_MS);
}

export async function recordLoginFailures(identifiers: string[]) {
  const keys = identifiers.map(normalizeIdentifier).filter(Boolean);
  if (!keys.length) return;

  await checkDistributedRateLimits(
    keys.map((key) => ({ key: failureKey(key), maxRequests: FAILURE_LIMIT, windowMs: FAILURE_WINDOW_MS }))
  );
}

export async function clearLoginFailures(identifier: string) {
  const normalized = normalizeIdentifier(identifier);
  if (!normalized) return;
  await deleteDistributedRateLimitKey(failureKey(normalized));
}

export async function clearLoginFailuresForIdentifiers(identifiers: string[]) {
  await Promise.all(identifiers.map((identifier) => clearLoginFailures(identifier)));
}

export class LoginLockedOutError extends Error {
  constructor() {
    super("Too many failed sign-in attempts.");
    this.name = "LoginLockedOutError";
  }
}
