import {
  peekDistributedRateLimit,
  checkDistributedRateLimit,
  deleteDistributedRateLimitKey,
  peekDistributedRateLimits,
  checkDistributedRateLimits,
  type RateLimitResult
} from "@/lib/rate-limit-redis";

const FAILURE_LIMIT = 5;
const FAILURE_WINDOW_MS = 15 * 60_000;

function normalizeIdentifier(value: string) {
  return value.trim().toLowerCase();
}

function failureKey(identifier: string) {
  return `auth-failures:${normalizeIdentifier(identifier)}`;
}

/** Deduped normalized identifiers (same keys/thresholds as before). */
function uniqueIdentifiers(identifiers: string[]) {
  return [...new Set(identifiers.map(normalizeIdentifier).filter(Boolean))];
}

function lockoutEntries(identifiers: string[]) {
  return uniqueIdentifiers(identifiers).map((key) => ({
    key: failureKey(key),
    maxRequests: FAILURE_LIMIT,
    windowMs: FAILURE_WINDOW_MS
  }));
}

export async function assertLoginNotLocked(identifier: string) {
  const normalized = normalizeIdentifier(identifier);
  if (!normalized) return;

  const state = await peekDistributedRateLimit(failureKey(normalized), FAILURE_LIMIT, FAILURE_WINDOW_MS);
  if (!state.allowed) {
    throw new LoginLockedOutError();
  }
}

/**
 * Pre-auth lockout gate: batched peeks only (no bump).
 * Same keys and FAILURE_LIMIT / FAILURE_WINDOW_MS as single-identifier helpers.
 */
export async function assertLoginNotLockedForIdentifiers(identifiers: string[]) {
  const entries = lockoutEntries(identifiers);
  if (!entries.length) return;

  const states = await peekDistributedRateLimits(entries);
  if (states.some((state) => !state.allowed)) {
    throw new LoginLockedOutError();
  }
}

export async function recordLoginFailure(identifier: string): Promise<RateLimitResult | undefined> {
  const normalized = normalizeIdentifier(identifier);
  if (!normalized) return undefined;

  // Bump only — callers must not peek again on the failure path.
  return checkDistributedRateLimit(failureKey(normalized), FAILURE_LIMIT, FAILURE_WINDOW_MS);
}

/**
 * Post-auth-failure bump only (no peek). Returns bump results so the login
 * route can soft-deny when the increment crosses the ceiling without a
 * second round-trip.
 */
export async function recordLoginFailures(identifiers: string[]): Promise<RateLimitResult[]> {
  const entries = lockoutEntries(identifiers);
  if (!entries.length) return [];

  return checkDistributedRateLimits(entries);
}

export async function clearLoginFailures(identifier: string) {
  const normalized = normalizeIdentifier(identifier);
  if (!normalized) return;
  await deleteDistributedRateLimitKey(failureKey(normalized));
}

export async function clearLoginFailuresForIdentifiers(identifiers: string[]) {
  const keys = uniqueIdentifiers(identifiers);
  if (!keys.length) return;
  await Promise.all(keys.map((identifier) => clearLoginFailures(identifier)));
}

export class LoginLockedOutError extends Error {
  constructor() {
    super("Too many failed sign-in attempts.");
    this.name = "LoginLockedOutError";
  }
}
