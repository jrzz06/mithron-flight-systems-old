import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
const BLOCKED_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

export function normalizeExternalUrl(value: string) {
  return value.trim();
}

export function isValidExternalUrl(value: string) {
  const normalized = normalizeExternalUrl(value);
  if (!normalized || normalized.length > 1000) return false;

  // Internal storefront paths (layman CMS redirect links).
  if (normalized.startsWith("/") && !normalized.startsWith("//")) {
    return normalized.length <= 500;
  }

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    if (!parsed.hostname || BLOCKED_HOSTS.has(parsed.hostname.toLowerCase())) return false;
    return true;
  } catch {
    return false;
  }
}

export function assertValidExternalUrl(value: string) {
  const normalized = normalizeExternalUrl(value);
  if (!isValidExternalUrl(normalized)) {
    throw new Error("Enter a valid redirect link (https://… or /path).");
  }
  return normalized;
}

export async function probeExternalUrl(value: string, timeoutMs = 6000) {
  const normalized = assertValidExternalUrl(value);
  if (normalized.startsWith("/") && !normalized.startsWith("//")) {
    return normalized;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchWithTimeout(normalized, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "MithronPressCoverageValidator/1.0"
      }
    });
    if (response.status >= 400 && response.status !== 405) {
      const getResponse = await fetchWithTimeout(normalized, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent": "MithronPressCoverageValidator/1.0"
        }
      });
      if (getResponse.status >= 400) {
        throw new Error(`URL responded with status ${getResponse.status}.`);
      }
    }
    return normalized;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("URL responded")) {
      throw error;
    }
    throw new Error("Could not reach the external article URL. Check the link and try again.");
  } finally {
    clearTimeout(timeout);
  }
}
