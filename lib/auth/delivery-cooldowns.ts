import { hasCooldownKey, setCachedJson } from "@/lib/cache-redis";

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export async function isOtpCooldownActive(email: string) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return hasCooldownKey(`otp:cooldown:${normalized}`);
}

/** Legacy IP burst — avoid for Supabase send-email hook (shared egress IP). */
export async function isEmailBurstActive(ip: string) {
  const normalized = ip.trim() || "anonymous";
  return hasCooldownKey(`email:burst:${normalized}`);
}

/** Per-recipient burst for auth hook delivery (Supabase shares one egress IP). */
export async function isEmailBurstActiveForRecipient(email: string) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return hasCooldownKey(`email:burst:recipient:${normalized}`);
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

export async function markEmailBurstForRecipient(email: string, ttlSeconds = 60) {
  const normalized = normalizeEmail(email);
  if (!normalized) return;
  await setCachedJson(`email:burst:recipient:${normalized}`, "1", ttlSeconds);
}
