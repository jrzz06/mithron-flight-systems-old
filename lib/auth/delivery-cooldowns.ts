import { hasCooldownKey, setCachedJson } from "@/lib/cache-redis";

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export async function isOtpCooldownActive(email: string) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return hasCooldownKey(`otp:cooldown:${normalized}`);
}

export async function isEmailBurstActive(ip: string) {
  const normalized = ip.trim() || "anonymous";
  return hasCooldownKey(`email:burst:${normalized}`);
}

export async function markOtpCooldown(email: string, ttlSeconds = 60) {
  const normalized = normalizeEmail(email);
  if (!normalized) return;
  await setCachedJson(`otp:cooldown:${normalized}`, "1", ttlSeconds);
}

export async function markEmailBurst(ip: string, ttlSeconds = 30) {
  const normalized = ip.trim() || "anonymous";
  await setCachedJson(`email:burst:${normalized}`, "1", ttlSeconds);
}
