export type GeminiModelProfile = {
  id: string;
  label: string;
  googleRpm: number;
  googleRpd: number;
  googleTpm: number | null;
};

export const GEMINI_MODEL_PROFILES: Record<string, GeminiModelProfile> = {
  "gemini-3.1-flash-lite": {
    id: "gemini-3.1-flash-lite",
    label: "Gemini 3.1 Flash Lite",
    googleRpm: 15,
    googleRpd: 500,
    googleTpm: 250_000
  },
  "gemma-4-26b-a4b-it": {
    id: "gemma-4-26b-a4b-it",
    label: "Gemma 4 26B",
    googleRpm: 15,
    googleRpd: 1500,
    googleTpm: null
  },
  "gemma-4-31b-it": {
    id: "gemma-4-31b-it",
    label: "Gemma 4 31B",
    googleRpm: 15,
    googleRpd: 1500,
    googleTpm: null
  }
};

/** Default for catalog batch + editor text: higher daily quota, unlimited TPM. */
export const DEFAULT_GEMINI_TEXT_MODEL = "gemma-4-26b-a4b-it";
export const DEFAULT_GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image";

export function normalizeGeminiModelId(model: string) {
  return model.trim().toLowerCase();
}

export function resolveGeminiModelProfile(model: string): GeminiModelProfile {
  const normalized = normalizeGeminiModelId(model);
  const known = GEMINI_MODEL_PROFILES[normalized];
  if (known) return known;

  return {
    id: model,
    label: model,
    googleRpm: 12,
    googleRpd: 400,
    googleTpm: 200_000
  };
}

export type GeminiConservativeLimits = {
  rpm: number;
  rpd: number;
  tpm: number | null;
  minIntervalMs: number;
};

export function resolveGeminiConservativeLimits(
  model: string,
  env: Record<string, string | undefined> = process.env
): GeminiConservativeLimits {
  const profile = resolveGeminiModelProfile(model);
  const margin = Number(env.GEMINI_RATE_LIMIT_MARGIN ?? "0.8");
  const safeMargin = Number.isFinite(margin) && margin > 0 && margin <= 1 ? margin : 0.8;
  const minIntervalMs = Number(env.GEMINI_MIN_REQUEST_INTERVAL_MS ?? "5000");
  const safeInterval = Number.isFinite(minIntervalMs) && minIntervalMs >= 0 ? minIntervalMs : 5000;

  return {
    rpm: Math.max(1, Math.floor(profile.googleRpm * safeMargin)),
    rpd: Math.max(1, Math.floor(profile.googleRpd * safeMargin)),
    tpm: profile.googleTpm ? Math.max(1000, Math.floor(profile.googleTpm * safeMargin)) : null,
    minIntervalMs: safeInterval
  };
}

export function estimateGeminiTokens(...parts: Array<string | null | undefined>) {
  const chars = parts.map((part) => String(part ?? "")).join("").length;
  return Math.max(1, Math.ceil(chars / 4));
}
